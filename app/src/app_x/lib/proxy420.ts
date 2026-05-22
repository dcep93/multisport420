const PROXY_URL = "https://proxy420.appspot.com/";

const CACHE_DB_NAME = "multisport420.proxy420";
const CACHE_STORE_NAME = "responses";

type ProxyFetchTextArgs = {
  url: string;
  options?: RequestInit;
  localMaxAgeMs?: number;
  remoteMaxAgeMs?: number;
};

type CacheEntry = {
  key: string;
  text: string;
  fetchedAt: number;
};

export async function fetchTextThroughProxy(request: ProxyFetchTextArgs) {
  const cacheKey = getCacheKey(request);
  const cachedText = await getCachedText(cacheKey, request.localMaxAgeMs).catch(() => undefined);
  if (cachedText !== undefined) {
    return cachedText;
  }

  const response = await fetch(PROXY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      maxAgeMs: request.remoteMaxAgeMs,
      url: request.url,
      options: request.options,
    }),
  });

  if (!response.ok) {
    throw new Error(`Proxy request failed with status ${response.status}.`);
  }

  const text = await response.text();

  await putCachedText(cacheKey, text).catch(() => undefined);

  return text;
}

export async function clearProxyCache() {
  if (typeof indexedDB === "undefined") {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(CACHE_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("IndexedDB delete blocked."));
  });
}

export async function getApproximateProxyCacheSizeBytes() {
  if (typeof indexedDB === "undefined") {
    return 0;
  }

  const entries = await withStore("readonly", (store) =>
    requestToPromise(store.getAll() as IDBRequest<CacheEntry[]>),
  );

  return entries.reduce(
    (total, entry) => total + entry.key.length * 2 + entry.text.length * 2 + 16,
    0,
  );
}

function getCacheKey(request: ProxyFetchTextArgs) {
  return JSON.stringify({
    url: request.url,
    options: normalizeOptions(request.options),
  });
}

function normalizeOptions(options: RequestInit | undefined) {
  if (!options) return null;

  const normalizedHeaders =
    options.headers instanceof Headers
      ? Object.fromEntries(options.headers.entries())
      : Array.isArray(options.headers)
        ? Object.fromEntries(options.headers)
        : options.headers ?? null;

  return {
    ...options,
    headers: normalizedHeaders,
  };
}

async function getCachedText(key: string, maxAgeMs: number = Number.POSITIVE_INFINITY) {
  const entry = await withStore("readonly", (store) => requestToPromise(store.get(key)));
  if (!entry) return undefined;

  if (Date.now() - entry.fetchedAt > maxAgeMs) {
    return undefined;
  }

  return entry.text;
}

async function putCachedText(key: string, text: string) {
  await withStore("readwrite", (store) =>
    requestToPromise(
      store.put({
        key,
        text,
        fetchedAt: Date.now(),
      } satisfies CacheEntry),
    ),
  );
}

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  if (typeof indexedDB === "undefined") {
    throw new Error("IndexedDB is not available in this environment.");
  }

  const db = await openCacheDb();

  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(CACHE_STORE_NAME, mode);
    const store = transaction.objectStore(CACHE_STORE_NAME);
    let didFinish = false;

    const finish = (callback: () => void) => {
      if (didFinish) return;
      didFinish = true;
      db.close();
      callback();
    };

    action(store)
      .then((result) => finish(() => resolve(result)))
      .catch((error) => finish(() => reject(error)));
    transaction.onerror = () =>
      finish(() => reject(transaction.error ?? new Error("IndexedDB transaction failed.")));
    transaction.onabort = () =>
      finish(() => reject(transaction.error ?? new Error("IndexedDB transaction aborted.")));
  });
}

function openCacheDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CACHE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
        db.createObjectStore(CACHE_STORE_NAME, { keyPath: "key" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
