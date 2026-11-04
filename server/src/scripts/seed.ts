import { readConfig } from '../config.js';
import { connectFirebase } from '../data/firebase.js';
import { GameService } from '../services/game-service.js';
import { loadDatasetRegistry } from '../world/loader.js';

const config = readConfig();
const { store } = connectFirebase(config);
const game = new GameService(store, await loadDatasetRegistry());
const world = await game.getWorld();
process.stdout.write(`${JSON.stringify({ event: 'world_ready', world })}\n`);
