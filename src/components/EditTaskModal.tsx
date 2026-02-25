import React, { useState, useEffect, useRef } from 'react';
import { X, Trash2, ImagePlus } from 'lucide-react';
import type { Task, ToolType, TaskResultType } from '@/types/task';
import { saveImage, getImages, deleteImages } from '@/storage/imageStore';

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
    const [imagePreviews, setImagePreviews] = useState<ImagePreview[]>([]);
    const [loadingImages, setLoadingImages] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Sync form fields whenever the target task changes
    useEffect(() => {
        if (task) {
            setTitle(task.title);
            setPrompt(task.prompt);
            setTool(task.tool);
            setResultType(task.resultType || 'mixed'); // Handle older tasks without resultType
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
            // Figure out which old images were removed
            const oldIds = (task.referenceImageIds || []);
            const keptIds = imagePreviews.filter(p => p.id).map(p => p.id!);
            const removedIds = oldIds.filter(id => !keptIds.includes(id));

            // Delete removed images from IndexedDB
            if (removedIds.length > 0) {
                await deleteImages(removedIds);
            }

            // Save new images
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
            // Clean up images from IndexedDB
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Edit Task</h2>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-4 space-y-4 overflow-y-auto flex-1">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Task Title
                        </label>
                        <input
                            type="text"
                            required
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="e.g. Write a poem about space"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Target Tool
                        </label>
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

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Expected Result Type
                        </label>
                        <select
                            value={resultType}
                            onChange={(e) => setResultType(e.target.value as TaskResultType)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="mixed">Mixed (Any results)</option>
                            <option value="image">Image Only</option>
                            <option value="video">Video Only</option>
                            <option value="text">Text Only</option>
                        </select>
                    </div>

                    {/* Reference Images */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Reference Images <span className="text-slate-400 font-normal">({imagePreviews.length}/{MAX_IMAGES})</span>
                        </label>

                        {loadingImages ? (
                            <div className="text-xs text-slate-400 text-center py-3">Loading images...</div>
                        ) : (
                            <>
                                {imagePreviews.length > 0 && (
                                    <div className="grid grid-cols-4 gap-2 mb-2">
                                        {imagePreviews.map((preview, i) => (
                                            <div key={i} className="relative group aspect-square rounded-md overflow-hidden border border-slate-200 dark:border-slate-700">
                                                <img src={preview.url} alt={`Ref ${i + 1}`} className="w-full h-full object-cover" />
                                                <button
                                                    type="button"
                                                    onClick={() => removeImage(i)}
                                                    className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs"
                                                >
                                                    ×
                                                </button>
                                                <span className="absolute bottom-0.5 left-0.5 text-[9px] bg-black/60 text-white px-1 rounded">
                                                    {i + 1}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {imagePreviews.length < MAX_IMAGES && (
                                    <button
                                        type="button"
                                        onClick={() => fileInputRef.current?.click()}
                                        className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-md text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex items-center justify-center space-x-2 text-sm"
                                    >
                                        <ImagePlus size={16} />
                                        <span>Add Reference Images</span>
                                    </button>
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

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Prompt
                        </label>
                        <textarea
                            required
                            rows={4}
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none resize-none"
                            placeholder="Enter your prompt here..."
                        />
                    </div>

                    <div className="flex items-center justify-between pt-2">
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
