import { fork } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, cert, deleteApp, initializeApp, type App, type ServiceAccount } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { ECB_REPLAY_CACHE_PATH, validateEcbReplayCache, type EcbReplayCache } from './ecb-replay.js';

export interface PrivateFxCache {
  read(): Promise<unknown>;
  create(value: EcbReplayCache): Promise<void>;
}

interface WorkerMessage {
  operation: 'read' | 'create';
  value?: EcbReplayCache;
}
interface WorkerReply {
  ok: boolean;
  value?: unknown;
}

// a process deadline also stops SDK retries; terminate() alone waits for active RPCs.
export function privateFxCache(timeoutMs = 8000): PrivateFxCache {
  const run = (message: WorkerMessage): Promise<unknown> =>
    new Promise((resolveResult, reject) => {
      if (!process.env.FIREBASE_PROJECT_ID) {
        reject(new Error('PRIVATE_CACHE_NOT_CONFIGURED'));
        return;
      }
      const worker = fork(fileURLToPath(import.meta.url), ['--cache-worker'], {
        stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      });
      let reply: WorkerReply | undefined;
      const timer = setTimeout(() => {
        worker.kill();
        reject(new Error('PRIVATE_CACHE_TIMEOUT'));
      }, timeoutMs);
      worker.on('message', value => {
        reply = value as WorkerReply;
      });
      worker.once('error', () => {
        clearTimeout(timer);
        reject(new Error('PRIVATE_CACHE_UNAVAILABLE'));
      });
      worker.once('exit', () => {
        clearTimeout(timer);
        if (reply?.ok) resolveResult(reply.value);
        else reject(new Error('PRIVATE_CACHE_UNAVAILABLE'));
      });
      worker.send(message);
    });
  return {
    read: () => run({ operation: 'read' }),
    create: async value => {
      await run({ operation: 'create', value });
    },
  };
}

async function cacheWorker(message: WorkerMessage) {
  let app: App | undefined;
  let database: Firestore | undefined;
  let reply: WorkerReply;
  try {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    if (!projectId || (process.env.FIRESTORE_EMULATOR_HOST && !projectId.startsWith('demo-')))
      throw new Error('Invalid cache project');
    const credential = process.env.FIREBASE_SERVICE_ACCOUNT
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount)
      : process.env.FIRESTORE_EMULATOR_HOST
        ? undefined
        : applicationDefault();
    app = initializeApp({ projectId, ...(credential ? { credential } : {}) }, 'ecb-build-cache');
    database = getFirestore(app);
    const document = database.doc(ECB_REPLAY_CACHE_PATH);
    if (message.operation === 'create') {
      validateEcbReplayCache(message.value);
      try {
        await document.create(message.value!);
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 6)) throw error;
        validateEcbReplayCache((await document.get()).data());
      }
      reply = { ok: true };
    } else if (message.operation === 'read') reply = { ok: true, value: (await document.get()).data() ?? null };
    else throw new Error('Invalid cache operation');
  } catch {
    reply = { ok: false };
  } finally {
    await database?.terminate().catch(() => undefined);
    if (app) await deleteApp(app).catch(() => undefined);
  }
  process.send?.(reply);
  process.disconnect?.();
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url) &&
  process.argv[2] === '--cache-worker' &&
  process.send
) {
  process.once('message', message => {
    void cacheWorker(message as WorkerMessage);
  });
}
