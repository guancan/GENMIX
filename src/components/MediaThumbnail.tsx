import { useState, useEffect } from 'react';
import { ImageOff, VideoOff } from 'lucide-react';
import { getMedia, mediaToObjectUrl } from '@/storage/mediaStore';

interface MediaThumbnailProps {
    src: string;
    type?: 'image' | 'video';
    alt?: string;
    className?: string;
    /** Extra class for the placeholder container (defaults to same as className) */
    placeholderClassName?: string;
    /** IndexedDB media ID — if provided, loads blob from cache instead of using src URL */
    cachedMediaId?: string;
}

/**
 * MediaThumbnail — renders an <img> or <video> with a graceful
 * placeholder when the source URL is expired or unreachable.
 * If `cachedMediaId` is provided, loads the blob from IndexedDB first.
 */
export function MediaThumbnail({
    src,
    type = 'image',
    alt = 'Media',
    className = '',
    placeholderClassName,
    cachedMediaId,
}: MediaThumbnailProps) {
    const [failed, setFailed] = useState(false);
    const [resolvedSrc, setResolvedSrc] = useState<string | null>(cachedMediaId ? null : src);

    useEffect(() => {
        if (!cachedMediaId) {
            setResolvedSrc(src);
            setFailed(false);
            return;
        }

        let revoked = false;
        let objectUrl: string | null = null;

        (async () => {
            try {
                const media = await getMedia(cachedMediaId);
                if (media && !revoked) {
                    objectUrl = mediaToObjectUrl(media);
                    setResolvedSrc(objectUrl);
                    setFailed(false);
                } else if (!revoked) {
                    // Cache miss — fall back to src URL
                    setResolvedSrc(src);
                }
            } catch {
                if (!revoked) setResolvedSrc(src);
            }
        })();

        return () => {
            revoked = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [cachedMediaId, src]);

    if (failed || !resolvedSrc) {
        const Icon = type === 'video' ? VideoOff : ImageOff;

        // Show loading state while resolving cache
        if (cachedMediaId && !resolvedSrc && !failed) {
            return (
                <div
                    className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse ${placeholderClassName || className}`}
                    style={{ minHeight: 40 }}
                >
                    <div className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-transparent animate-spin" />
                </div>
            );
        }

        return (
            <div
                className={`flex flex-col items-center justify-center gap-1 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 ${placeholderClassName || className}`}
                style={{ minHeight: 40 }}
                title="媒体不可用"
            >
                <Icon size={16} strokeWidth={1.5} />
                <span className="text-[9px] leading-none">不可用</span>
            </div>
        );
    }

    if (type === 'video') {
        return (
            <video
                src={resolvedSrc}
                className={className}
                muted
                autoPlay
                loop
                playsInline
                onError={() => setFailed(true)}
            />
        );
    }

    return (
        <img
            src={resolvedSrc}
            alt={alt}
            className={className}
            onError={() => setFailed(true)}
        />
    );
}
