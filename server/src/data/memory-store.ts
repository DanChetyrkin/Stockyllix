import type { DocumentStore, ListOptions, Transaction } from './store.js';

// this adapter is for deterministic tests, not cloud persistence
export class MemoryStore implements DocumentStore {
  private documents = new Map<string, unknown>();
  private queue: Promise<unknown> = Promise.resolve();
  readonly operations = { reads: 0, writes: 0, transactions: 0, queries: 0 };

  async get<T>(path: string): Promise<T | undefined> {
    this.operations.reads += 1;
    return structuredClone(this.documents.get(path)) as T | undefined;
  }

  async list<T>(collection: string, options: ListOptions = {}) {
    this.operations.queries += 1;
    const prefix = `${collection}/`;
    let rows = [...this.documents.entries()]
      .filter(([path]) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map(([path, data]) => ({ id: path.slice(prefix.length), data: structuredClone(data) as T }));
    const field = options.orderBy ?? '__name__';
    const value = (row: { id: string; data: T }): string | number => field === '__name__'
      ? row.id : (row.data as Record<string, string | number>)[field]!;
    for (const [key, operation, expected] of options.where ?? []) {
      rows = rows.filter((row) => {
        const actual = (row.data as Record<string, string | number>)[key]!;
        switch (operation) {
          case '==': return actual === expected;
          case '<': return actual < expected;
          case '<=': return actual <= expected;
          case '>': return actual > expected;
        }
      });
    }
    const direction = options.direction === 'desc' ? -1 : 1;
    rows.sort((a, b) => value(a) < value(b) ? -direction : value(a) > value(b) ? direction : 0);
    if (options.startAfter !== undefined) {
      const after = options.startAfter;
      rows = rows.filter((row) => direction === 1 ? value(row) > after : value(row) < after);
    }
    rows = rows.slice(0, options.limit ?? rows.length);
    this.operations.reads += rows.length;
    return rows;
  }

  async transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      this.operations.transactions += 1;
      const changes = new Map<string, unknown>();
      let writing = false;
      const result = await work({
        get: async <V>(path: string) => {
          if (writing) throw new Error('transaction reads must precede writes');
          return this.get<V>(path);
        },
        set: <V>(path: string, value: V) => {
          writing = true;
          changes.set(path, structuredClone(value));
        },
      });
      for (const [path, value] of changes) this.documents.set(path, value);
      this.operations.writes += changes.size;
      return result;
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
