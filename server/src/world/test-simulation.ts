import { createHash } from 'node:crypto';
import { DateTime } from 'luxon';
import { GameError } from '../domain/errors.js';
import { createDataset, WORLD_ZONE } from './index.js';

export interface TestSimulationDescriptor {
  generatorVersion: 1;
  startDate: string;
  days: 28;
  seed: string;
  datasetId: string;
}

export function validateSimulationDate(date: string) {
  const parsed = DateTime.fromISO(date, { zone: WORLD_ZONE });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !parsed.isValid || parsed.toISODate() !== date || parsed.year < 2000 || parsed.year > 2099) {
    throw new GameError('INVALID_SIMULATION_DATE', 'Choose a valid test start date from 2000 through 2099.', 400);
  }
}

// this version reuses the price engine, but never shifts historical market data.
export function createTestSimulation(startDate: string, seed: string) {
  validateSimulationDate(startDate);
  if (!/^[a-f0-9]{64}$/.test(seed)) throw new Error('A private test simulation seed is required');
  const generated = createDataset(seed, undefined, { startDate, days: 28 });
  const digest = createHash('sha256').update(JSON.stringify(generated)).digest('hex').slice(0, 24);
  const dataset = { ...generated, id: `test-sim-v1-${startDate}-${digest}` };
  const descriptor: TestSimulationDescriptor = { generatorVersion: 1, startDate, days: 28, seed, datasetId: dataset.id };
  return { dataset, descriptor };
}

export function restoreTestSimulation(descriptor: TestSimulationDescriptor) {
  if (descriptor.generatorVersion !== 1 || descriptor.days !== 28) throw new Error('Unsupported test simulation version');
  const rebuilt = createTestSimulation(descriptor.startDate, descriptor.seed);
  if (rebuilt.dataset.id !== descriptor.datasetId) throw new Error('The saved test simulation does not match its original prices');
  return rebuilt.dataset;
}
