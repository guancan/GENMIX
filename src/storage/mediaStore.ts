/**
 * IndexedDB-based media store for caching result media (images/videos).
 * Separate from imageStore which handles reference images.
 *
 * Stores Blob objects keyed by UUID, linked via TaskResult.cachedMediaIds.
 */

const DB_NAME = 'genmix_media';
const DB_VERSION = 1;
const STORE_NAME = 'media';

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

export interface StoredMedia {
    id: string;
    blob: Blob;
    type: 'image' | 'video';
    mimeType: string;
    sourceUrl: string;  // Original URL for debugging/reference
    createdAt: number;
}

/** Save a blob and return its UUID */
export async function saveMedia(
    blob: Blob,
    type: 'image' | 'video',
    sourceUrl: string
): Promise<string> {
    const db = await openDB();
    const id = crypto.randomUUID();
    const record: StoredMedia = {
        id,
        blob,
        type,
        mimeType: blob.type,
        sourceUrl,
        createdAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve(id);
        tx.onerror = () => reject(tx.error);
    });
}

/** Get a media blob by ID */
export async function getMedia(id: string): Promise<StoredMedia | null> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
    });
}

/** Get multiple media blobs by IDs, preserving order */
export async function getMediaBatch(ids: string[]): Promise<StoredMedia[]> {
    const results = await Promise.all(ids.map(id => getMedia(id)));
    return results.filter((r): r is StoredMedia => r !== null);
}

/** Delete a single media entry */
export async function deleteMedia(id: string): Promise<void> {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Delete multiple media entries */
export async function deleteMediaBatch(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        ids.forEach(id => store.delete(id));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    });
}

/** Convert a stored media blob to an object URL */
export function mediaToObjectUrl(media: StoredMedia): string {
    return URL.createObjectURL(media.blob);
}

/**
 * Cache media from URLs. Fetches each URL and stores the blob.
 * Returns an array of { url, mediaId } pairs. Failed fetches are skipped.
 */
export async function cacheMediaUrls(
    urls: { url: string; type: 'image' | 'video' }[]
): Promise<{ url: string; mediaId: string }[]> {
    const results: { url: string; mediaId: string }[] = [];

    for (const { url, type } of urls) {
        // Skip data: URLs — they're already embedded and won't expire
        if (url.startsWith('data:')) continue;

        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const blob = await res.blob();
            const mediaId = await saveMedia(blob, type, url);
            results.push({ url, mediaId });
        } catch (err) {
            console.warn(`[MediaStore] Failed to cache ${type} from ${url.substring(0, 60)}...`, err);
            // Don't fail the whole operation — just skip this one
        }
    }

    return results;
}
