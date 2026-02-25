/**
 * IndexedDB-based image store for reference images.
 * Stores Blob objects keyed by UUID. Task records only store the ID list.
 *
 * Uses raw IndexedDB (no external deps) for maximum compatibility in Chrome extensions.
 */

const DB_NAME = 'genmix_images';
const DB_VERSION = 1;
const STORE_NAME = 'images';

function openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export interface StoredImage {
    id: string;
    blob: Blob;
    name: string;
    type: string;
    createdAt: number;
}

/** Save a blob and return its UUID */
export async function saveImage(blob: Blob, name: string): Promise<string> {
    const db = await openDB();
    const id = crypto.randomUUID();
    const record: StoredImage = {
        id,
        blob,
        name,
        type: blob.type,
        createdAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject(tx.error);
    });
}

/** Get an image by ID */
export async function getImage(id: string): Promise<StoredImage | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

/** Get multiple images by IDs, preserving order */
export async function getImages(ids: string[]): Promise<StoredImage[]> {
    const results = await Promise.all(ids.map(id => getImage(id)));
    return results.filter((r): r is StoredImage => r !== null);
}

/** Delete a single image */
export async function deleteImage(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Delete multiple images */
export async function deleteImages(ids: string[]): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Convert a blob to a base64 data URL */
export function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
