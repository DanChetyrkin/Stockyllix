export interface Transaction {
  get<T>(path: string): Promise<T | undefined>;
  set<T>(path: string, value: T): void;
}

export interface ListOptions {
  limit?: number;
  orderBy?: string;
  direction?: 'asc' | 'desc';
  startAfter?: string | number;
  where?: [string, '==' | '<' | '<=' | '>', string | number][];
}

export interface DocumentStore {
  get<T>(path: string): Promise<T | undefined>;
  list<T>(collection: string, options?: ListOptions): Promise<{ id: string; data: T }[]>;
  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T>;
}
