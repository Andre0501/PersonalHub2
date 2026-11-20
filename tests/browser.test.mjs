import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { startLab, serveWeb } from '../scripts/local-lab.mjs';
import { demoAccounts } from '../scripts/demo.mjs';
test(
  'Chromium percorre aceite, publicação da ficha, execução, peso e revogação pela interface',
  { timeout: 90000 },
  async () => {
    const lab = await startLab();
    let stopWeb, browser;
    try {
      const accounts = await demoAccounts(lab);
      stopWeb = await serveWeb(
        lab,
        accounts.map(({ label, email, password }) => ({ label, email, password })),
      );
      browser = await chromium.launch({
        ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        headless: true,
      });
      const page = await browser.newPage({ viewport: { width: 420, height: 850 }, locale: 'pt-BR' });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.setDefaultTimeout(6000);
      const button = (name) => page.getByRole('button', { name, exact: true });
      await page.goto(lab.webOrigin);
      await button('Entrar como Lia (aluna)').click();
      await page.getByText('Convite de Ana', { exact: true }).waitFor();
      await page.getByLabel('Li e autorizo o compartilhamento com Ana.').check();
      await button('Aceitar convite').click();
      await button('Revogar acesso').waitFor();
      await button('Sair').click();
      await button('Entrar como Ana (personal)').click();
      await page.getByLabel('Nome do exercício').fill('Remada baixa');
      await button('Cadastrar exercício').click();
      await page.getByLabel('Título da ficha').fill('Ficha da Lia');
      await button('Criar rascunho').click();
      await button('Publicar ficha').click();
      await page.getByText('Ficha publicada.', { exact: true }).waitFor();
      await button('Sair').click();
      await button('Entrar como Lia (aluna)').click();
      await button('Iniciar treino').click();
      await button('Registrar séries').click();
      await page.getByLabel('Repetições realizadas').nth(0).fill('10');
      await page.getByLabel('Carga realizada em kg').nth(0).fill('12.5');
      await page.getByLabel('Série pulada').nth(1).check();
      await button('Concluir treino').click();
      await page.getByText('Treino registrado.', { exact: true }).waitFor();
      await page.getByLabel('Peso em kg', { exact: true }).fill('73.25');
      await page.getByLabel('Data e hora da medição').fill('2026-11-19T08:30');
      await button('Registrar peso').click();
      await page.getByText(/73,25 kg/).waitFor();
      page.once('dialog', (d) => d.accept());
      await button('Revogar acesso').click();
      await page.getByText('Vínculo encerrado.', { exact: true }).waitFor();
      assert.ok(await button('Iniciar treino').isVisible());
      await button('Sair').click();
      await button('Entrar como Ana (personal)').click();
      await page.getByRole('heading', { name: 'Ana', exact: true }).waitFor();
      assert.equal(await page.getByText(/73,25 kg/).count(), 0);
      assert.equal(await page.getByRole('heading', { name: /Peso de/ }).count(), 0);
      assert.deepEqual(errors, []);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      const cached = await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        const result = [];
        for (const k of await caches.keys()) {
          const entries = await (await caches.open(k)).keys();
          result.push(...entries.map((r) => new URL(r.url).pathname));
        }
        return result;
      });
      assert.deepEqual(cached, ['/offline.html']);
    } finally {
      await browser?.close();
      if (stopWeb) await stopWeb();
      await lab.stop();
    }
  },
);
