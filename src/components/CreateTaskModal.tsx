import React, { useState, useRef } from 'react';
import { X, ImagePlus } from 'lucide-react';
import type { ToolType } from '@/types/task';
import { saveImage } from '@/storage/imageStore';

interface CreateTaskModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: { title: string; tool: ToolType; prompt: string; referenceImageIds: string[] }) => Promise<void>;
}

const MAX_IMAGES = 12;
const ACCEPTED_TYPES = 'image/jpeg,image/jpg,image/png,image/webp,image/bmp';

export function CreateTaskModal({ isOpen, onClose, onSubmit }: CreateTaskModalProps) {
    const [title, setTitle] = useState('');
    const [prompt, setPrompt] = useState('');
    const [tool, setTool] = useState<ToolType>('chatgpt');
    const [submitting, setSubmitting] = useState(false);
    // Image upload state: preview URLs + raw files
    const [imagePreviews, setImagePreviews] = useState<{ file: File; url: string }[]>([]);
    const fileInputRef = useRef<HTMLInputElement>(null);

    if (!isOpen) return null;

    const handleFilesSelected = (files: FileList | null) => {
        if (!files) return;
        const remaining = MAX_IMAGES - imagePreviews.length;
        const newFiles = Array.from(files).slice(0, remaining);

        const newPreviews = newFiles.map(file => ({
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
            // Save images to IndexedDB and collect IDs
            const imageIds: string[] = [];
            for (const { file } of imagePreviews) {
                const id = await saveImage(file, file.name);
                imageIds.push(id);
            }

            await onSubmit({ title, tool, prompt, referenceImageIds: imageIds });
            onClose();
            // Reset form
            setTitle('');
            setPrompt('');
            setTool('chatgpt');
            imagePreviews.forEach(p => URL.revokeObjectURL(p.url));
            setImagePreviews([]);
        } catch (error) {
            console.error(error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Create New Task</h2>
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

                    {/* Reference Images */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                            Reference Images <span className="text-slate-400 font-normal">({imagePreviews.length}/{MAX_IMAGES})</span>
                        </label>

                        {/* Thumbnail grid */}
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

                        {/* Upload button */}
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
                                e.target.value = ''; // Reset so same file can be re-selected
                            }}
                        />
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

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md mr-2"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                        >
                            {submitting ? 'Creating...' : 'Create Task'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
