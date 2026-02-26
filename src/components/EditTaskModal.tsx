import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, ImagePlus, Loader2, Download } from 'lucide-react';
import type { Task, ToolType, TaskResultType } from '@/types/task';
import { saveImage, getImages, deleteImages } from '@/storage/imageStore';
import { downloadAsZip } from '@/utils/downloadUtils';
import { MediaThumbnail } from '@/components/MediaThumbnail';

interface EditTaskModalProps {
    task: Task | null;
    isOpen: boolean;
    onClose: () => void;
    onSave: (id: string, updates: Partial<Task>) => Promise<void>;
    onDelete: (id: string) => Promise<void>;
}

const MAX_IMAGES = 12;
const ACCEPTED_TYPES = 'image/jpeg,image/jpg,image/png,image/webp,image/bmp';

interface ImagePreview {
    id?: string;     // existing IndexedDB ID (if loaded from storage)
    file?: File;     // new file (if just selected)
    url: string;     // object URL for display
}

export function EditTaskModal({ task, isOpen, onClose, onSave, onDelete }: EditTaskModalProps) {
    const [title, setTitle] = useState('');
    const [prompt, setPrompt] = useState('');
    const [tool, setTool] = useState<ToolType>('chatgpt');
    const [resultType, setResultType] = useState<TaskResultType>('mixed');
    const [submitting, setSubmitting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

    const toggleDownloading = (id: string, isDownloading: boolean) => {
        setDownloadingIds(prev => {
            const next = new Set(prev);
            if (isDownloading) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleDownloadAll = async (resultIdx: number, urls: string[]) => {
        if (!task) return;
        const downloadId = `result_${resultIdx}`;
        if (downloadingIds.has(downloadId)) return;

        try {
            toggleDownloading(downloadId, true);
            await downloadAsZip(urls, task.tool, task.title || 'Untitled Task');
        } catch (err) {
            console.error('Download failed:', err);
        } finally {
            toggleDownloading(downloadId, false);
        }
    };

    const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync form fields whenever the target task changes
    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setPrompt(task.prompt);
            setTool(task.tool);
            setResultType(task.resultType || 'mixed');
            setConfirmDelete(false);

            // Load existing reference images
            const imageIds = task.referenceImageIds || [];
            if (imageIds.length > 0) {
                setLoadingImages(true);
                getImages(imageIds).then(stored => {
                    const previews: ImagePreview[] = stored.map(s => ({
                        id: s.id,
                        url: URL.createObjectURL(s.blob),
                    }));
                    setImagePreviews(previews);
                    setLoadingImages(false);
                });
            } else {
                setImagePreviews([]);
            }
        }
    }, [task]);

    if (!isOpen || !task) return null;

    const handleFilesSelected = (files: FileList | null) => {
        if (!files) return;
        const remaining = MAX_IMAGES - imagePreviews.length;
        const newFiles = Array.from(files).slice(0, remaining);
        const newPreviews: ImagePreview[] = newFiles.map(file => ({
            file,
            url: URL.createObjectURL(file),
        }));
        setImagePreviews(prev => [...prev, ...newPreviews]);
    };

    const removeImage = (index: number) => {
        setImagePreviews(prev => {
            URL.revokeObjectURL(prev[index].url);
            return prev.filter((_, i) => i !== index);
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const oldIds = (task.referenceImageIds || []);
            const keptIds = imagePreviews.filter(p => p.id).map(p => p.id!);
            const removedIds = oldIds.filter(id => !keptIds.includes(id));

            if (removedIds.length > 0) {
                await deleteImages(removedIds);
            }

            const finalIds: string[] = [];
            for (const preview of imagePreviews) {
                if (preview.id) {
                    finalIds.push(preview.id);
                } else if (preview.file) {
                    const id = await saveImage(preview.file, preview.file.name);
                    finalIds.push(id);
                }
            }

            await onSave(task.id, { title, tool, resultType, prompt, referenceImageIds: finalIds });
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmDelete) {
            setConfirmDelete(true);
            return;
        }
        setDeleting(true);
        try {
            const imageIds = task.referenceImageIds || [];
            if (imageIds.length > 0) {
                await deleteImages(imageIds);
            }
            await onDelete(task.id);
            onClose();
        } catch (error) {
            console.error(error);
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl mx-auto overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Task</h2>
                    <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
                    {/* Two-column body */}
                    <div className="flex flex-1 overflow-hidden">
                        {/* Left Column: Task Settings */}
                        <div className="w-1/2 p-5 overflow-y-auto border-r border-slate-200 dark:border-slate-700">
                            <div className="space-y-5">
                                {/* Title */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Task Title</label>
                                    <input
                                        type="text"
                                        required
                                        value={title}
                                        onChange={(e) => setTitle(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="e.g. Write a poem about space"
                                    />
                                </div>

                                {/* Tool */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Target Tool</label>
                                    <select
                                        value={tool}
                                        onChange={(e) => setTool(e.target.value as ToolType)}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        <option value="chatgpt">ChatGPT</option>
                                        <option value="gemini">Gemini</option>
                                        <option value="jimeng">即梦 (Jimeng)</option>
                                        <option value="sora">Sora</option>
                                        <option value="other">Other</option>
                                    </select>
                                </div>

                                {/* Result Type */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Result Type</label>
                                    <div className="grid grid-cols-4 gap-2">
                                        {([
                                            { id: 'image', label: '图片 (Image)', emoji: '🖼️' },
                                            { id: 'video', label: '视频 (Video)', emoji: '🎬' },
                                            { id: 'text', label: '文本 (Text)', emoji: '📝' },
                                            { id: 'mixed', label: '混合 (Mixed)', emoji: '🔀' },
                                        ] as const).map(type => (
                                            <button
                                                key={type.id}
                                                type="button"
                                                onClick={() => setResultType(type.id as TaskResultType)}
                                                className={`flex flex-col items-center justify-center py-2 px-1 rounded-md border text-xs font-medium transition-colors ${resultType === type.id
                                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                                    }`}
                                            >
                                                <span className="text-lg mb-1">{type.emoji}</span>
                                                <span className="text-center">{type.label}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* Reference Images */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        Reference Images
                                        <span className="text-slate-400 text-xs ml-2 font-normal">
                                            ({imagePreviews.length}/{MAX_IMAGES})
                                        </span>
                                    </label>

                                    {loadingImages ? (
                                        <div className="flex items-center space-x-2 text-slate-400 text-sm py-4">
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Loading images...</span>
                                        </div>
                                    ) : (
                                        <>
                                            {imagePreviews.length > 0 && (
                                                <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mb-2">
                                                    {imagePreviews.map((preview, index) => (
                                                        <div key={index} className="relative group aspect-square">
                                                            <img
                                                                src={preview.url}
                                                                className="w-full h-full object-cover rounded-md border border-slate-200 dark:border-slate-700"
                                                                alt={`Preview ${index + 1}`}
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => removeImage(index)}
                                                                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600 z-10"
                                                            >
                                                                <X size={12} />
                                                            </button>
                                                        </div>
                                                    ))}
                                                    {imagePreviews.length < MAX_IMAGES && (
                                                        <button
                                                            type="button"
                                                            onClick={() => fileInputRef.current?.click()}
                                                            className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-md bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors aspect-square text-slate-500 dark:text-slate-400"
                                                        >
                                                            <ImagePlus size={20} />
                                                        </button>
                                                    )}
                                                </div>
                                            )}

                                            {imagePreviews.length === 0 && (
                                                <div
                                                    onClick={() => fileInputRef.current?.click()}
                                                    className="w-full border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-6 flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer bg-white dark:bg-slate-900"
                                                >
                                                    <ImagePlus size={24} className="mb-2 text-slate-400" />
                                                    <span className="text-sm font-medium">Click to upload reference images</span>
                                                    <span className="text-xs text-slate-400 mt-1">JPEG, PNG, WebP up to {MAX_IMAGES} files</span>
                                                </div>
                                            )}

                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept={ACCEPTED_TYPES}
                                                multiple
                                                className="hidden"
                                                onChange={(e) => {
                                                    handleFilesSelected(e.target.files);
                                                    e.target.value = '';
                                                }}
                                            />
                                        </>
                                    )}
                                </div>

                                {/* Prompt */}
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Prompt</label>
                                    <textarea
                                        required
                                        rows={4}
                                        value={prompt}
                                        onChange={(e) => setPrompt(e.target.value)}
                                        className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                                        placeholder="Enter your prompt here..."
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Execution History */}
                        <div className="w-1/2 p-5 overflow-y-auto bg-slate-50/50 dark:bg-slate-900/20">
                            {task.results && task.results.length > 0 ? (
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">
                                        Execution History ({task.results.length})
                                    </h3>
                                    <div className="space-y-3">
                                        {[...task.results].reverse().map((result, idx) => {
                                            let parsed: any = null;
                                            try { parsed = JSON.parse(result.content); } catch { /* not JSON */ }

                                            return (
                                                <div key={idx} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                                    <div className="flex justify-between items-center mb-2">
                                                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                                                            Execution #{task.results.length - idx}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {new Date(result.createdAt).toLocaleString()}
                                                        </span>
                                                    </div>

                                                    {parsed?.type === 'image' ? (() => {
                                                        const allUrls: string[] = parsed.allImageUrls?.length
                                                            ? parsed.allImageUrls
                                                            : [parsed.imageBase64 || parsed.imageUrl].filter(Boolean);
                                                        const cachedIds = result.cachedMediaIds || [];
                                                        const downloadId = `result_${task.results.length - 1 - idx}`;
                                                        const isDownloading = downloadingIds.has(downloadId);

                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex justify-between items-center">
                                                                    {parsed.imageDescription && (
                                                                        <p className="text-xs text-slate-500 italic">"{parsed.imageDescription}"</p>
                                                                    )}
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDownloadAll(task.results.length - 1 - idx, allUrls)}
                                                                        disabled={isDownloading}
                                                                        className="ml-auto flex items-center space-x-1 text-[10px] px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isDownloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                                                                        <span>{allUrls.length > 1 ? `Download All (${allUrls.length})` : 'Download'}</span>
                                                                    </button>
                                                                </div>
                                                                <div className={`grid gap-2 ${allUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                                    {allUrls.map((url: string, i: number) => (
                                                                        <a key={i} href={url} target="_blank" rel="noopener noreferrer" title="Click to view full size">
                                                                            <MediaThumbnail
                                                                                src={url}
                                                                                alt={`Result ${i + 1}`}
                                                                                className="w-full h-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer bg-slate-100 dark:bg-slate-900"
                                                                                cachedMediaId={cachedIds[i]}
                                                                            />
                                                                        </a>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        );
                                                    })() : parsed?.type === 'video' ? (() => {
                                                        const downloadId = `result_${task.results.length - 1 - idx}`;
                                                        const isDownloading = downloadingIds.has(downloadId);

                                                        return (
                                                            <div className="space-y-2">
                                                                <div className="flex justify-end">
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleDownloadAll(task.results.length - 1 - idx, [parsed.videoUrl])}
                                                                        disabled={isDownloading}
                                                                        className="flex items-center space-x-1 text-[10px] px-2 py-1 bg-green-50 text-green-700 border border-green-200 rounded hover:bg-green-100 transition-colors disabled:opacity-50"
                                                                    >
                                                                        {isDownloading ? <Loader2 size={10} className="animate-spin" /> : <Download size={10} />}
                                                                        <span>Download</span>
                                                                    </button>
                                                                </div>
                                                                <a href={parsed.videoUrl} target="_blank" rel="noopener noreferrer" title="Click to open video">
                                                                    <MediaThumbnail
                                                                        src={parsed.videoUrl}
                                                                        type="video"
                                                                        className="w-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity bg-slate-100 dark:bg-slate-900"
                                                                        cachedMediaId={result.cachedMediaIds?.[0]}
                                                                    />
                                                                </a>
                                                            </div>
                                                        );
                                                    })() : (
                                                        <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap break-words">
                                                            {result.content}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 space-y-3 py-16">
                                    <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-xl">⏳</div>
                                    <p className="text-sm">No execution history yet</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Footer Actions */}
                    <div className="flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className={`flex items-center space-x-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${confirmDelete
                                ? 'bg-red-600 text-white hover:bg-red-700'
                                : 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                                }`}
                        >
                            <Trash2 size={15} />
                            <span>{deleting ? 'Deleting...' : confirmDelete ? 'Confirm Delete' : 'Delete Task'}</span>
                        </button>

                        <div className="flex space-x-2">
                            <button
                                type="button"
                                onClick={onClose}
                                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={submitting}
                                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                            >
                                {submitting ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
