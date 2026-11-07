import { createApp, type GameServices } from './api/app.js';
import { readConfig } from './config.js';
import { connectFirebase } from './data/firebase.js';
import { GameService } from './services/game-service.js';
import { ProfileService } from './services/profile-service.js';
import { MarketInsightsService } from './services/market-insights.js';
import { DailyQuizService } from './services/daily-quiz.js';
import { PerformanceService } from './services/performance-service.js';
import { BankIsraelService } from './services/bank-israel.js';
import { loadDatasetRegistry } from './world/loader.js';
import { WorldClockService } from './services/world-clock.js';
import { scopedStore } from './data/scoped-store.js';
import type { DocumentStore } from './data/store.js';
import { readGameTime } from './domain/clock.js';
import { TestSimulationService } from './services/test-simulation-service.js';
import type { DatasetRegistry } from './world/registry.js';

const config = readConfig();
const firebase = connectFirebase(config);
const datasets = await loadDatasetRegistry();
function gameServices(store: DocumentStore, registry: DatasetRegistry = datasets): GameServices {
  const game = new GameService(store, registry);
  return {
    game,
    clock: new WorldClockService(store, game, registry, { autostart: config.WORLD_CLOCK_AUTOSTART === 'true' }),
    insights: new MarketInsightsService(store, registry),
    quiz: new DailyQuizService(store, {
      // the question follows the game's israel calendar day, not the last price event.
      gameTime: (world, tx) => readGameTime(tx, world, registry.get(world.datasetId).endsAt, Date.now()),
    }),
    performance: new PerformanceService(store, registry),
  };
}
const services = gameServices(firebase.store);
const game = services.game;
const profile = new ProfileService(firebase.store);
const testRealms = new Map<string, Promise<GameServices>>();
function testRealmServices(uid: string): Promise<GameServices> {
  let services = testRealms.get(uid);
  if (!services) {
    services = (async () => {
      const store = scopedStore(firebase.store, `testRealms/${uid}/`);
      const registry = datasets.fork();
      const simulations = new TestSimulationService(store, registry);
      await simulations.hydrate();
      return { ...gameServices(store, registry), simulations };
    })().catch(error => {
      testRealms.delete(uid);
      throw error;
    });
    testRealms.set(uid, services);
  }
  return services;
}
const bankIsrael = new BankIsraelService();
// fail at startup if credentials or the saved world's dataset do not match.
const initialWorld = await game.getWorld();
const app = createApp({
  ...services,
  testRealmServices,
  profile,
  bankIsrael,
  verifyToken: firebase.verifyToken,
  adminUids: config.adminUids,
  corsOrigins: config.corsOrigins,
});
const server = app.listen(config.PORT, config.HOST, () => {
  process.stdout.write(
    `${JSON.stringify({ event: 'listening', host: config.HOST, port: config.PORT, dataMode: initialWorld.source })}\n`,
  );
});

// stop accepting requests and let the current transaction finish.
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
