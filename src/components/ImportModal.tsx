import React, { useState, useRef } from 'react';
import { X, Upload, FileText, AlertCircle, Download, Image as ImageIcon } from 'lucide-react';
import { parseJsonImport, parseCsvImport, generateJsonTemplate, generateCsvTemplate, downloadFile, type ImportedTask } from '@/utils/importExport';
import { saveImage } from '@/storage/imageStore';

interface ImportModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (tasks: (ImportedTask & { referenceImageIds?: string[] })[], strategy: 'replace' | 'prepend' | 'append') => Promise<void>;
}

export function ImportModal({ isOpen, onClose, onImport }: ImportModalProps) {
    const [parsedTasks, setParsedTasks] = useState<ImportedTask[]>([]);
    const [strategy, setStrategy] = useState<'append' | 'prepend' | 'replace'>('append');
    const [error, setError] = useState('');
    const [importing, setImporting] = useState(false);
    const [fileName, setFileName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);

    // Reference images state
    const [referenceFolder, setReferenceFolder] = useState<File[]>([]);
    const [matchedImages, setMatchedImages] = useState<Map<string, File>>(new Map());

    const requiredImageNames = parsedTasks
        .flatMap(t => t.referenceImages || [])
        .filter(Boolean);

    // Check if any required image needs matching
    const needsImageMatching = requiredImageNames.length > 0;
    const matchCount = Array.from(new Set(requiredImageNames)).filter(name => matchedImages.has(name.toLowerCase())).length;
    const uniqueRequiredCount = new Set(requiredImageNames).size;

    if (!isOpen) return null;

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        setFileName(file.name);

        try {
            const content = await file.text();
            let tasks: ImportedTask[];

            if (file.name.endsWith('.json')) {
                tasks = parseJsonImport(content);
            } else if (file.name.endsWith('.csv')) {
                tasks = parseCsvImport(content);
            } else {
                setError('请选择 .json 或 .csv 文件');
                return;
            }

            if (tasks.length === 0) {
                setError('文件中没有找到有效的任务数据');
                return;
            }

            setParsedTasks(tasks);
            setReferenceFolder([]);
            setMatchedImages(new Map());
        } catch (err) {
            setError(`解析文件失败: ${err instanceof Error ? err.message : '未知错误'}`);
        }
    };

    const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        setReferenceFolder(files);
        // Build a map of filename -> File for quick matching
        const map = new Map<string, File>();
        files.forEach(f => {
            // Store only the filename (ignore path) for matching, use lowercase for case-insensitive
            map.set(f.name.toLowerCase(), f);
        });
        setMatchedImages(map);
    };

    const handleImport = async () => {
        if (parsedTasks.length === 0) return;
        setImporting(true);
        try {
            // Process reference images and upload to IndexedDB
            const finalTasks = await Promise.all(parsedTasks.map(async (task) => {
                const newTask: ImportedTask & { referenceImageIds: string[] } = {
                    ...task,
                    referenceImageIds: [],
                };

                if (task.referenceImages && task.referenceImages.length > 0) {
                    for (const name of task.referenceImages) {
                        const file = matchedImages.get(name.toLowerCase());
                        if (file) {
                            console.log(`[Genmix] Matching found for ${name}, saving to image store...`);
                            try {
                                const id = await saveImage(file, file.name);
                                console.log(`[Genmix] Saved ${name} with ID: ${id}`);
                                newTask.referenceImageIds.push(id);
                            } catch (e) {
                                console.error('[Genmix] Failed to save reference image:', name, e);
                            }
                        }
                    }
                }
                return newTask;
            }));

            console.log('[Genmix] Final tasks with reference images:', finalTasks);

            // Force pass the extended type
            await onImport(finalTasks as any, strategy);
            handleClose();
        } catch (err) {
            setError(`导入失败: ${err instanceof Error ? err.message : '未知错误'}`);
        } finally {
            setImporting(false);
        }
    };

    const handleClose = () => {
        setParsedTasks([]);
        setError('');
        setFileName('');
        setStrategy('append');
        setReferenceFolder([]);
        setMatchedImages(new Map());
        onClose();
    };

    const STRATEGIES = [
        { key: 'append' as const, label: '⬇️ 追加到末尾', desc: '在现有任务后面添加' },
        { key: 'prepend' as const, label: '⬆️ 插入到最前', desc: '在现有任务前面添加' },
        { key: 'replace' as const, label: '🔄 替换全部', desc: '清空现有任务并替换' },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Upload size={18} /> 导入任务
                    </h2>
                    <button type="button" onClick={handleClose} className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    {/* File Picker */}
                    <div>
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-6 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-lg text-slate-500 dark:text-slate-400 hover:border-blue-400 hover:text-blue-500 transition-colors flex flex-col items-center gap-2"
                        >
                            <FileText size={24} />
                            <span className="text-sm font-medium">
                                {fileName || '选择文件 (.json 或 .csv)'}
                            </span>
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".json,.csv"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                    </div>

                    {/* Template Download */}
                    {parsedTasks.length === 0 && (
                        <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
                            <span>没有文件？</span>
                            <button
                                onClick={() => downloadFile(generateJsonTemplate(), 'genmix_template.json', 'application/json')}
                                className="text-blue-500 hover:text-blue-600 underline flex items-center gap-0.5"
                            >
                                <Download size={10} /> JSON 模板
                            </button>
                            <button
                                onClick={() => downloadFile(generateCsvTemplate(), 'genmix_template.csv', 'text/csv')}
                                className="text-blue-500 hover:text-blue-600 underline flex items-center gap-0.5"
                            >
                                <Download size={10} /> CSV 模板
                            </button>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-3 rounded-md">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Preview + Strategy */}
                    {parsedTasks.length > 0 && (
                        <>
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                                    ✅ 解析到 {parsedTasks.length} 个任务
                                </p>
                                <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                                    {parsedTasks.slice(0, 5).map((t, i) => (
                                        <p key={i} className="text-xs text-green-600 dark:text-green-400 truncate">
                                            {i + 1}. {t.title} ({t.tool}, {t.resultType})
                                        </p>
                                    ))}
                                    {parsedTasks.length > 5 && (
                                        <p className="text-xs text-green-500">...还有 {parsedTasks.length - 5} 个</p>
                                    )}
                                </div>
                            </div>

                            {/* Reference Images Folder Selection */}
                            {needsImageMatching && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-sm font-medium text-blue-700 dark:text-blue-300 flex items-center gap-1.5">
                                            <ImageIcon size={14} />
                                            需要参考图片 ({matchCount}/{uniqueRequiredCount} 已匹配)
                                        </p>
                                        <button
                                            onClick={() => folderInputRef.current?.click()}
                                            className="text-xs px-2.5 py-1 bg-blue-100 hover:bg-blue-200 dark:bg-blue-800 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-300 rounded"
                                        >
                                            {referenceFolder.length > 0 ? '重新选择文件夹' : '选择图片文件夹'}
                                        </button>
                                        <input
                                            ref={folderInputRef}
                                            type="file"
                                            {...{ webkitdirectory: "", directory: "" }}
                                            className="hidden"
                                            onChange={handleFolderSelect}
                                        />
                                    </div>
                                    <p className="text-xs text-blue-600/80 dark:text-blue-400/80 leading-relaxed mb-2">
                                        任务列表中包含了参考图片文件名。请选择<b>包含这些图片的文件夹</b>，然后在弹窗中直接点击“上传/选择”。<br />
                                        <span className="opacity-70">注：在文件夹选择模式下，单个文件通常显示为不可选（灰色），这是正常现象。</span>
                                    </p>

                                    {/* Unmatched files list */}
                                    {referenceFolder.length > 0 && matchCount < uniqueRequiredCount && (
                                        <div className="mt-2 pt-2 border-t border-blue-200/50 dark:border-blue-800/50">
                                            <p className="text-xs font-medium text-amber-600 dark:text-amber-500 mb-1">未找到以下图片：</p>
                                            <div className="max-h-20 overflow-y-auto space-y-1">
                                                {Array.from(new Set(requiredImageNames))
                                                    .filter(name => !matchedImages.has(name.toLowerCase()))
                                                    .map(name => (
                                                        <p key={name} className="text-[11px] text-amber-600/80 dark:text-amber-500/80 truncate">
                                                            ❌ {name}
                                                        </p>
                                                    ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Strategy Buttons */}
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">合并策略</label>
                                <div className="space-y-1.5">
                                    {STRATEGIES.map(s => (
                                        <button
                                            key={s.key}
                                            onClick={() => setStrategy(s.key)}
                                            className={`w-full text-left p-2.5 rounded-md border text-sm transition-colors ${strategy === s.key
                                                ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                                : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                                }`}
                                        >
                                            <span className="font-medium">{s.label}</span>
                                            <span className="text-xs text-slate-400 ml-2">{s.desc}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {strategy === 'replace' && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2 rounded-md">
                                    ⚠️ 替换模式将清空所有现有任务，此操作不可恢复
                                </div>
                            )}
                        </>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleImport}
                        disabled={parsedTasks.length === 0 || importing}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50"
                    >
                        {importing ? '导入中...' : `导入 ${parsedTasks.length} 个任务`}
                    </button>
                </div>
            </div>
        </div>
    );
}
