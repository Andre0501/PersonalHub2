import { createApp } from './app.js';
const app = await createApp();
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT || 3008), process.env.HOST || '127.0.0.1');
