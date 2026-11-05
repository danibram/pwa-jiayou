import { LEARNING_DB_VERSION, upgrade } from './schema';

/** Resolves with the request's result. Awaiting it inside a transaction keeps the transaction alive. */
export const request = <T>(req: IDBRequest<T>): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new DOMException('Request failed', 'UnknownError'));
  });

export const openDatabase = (factory: IDBFactory, name: string): Promise<IDBDatabase> =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const req = factory.open(name, LEARNING_DB_VERSION);
    req.onupgradeneeded = (event) => upgrade(req.result, event.oldVersion);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new DOMException('Could not open the learning database', 'UnknownError'));
    // Another tab holds an older version open. Its `onversionchange` closes it and this open goes on.
    req.onblocked = () => {};
  });

export const deleteDatabase = (factory: IDBFactory, name: string): Promise<void> =>
  new Promise<void>((resolve, reject) => {
    const req = factory.deleteDatabase(name);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new DOMException('Could not delete the learning database', 'UnknownError'));
    req.onblocked = () => {};
  });

/**
 * Runs `body` in one transaction and resolves once it commits. `body` may await only requests of
 * `tx`: any other await lets the transaction auto-commit halfway. If `body` throws, the transaction
 * is aborted, so nothing it queued is kept. The first error wins: a request's QuotaExceededError is
 * reported as such, not as the AbortError the transaction raises after it.
 */
export const transaction = async <T>(
  db: IDBDatabase,
  stores: readonly string[],
  mode: IDBTransactionMode,
  body: (tx: IDBTransaction) => Promise<T>,
): Promise<T> => {
  const tx = db.transaction([...stores], mode);
  let failure: unknown;
  const finished = new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure ?? tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
  });
  // Observed below; this only keeps an early abort from being reported as unhandled.
  finished.catch(() => {});
  // A request nobody awaits (a put) bubbles its error here before the next awaited request
  // rejects with a plain AbortError; keep the real cause, such as QuotaExceededError.
  tx.onerror = (event) => {
    failure ??= (event.target as IDBRequest | null)?.error ?? tx.error;
  };
  let result: T;
  try {
    result = await body(tx);
  } catch (error) {
    failure ??= error;
    try {
      tx.abort();
    } catch {
      // Already aborted by the failed request, or finished.
    }
    await finished.catch(() => {});
    throw failure;
  }
  await finished;
  return result;
};
