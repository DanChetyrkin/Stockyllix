import { readConfig } from '../config.js';
import { connectFirebase } from '../data/firebase.js';
import { GameService } from '../services/game-service.js';
import { loadDataset } from '../world/loader.js';

const config = readConfig();
const { store } = connectFirebase(config);
const game = new GameService(store, await loadDataset());
const world = await game.getWorld();
process.stdout.write(`${JSON.stringify({ event: 'world_ready', world })}\n`);
