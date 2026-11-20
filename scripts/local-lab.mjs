import { createServer } from 'node:http';
import { createServer as socket } from 'node:net';
import { execFile as execCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
const exec = promisify(execCallback);
const root = fileURLToPath(new URL('../', import.meta.url));
async function listen(server, port = 0) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  return server.address().port;
}
const shutdown = (server) =>
  new Promise((resolve) => {
    server.close(resolve);
    server.closeIdleConnections?.();
  });
async function availablePort() {
  const s = socket();
  const port = await listen(s);
  await shutdown(s);
  return port;
}
export async function startLab() {
  if (process.env.NODE_ENV === 'production') throw new Error('O laboratório exige ambiente local.');
  const dir = await mkdtemp(join(tmpdir(), 'personalhub-'));
  const port = await availablePort(),
    secret = randomBytes(20).toString('hex');
  const pg = new EmbeddedPostgres({
    databaseDir: join(dir, 'pg'),
    port,
    user: 'postgres',
    password: secret,
    authMethod: 'scram-sha-256',
    persistent: false,
    autoRehydrateSymlinks: true,
    postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'unix_socket_directories='],
    initdbFlags: ['--locale=C', '--encoding=UTF8'],
    onLog(line) {
      if (process.env.LAB_DEBUG && /FATAL|ERROR|PANIC/.test(line)) console.error(line);
    },
    onError() {},
  });
  let admin,
    auth,
    api,
    pgStarted = false;
  try {
    await pg.initialise();
    await pg.start();
    pgStarted = true;
    const ownerUrl = 'postgresql://postgres:' + secret + '@127.0.0.1:' + port + '/postgres';
    const runtimeSecret = randomBytes(20).toString('hex');
    admin = new Client({ connectionString: ownerUrl });
    await admin.connect();
    await exec(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root,
      env: { ...process.env, DIRECT_DATABASE_URL: ownerUrl, DATABASE_URL: ownerUrl },
    });
    // This whole database is disposable. Secrets are generated locally as hex.
    await admin.query("CREATE ROLE personalhub_api LOGIN PASSWORD '" + runtimeSecret + "'");
    await admin.query(await readFile(join(root, 'scripts/runtime-grants.sql'), 'utf8'));
    const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'local-test', alg: 'ES256', use: 'sig' };
    const identities = new Map();
    let issuer;
    async function token(account, overrides = {}) {
      return new SignJWT({
        sub: account.sub,
        email: account.email,
        role: 'authenticated',
        is_anonymous: false,
        aud: 'authenticated',
        iss: issuer,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...overrides,
      })
        .setProtectedHeader({ alg: 'ES256', kid: 'local-test' })
        .sign(privateKey);
    }
    const webPort = await availablePort();
    const webOrigin = 'http://127.0.0.1:' + webPort;
    auth = createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', webOrigin);
      res.setHeader(
        'Access-Control-Allow-Headers',
        'apikey, authorization, content-type, x-client-info, x-supabase-api-version',
      );
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'application/json');
      if (req.method === 'OPTIONS') {
        res.writeHead(204).end();
        return;
      }
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/auth/v1/.well-known/jwks.json') {
        res.end(JSON.stringify({ keys: [jwk] }));
        return;
      }
      if (url.pathname === '/auth/v1/logout') {
        res.end('{}');
        return;
      }
      if (
        url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'password' &&
        req.method === 'POST'
      ) {
        try {
          const parts = [];
          let bytes = 0;
          for await (const part of req) {
            bytes += part.length;
            if (bytes > 4096) throw Error();
            parts.push(part);
          }
          const body = JSON.parse(Buffer.concat(parts).toString());
          const acc = identities.get(body.email);
          if (acc && acc.password === body.password) {
            res.end(
              JSON.stringify({
                access_token: await token(acc),
                refresh_token: randomUUID(),
                token_type: 'bearer',
                expires_in: 3600,
                user: {
                  id: acc.sub,
                  email: acc.email,
                  aud: 'authenticated',
                  role: 'authenticated',
                  app_metadata: { provider: 'email' },
                  user_metadata: {},
                  identities: [],
                  created_at: new Date().toISOString(),
                },
              }),
            );
            return;
          }
        } catch {
          /* Invalid test credential. */
        }
        res
          .writeHead(400)
          .end(
            JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Credencial de demonstração inválida.',
            }),
          );
        return;
      }
      res.writeHead(404).end(JSON.stringify({ message: 'Rota indisponível no emissor de teste.' }));
    });
    const authPort = await listen(auth);
    const supabaseUrl = 'http://127.0.0.1:' + authPort;
    issuer = supabaseUrl + '/auth/v1';
    process.env.DATABASE_URL =
      'postgresql://personalhub_api:' + runtimeSecret + '@127.0.0.1:' + port + '/postgres';
    process.env.SUPABASE_URL = supabaseUrl;
    process.env.WEB_ORIGIN = webOrigin;
    process.env.AUDIT_HMAC_KEY = randomBytes(32).toString('hex');
    const { createApp } = await import('../build/apps/api/src/app.js');
    api = await createApp(true);
    await api.listen(0, '127.0.0.1');
    const apiUrl = (await api.getUrl()) + '/v1';
    async function request(actor, method, path, body, key = randomUUID()) {
      const bearer = typeof actor === 'string' ? actor : actor ? await token(actor) : null;
      const headers = {
        ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}),
        ...(key ? { 'Idempotency-Key': key } : {}),
      };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetch(apiUrl + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await response.json();
      return { status: response.status, data };
    }
    function identity(label = 'usuario') {
      const sub = randomUUID();
      const account = {
        sub,
        email: label + '-' + sub.slice(0, 8) + '@example.test',
        password: randomBytes(14).toString('hex'),
      };
      identities.set(account.email, account);
      return account;
    }
    async function stop() {
      try {
        await api?.close();
      } finally {
        try {
          await shutdown(auth);
        } finally {
          try {
            await admin?.end();
          } finally {
            await pg.stop();
            await rm(dir, { recursive: true, force: true });
          }
        }
      }
    }
    return { apiUrl, supabaseUrl, webPort, webOrigin, admin, request, token, identity, stop, ownerUrl };
  } catch (error) {
    if (api) await api.close().catch(() => {});
    if (auth?.listening) await shutdown(auth);
    if (admin) await admin.end().catch(() => {});
    if (pgStarted) await pg.stop().catch(() => {});
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}
export async function serveWeb(lab, accounts = []) {
  const dist = join(root, 'apps/web/dist');
  const config = {
    apiUrl: lab.apiUrl,
    supabaseUrl: lab.supabaseUrl,
    publicKey: 'demo-local-public-key',
    accounts,
  };
  const types = {
    js: 'text/javascript',
    html: 'text/html; charset=utf-8',
    css: 'text/css',
    webmanifest: 'application/manifest+json',
    svg: 'image/svg+xml',
  };
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, lab.webOrigin).pathname;
    if (path === '/runtime-config.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end('window.__PERSONALHUB__=' + JSON.stringify(config));
      return;
    }
    if (
      !(
        path === '/' ||
        /^\/(?:assets\/[\w.-]+|index\.html|offline\.html|sw\.js|manifest\.webmanifest)$/.test(path)
      )
    ) {
      res.writeHead(404).end();
      return;
    }
    const name = path === '/' ? 'index.html' : path.slice(1);
    try {
      const bytes = await readFile(join(dist, name));
      res.setHeader('Content-Type', types[name.split('.').pop()] ?? 'application/octet-stream');
      res.end(bytes);
    } catch {
      res.writeHead(404).end();
    }
  });
  await listen(server, lab.webPort);
  return () => shutdown(server);
}
