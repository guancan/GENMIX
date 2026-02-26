import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Image, Film, FileText, ChevronDown, Loader2, Download } from 'lucide-react';
import type { CapturedItem } from '@/content/adapters/types';
import type { Task, TaskResult } from '@/types/task';
import FetchImage from '@/pages/sidepanel/FetchImage';

interface ResultCapturePanelProps {
    items: CapturedItem[];
    tasks: Task[];
    isLoading: boolean;
    onImport: (taskId: string, results: TaskResult[]) => Promise<void>;
    onClose: () => void;
    onRescan: () => void;
}

const TYPE_ICON: Record<string, React.ReactNode> = {
    image: <Image size={14} className="text-blue-500" />,
    video: <Film size={14} className="text-purple-500" />,
    text: <FileText size={14} className="text-green-500" />,
};

const TYPE_LABEL: Record<string, string> = {
    image: '图片',
    video: '视频',
    text: '文本',
};

/** Inline component that fetches a video via the extension's privileged context */
function FetchVideo({ src, className }: { src: string; className?: string }) {
    const [blobUrl, setBlobUrl] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);
    const isLocal = src.startsWith('data:') || src.startsWith('blob:');

    useEffect(() => {
        if (isLocal) return;
        let revoked = false;
        let url: string | null = null;
        (async () => {
            try {
                const res = await fetch(src);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const blob = await res.blob();
                url = URL.createObjectURL(blob);
                if (!revoked) setBlobUrl(url);
            } catch {
                if (!revoked) setFailed(true);
            }
        })();
        return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
    }, [src, isLocal]);

    if (failed) return <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 text-[10px] rounded ${className}`}>⚠️</div>;
    const displaySrc = isLocal ? src : blobUrl;
    if (!displaySrc) return <div className={`flex items-center justify-center bg-slate-100 dark:bg-slate-800 animate-pulse rounded ${className}`}><Loader2 size={14} className="animate-spin text-slate-400" /></div>;
    return <video src={displaySrc} className={className} muted autoPlay loop playsInline />;
}

export function ResultCapturePanel({ items, tasks, isLoading, onImport, onClose, onRescan }: ResultCapturePanelProps) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [targetTaskId, setTargetTaskId] = useState<string>(tasks[0]?.id || '');
    const [importing, setImporting] = useState(false);
    const [typeFilter, setTypeFilter] = useState<string>('all');

    const filteredItems = useMemo(() => {
        if (typeFilter === 'all') return items;
        return items.filter(i => i.type === typeFilter);
    }, [items, typeFilter]);

    const stats = useMemo(() => {
        const images = items.filter(i => i.type === 'image').length;
        const videos = items.filter(i => i.type === 'video').length;
        const texts = items.filter(i => i.type === 'text').length;
        return { images, videos, texts, total: items.length };
    }, [items]);

    const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const toggleAll = () => {
        if (selectedIds.size === filteredItems.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredItems.map(i => i.id)));
        }
    };

    const handleImport = async () => {
        if (selectedIds.size === 0 || !targetTaskId) return;

        setImporting(true);
        try {
            const selected = items.filter(i => selectedIds.has(i.id));
            const results: TaskResult[] = selected.map(item => {
                let content: string;
                if (item.type === 'image') {
                    content = JSON.stringify({
                        type: 'image',
                        imageUrl: item.url,
                        allImageUrls: item.urls || [item.url],
                        imageDescription: `Captured image (${(item.urls || []).length} results)`,
                    });
                } else if (item.type === 'video') {
                    content = JSON.stringify({
                        type: 'video',
                        videoUrl: item.url,
                        allVideoUrls: [item.url],
                    });
                } else {
                    content = JSON.stringify({
                        type: 'text',
                        rawText: item.rawText || '',
                        htmlContent: item.htmlContent || '',
                    });
                }
                return {
                    id: crypto.randomUUID(),
                    content,
                    createdAt: Date.now(),
                };
            });
            await onImport(targetTaskId, results);
            onClose();
        } catch (err) {
            console.error('[Genmix Capture] Import failed:', err);
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/40 backdrop-blur-sm">
            <div className="flex-1" onClick={onClose} />
            <div className="bg-white dark:bg-slate-800 rounded-t-xl shadow-2xl max-h-[80vh] flex flex-col animate-slide-up">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <div>
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">📥 Capture Page Results</h2>
                        {!isLoading && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                Found {stats.total} results
                                {stats.images > 0 && ` · ${stats.images} images`}
                                {stats.videos > 0 && ` · ${stats.videos} videos`}
                                {stats.texts > 0 && ` · ${stats.texts} texts`}
                            </p>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={onRescan}
                            disabled={isLoading}
                            className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                        >
                            Rescan
                        </button>
                        <button
                            onClick={onClose}
                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* Filter bar */}
                {!isLoading && items.length > 0 && (
                    <div className="flex items-center justify-between px-4 py-2 border-b border-slate-100 dark:border-slate-700/50 flex-shrink-0">
                        <div className="flex items-center space-x-1">
                            {['all', 'image', 'video', 'text'].map(key => (
                                <button
                                    key={key}
                                    onClick={() => setTypeFilter(key)}
                                    className={`text-[11px] px-2 py-0.5 rounded-full transition-colors ${typeFilter === key
                                        ? 'bg-blue-600 text-white font-semibold'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                        }`}
                                >
                                    {key === 'all' ? '全部' : TYPE_LABEL[key]}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={toggleAll}
                            className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
                        >
                            {selectedIds.size === filteredItems.length ? 'Deselect All' : 'Select All'}
                        </button>
                    </div>
                )}

                {/* Items list */}
                <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 min-h-[120px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <Loader2 size={24} className="animate-spin mb-2" />
                            <span className="text-sm">Scanning page...</span>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                            <span className="text-2xl mb-2">🔍</span>
                            <span className="text-sm">No AI results found on this page</span>
                        </div>
                    ) : filteredItems.map(item => {
                        const isSelected = selectedIds.has(item.id);
                        return (
                            <div
                                key={item.id}
                                onClick={() => toggleSelect(item.id)}
                                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${isSelected
                                    ? 'border-blue-400 bg-blue-50/80 dark:bg-blue-900/20 dark:border-blue-600'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                                    }`}
                            >
                                {/* Checkbox */}
                                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-colors ${isSelected
                                    ? 'bg-blue-600 border-blue-600'
                                    : 'border-slate-300 dark:border-slate-600'
                                    }`}>
                                    {isSelected && <Check size={12} className="text-white" />}
                                </div>

                                {/* Thumbnail / Preview */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5 mb-1">
                                        {TYPE_ICON[item.type]}
                                        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400 uppercase">{TYPE_LABEL[item.type]}</span>
                                        {item.urls && item.urls.length > 1 && (
                                            <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-500 px-1.5 py-0.5 rounded-full">×{item.urls.length}</span>
                                        )}
                                    </div>

                                    {item.type === 'image' && item.thumbnail && (
                                        <div className="flex gap-1 flex-wrap">
                                            {(item.urls || [item.url!]).slice(0, 4).map((url, i) => (
                                                <FetchImage
                                                    key={i}
                                                    src={url}
                                                    className="w-14 h-14 object-cover rounded border border-slate-200 dark:border-slate-600"
                                                    alt=""
                                                />
                                            ))}
                                            {(item.urls || []).length > 4 && (
                                                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 rounded border border-slate-200 dark:border-slate-600 flex items-center justify-center text-[10px] text-slate-500">
                                                    +{(item.urls || []).length - 4}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {item.type === 'video' && item.url && (
                                        <FetchVideo
                                            src={item.url}
                                            className="w-28 h-16 object-cover rounded border border-slate-200 dark:border-slate-600"
                                        />
                                    )}

                                    {item.type === 'text' && item.rawText && (
                                        <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
                                            {item.rawText.slice(0, 120)}{item.rawText.length > 120 ? '...' : ''}
                                        </p>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer: task selector + import button */}
                {!isLoading && items.length > 0 && (
                    <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2 flex-shrink-0 bg-white dark:bg-slate-800">
                        <div className="flex-1 relative">
                            <select
                                value={targetTaskId}
                                onChange={e => setTargetTaskId(e.target.value)}
                                className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded py-2 px-2.5 pr-7 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 appearance-none cursor-pointer truncate"
                            >
                                {tasks.map(t => (
                                    <option key={t.id} value={t.id}>{t.title}</option>
                                ))}
                            </select>
                            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                        <button
                            onClick={handleImport}
                            disabled={selectedIds.size === 0 || importing || !targetTaskId}
                            className="flex items-center space-x-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
                        >
                            {importing ? (
                                <>
                                    <Loader2 size={13} className="animate-spin" />
                                    <span>Importing...</span>
                                </>
                            ) : (
                                <>
                                    <Download size={13} />
                                    <span>Import ({selectedIds.size})</span>
                                </>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
