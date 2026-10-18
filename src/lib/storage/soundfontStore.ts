const DB_NAME = "piano-atelier-local";
const STORE_NAME = "assets";
const SOUNDFONT_KEY = "active-soundfont";

export interface StoredSoundfont {
  name: string;
  buffer: ArrayBuffer;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地音源数据库。"));
  });
}

export async function saveSoundfont(name: string, buffer: ArrayBuffer): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put({ name, buffer } satisfies StoredSoundfont, SOUNDFONT_KEY);
    transaction.oncomplete = () => { db.close(); resolve(); };
    transaction.onerror = () => { db.close(); reject(transaction.error ?? new Error("保存音源失败。")); };
  });
}

export async function loadSavedSoundfont(): Promise<StoredSoundfont | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).get(SOUNDFONT_KEY);
    request.onsuccess = () => {
      db.close();
      resolve((request.result as StoredSoundfont | undefined) ?? null);
    };
    request.onerror = () => { db.close(); reject(request.error ?? new Error("读取本地音源失败。")); };
  });
}
