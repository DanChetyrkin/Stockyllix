import { createApp } from './api/app.js';
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

const config = readConfig();
const firebase = connectFirebase(config);
const datasets = await loadDatasetRegistry();
const dataset = datasets.get(datasets.defaultId);
const game = new GameService(firebase.store, datasets);
const profile = new ProfileService(firebase.store);
const insights = new MarketInsightsService(firebase.store, datasets);
const quiz = new DailyQuizService(firebase.store);
const performance = new PerformanceService(firebase.store, datasets);
const bankIsrael = new BankIsraelService();
const currentMarket = config.CURRENT_MARKET_ACCESS === 'disabled' ? undefined : new CurrentMarketService({ store: firebase.store,
  instruments: dataset.instruments, automatedAccessAuthorized: config.YAHOO_AUTOMATED_ACCESS_AUTHORIZED === 'true' });
const news = config.NEWS_ACCESS === 'disabled' || !config.ALPHA_VANTAGE_API_KEY?.trim() ? undefined : new NewsService({ store: firebase.store, instruments: dataset.instruments, apiKey: config.ALPHA_VANTAGE_API_KEY });
// fail startup if credentials or the persisted dataset do not match
const initialWorld = await game.getWorld();
const app = createApp({ game, profile, insights, quiz, performance, bankIsrael, currentMarket, news,
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
