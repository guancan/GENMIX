import { useState, useEffect } from 'react';
import { getImages } from '@/storage/imageStore';

export default function ReferenceImageThumbnail({ imageId }: { imageId: string }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);

    useEffect(() => {
        let revoked = false;
        let url: string | null = null;

        getImages([imageId]).then(images => {
            if (images.length > 0 && !revoked) {
                url = URL.createObjectURL(images[0].blob);
                setBlobUrl(url);
            }
        }).catch(err => {
            console.error('Failed to load reference image:', err);
        });

        return () => {
            revoked = true;
            if (url) URL.revokeObjectURL(url);
        };
    }, [imageId]);

    if (!blobUrl) {
        return (
            <div className="w-10 h-10 bg-slate-200 dark:bg-slate-700 animate-pulse rounded border border-slate-300 dark:border-slate-600 flex items-center justify-center shadow-sm">
                <span className="text-[10px]">🖼️</span>
            </div>
        );
    }

    return (
        <a href={blobUrl} target="_blank" rel="noopener noreferrer" title="View reference image" className="block relative group shadow-sm hover:shadow transition-shadow">
            <img
                src={blobUrl}
                alt="Reference"
                className="w-10 h-10 object-cover rounded border border-slate-300 dark:border-slate-600 group-hover:opacity-90"
            />
        </a>
    );
}
