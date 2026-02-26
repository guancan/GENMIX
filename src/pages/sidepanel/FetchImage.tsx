import { useState, useEffect } from 'react';
import { getMedia, mediaToObjectUrl } from '@/storage/mediaStore';

/**
 * FetchImage: renders an image by fetching the URL from the sidepanel context.
 *
 * Extension pages (chrome-extension://) with host_permissions can fetch cross-origin
 * URLs without CORS restrictions and with full cookie access.
 *
 * If cachedMediaId is provided, loads from IndexedDB cache first.
 * If the src is already a data: or blob: URL, it renders directly without fetching.
 */
export default function FetchImage({
    src,
    alt,
    className,
    cachedMediaId,
}: {
    src: string;
    alt?: string;
    className?: string;
    cachedMediaId?: string;
}) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    const isLocalUrl = src.startsWith('data:') || src.startsWith('blob:');

    useEffect(() => {
        if (isLocalUrl) return;

        let revoked = false;
        let url: string | null = null;

        (async () => {
            // Try IndexedDB cache first
            if (cachedMediaId) {
                try {
                    const media = await getMedia(cachedMediaId);
                    if (media && !revoked) {
                        url = mediaToObjectUrl(media);
                        setBlobUrl(url);
                        return;
                    }
                } catch {
                    // Cache miss, fall through to fetch
                }
            }

            // Fall back to privileged fetch
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                url = URL.createObjectURL(blob);
                if (!revoked) setBlobUrl(url);
            } catch (err) {
                console.warn('[FetchImage] Failed to fetch image:', err);
                if (!revoked) setError(true);
            }
        })();

        return () => {
            revoked = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [src, isLocalUrl, cachedMediaId]);

    if (error) {
        return (
            <div className={`flex items-center justify-center text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 rounded ${className}`} style={{ minHeight: 80 }}>
                ⚠️ Image load failed
            </div>
        );
    }

    const displaySrc = isLocalUrl ? src : blobUrl;

    if (!displaySrc) {
        return (
            <div className={`flex items-center justify-center text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 rounded animate-pulse ${className}`} style={{ minHeight: 80 }}>
                Loading image...
            </div>
        );
    }

    return (
        <img
            src={displaySrc}
            alt={alt || 'Result'}
            className={className}
        />
    );
}
