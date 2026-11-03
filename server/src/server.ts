import { createApp } from './api/app.js';
import { readConfig } from './config.js';
import { connectFirebase } from './data/firebase.js';
import { GameService } from './services/game-service.js';
import { loadDataset } from './world/loader.js';

const config = readConfig();
const firebase = connectFirebase(config);
const dataset = await loadDataset();
const game = new GameService(firebase.store, dataset);
const app = createApp({ game, verifyToken: firebase.verifyToken, adminUids: config.adminUids, corsOrigins: config.corsOrigins });
const server = app.listen(config.PORT, config.HOST, () => {
  process.stdout.write(`${JSON.stringify({ event: 'listening', host: config.HOST, port: config.PORT, dataMode: dataset.source })}\n`);
});

// stop accepting requests and let the current transaction finish
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
