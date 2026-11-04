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
import { CurrentMarketService } from './feeds/current-market.js';
import { NewsService } from './feeds/news.js';
import { WorldClockService } from './services/world-clock.js';
import { scopedStore } from './data/scoped-store.js';
import type { DocumentStore } from './data/store.js';
import { clockPath, clockTarget, type WorldClock } from './domain/clock.js';

const config = readConfig();
const firebase = connectFirebase(config);
const datasets = await loadDatasetRegistry();
const dataset = datasets.get(datasets.defaultId);
function gameServices(store: DocumentStore): GameServices {
  const game = new GameService(store, datasets);
  return { game, clock: new WorldClockService(store, game, datasets, { autostart: config.WORLD_CLOCK_AUTOSTART === 'true' }),
    insights: new MarketInsightsService(store, datasets), quiz: new DailyQuizService(store, {
      gameTime: async (world, tx) => {
        const clock = await tx.get<WorldClock>(clockPath(world.id));
        return clock ? clockTarget(clock, world, datasets.get(world.datasetId).endsAt, Date.now()) : world.now;
      },
    }),
    performance: new PerformanceService(store, datasets) };
}
const services = gameServices(firebase.store);
const game = services.game;
const profile = new ProfileService(firebase.store);
const testRealms = new Map<string, GameServices>();
function testRealmServices(uid: string): GameServices {
  let services = testRealms.get(uid);
  if (!services) {
    services = gameServices(scopedStore(firebase.store, `testRealms/${uid}/`));
    testRealms.set(uid, services);
  }
  return services;
}
const bankIsrael = new BankIsraelService();
const currentMarket = config.CURRENT_MARKET_ACCESS === 'disabled' ? undefined : new CurrentMarketService({ store: firebase.store,
  instruments: dataset.instruments, automatedAccessAuthorized: config.YAHOO_AUTOMATED_ACCESS_AUTHORIZED === 'true' });
const news = config.NEWS_ACCESS === 'disabled' || !config.ALPHA_VANTAGE_API_KEY?.trim() ? undefined : new NewsService({ store: firebase.store, instruments: dataset.instruments, apiKey: config.ALPHA_VANTAGE_API_KEY });
// fail startup if credentials or the persisted dataset do not match
const initialWorld = await game.getWorld();
const app = createApp({ ...services, testRealmServices, profile, bankIsrael, currentMarket, news,
  currentMarketAccess: config.CURRENT_MARKET_ACCESS, newsAccess: config.NEWS_ACCESS,
  verifyToken: firebase.verifyToken, adminUids: config.adminUids, corsOrigins: config.corsOrigins });
const server = app.listen(config.PORT, config.HOST, () => {
  process.stdout.write(`${JSON.stringify({ event: 'listening', host: config.HOST, port: config.PORT, dataMode: initialWorld.source })}\n`);
});

// stop accepting requests and let the current transaction finish
function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
