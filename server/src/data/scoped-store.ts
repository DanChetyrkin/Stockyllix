import type { DocumentStore } from './store.js';

// isolated test worlds share no game documents with the public league.
export function scopedStore(store: DocumentStore, prefix: string): DocumentStore {
  return {
    get: path => store.get(prefix + path),
    list: (path, options) => store.list(prefix + path, options),
    transaction: work =>
      store.transaction(tx =>
        work({
          get: path => tx.get(prefix + path),
          set: (path, value) => tx.set(prefix + path, value),
        }),
      ),
  };
}
