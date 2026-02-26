import { useState } from 'react';
import { ImageOff, VideoOff } from 'lucide-react';

interface MediaThumbnailProps {
    src: string;
    type?: 'image' | 'video';
    alt?: string;
    className?: string;
    /** Extra class for the placeholder container (defaults to same as className) */
    placeholderClassName?: string;
}

/**
 * MediaThumbnail — renders an <img> or <video> with a graceful
 * placeholder when the source URL is expired or unreachable.
 */
export function MediaThumbnail({
    src,
    type = 'image',
    alt = 'Media',
    className = '',
    placeholderClassName,
}: MediaThumbnailProps) {
    const [failed, setFailed] = useState(false);

    if (failed || !src) {
        const Icon = type === 'video' ? VideoOff : ImageOff;
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
                src={src}
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
            src={src}
            alt={alt}
            className={className}
            onError={() => setFailed(true)}
        />
    );
}
