import { FieldPath, type Firestore, type Query } from 'firebase-admin/firestore';
import type { DocumentStore, ListOptions, Transaction } from './store.js';

export class FirestoreStore implements DocumentStore {
  constructor(private readonly firestore: Firestore) {}

  async get<T>(path: string): Promise<T | undefined> {
    const document = await this.firestore.doc(path).get();
    return document.exists ? document.data() as T : undefined;
  }

  async list<T>(collection: string, options: ListOptions = {}) {
    let query: Query = this.firestore.collection(collection);
    for (const [field, operator, value] of options.where ?? []) {
      query = query.where(field, operator, value);
    }
    const field = options.orderBy && options.orderBy !== '__name__'
      ? options.orderBy : FieldPath.documentId();
    query = query.orderBy(field, options.direction ?? 'asc');
    if (options.startAfter !== undefined) query = query.startAfter(options.startAfter);
    if (options.limit !== undefined) query = query.limit(options.limit);
    const snapshot = await query.get();
    return snapshot.docs.map((document) => ({ id: document.id, data: document.data() as T }));
  }

  transaction<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    return this.firestore.runTransaction(async (transaction) => work({
      get: async <V>(path: string) => {
        const document = await transaction.get(this.firestore.doc(path));
        return document.exists ? document.data() as V : undefined;
      },
      set: (path, value) => {
        transaction.set(this.firestore.doc(path), value as Record<string, unknown>);
      },
    }));
  }
}
