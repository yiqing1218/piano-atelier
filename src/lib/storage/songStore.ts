import type { ScoreDocument } from "../../types/music";
import type { InstrumentId, PlaybackMode, TrackMixes } from "../audio/instruments";
export interface SongMix { mode: PlaybackMode; instrument: InstrumentId; tracks: TrackMixes }
export interface LibrarySong { id: string; name: string; addedAt: number; bytes: ArrayBuffer; score: ScoreDocument; mix?: SongMix }
const DATABASE = "piano-atelier-library";
const STORE = "songs";
async function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "id" });
    request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
    request.onerror = () => reject(request.error ?? new Error("本地曲库无法打开。"));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, result: (value: T) => void) => void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode); let result: T;
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error ?? new Error("本地曲库读写失败，可能存储空间不足。")); };
    action(tx.objectStore(STORE), (value) => { result = value; });
  });
}
export async function storeSong(name: string, bytes: ArrayBuffer, score: ScoreDocument): Promise<{ song: LibrarySong; duplicate: boolean }> {
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const id = [...hash].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return transaction("readwrite", (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => {
      if (request.result) { result({ song: request.result, duplicate: true }); return; }
      const song: LibrarySong = { id, name, bytes, score, addedAt: Date.now() };
      store.add(song); result({ song, duplicate: false });
    };
  });
}
export async function listSongs(): Promise<LibrarySong[]> {
  return transaction("readonly", (store, result) => {
    const request = store.getAll();
    request.onsuccess = () => result((request.result as LibrarySong[]).sort((a, b) => a.addedAt - b.addedAt || a.name.localeCompare(b.name)));
  });
}
export async function deleteSong(id: string): Promise<void> { return transaction("readwrite", (store, result) => { store.delete(id); result(undefined); }); }
export async function saveSongMix(id: string, mix: SongMix): Promise<void> {
  return transaction("readwrite", (store, result) => {
    const request = store.get(id);
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, mix }); result(undefined); };
  });
}
