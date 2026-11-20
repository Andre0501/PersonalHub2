import { startLab, serveWeb } from './local-lab.mjs';
import { demoAccounts } from './demo.mjs';
const lab = await startLab();
let stopWeb;
try {
  const accounts = await demoAccounts(lab);
  stopWeb = await serveWeb(
    lab,
    accounts.map(({ label, email, password }) => ({ label, email, password })),
  );
  console.log('Demonstração local do PersonalHub: ' + lab.webOrigin);
  console.log('Abra esse endereço e escolha uma das três contas fictícias. Ctrl+C encerra a demonstração.');
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await stopWeb();
    await lab.stop();
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
} catch (error) {
  if (stopWeb) await stopWeb();
  await lab.stop();
  throw error;
}
