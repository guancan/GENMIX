import { useState } from 'react';
import { X, Download, Loader2, AlertCircle } from 'lucide-react';
import type { Task } from '@/types/task';
import { exportTasksAsJson, exportTasksAsCsv, downloadFile, exportMediaAsZip, extractMediaUrls } from '@/utils/importExport';

interface ExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    tasks: Task[];
    tabLabel: string;
}

type ExportFormat = 'json' | 'csv' | 'media';

export function ExportModal({ isOpen, onClose, tasks, tabLabel }: ExportModalProps) {
    const [format, setFormat] = useState<ExportFormat>('json');
    const [mediaMode, setMediaMode] = useState<'flat' | 'per-task'>('per-task');
    const [exporting, setExporting] = useState(false);
    const [progress, setProgress] = useState<{ percent: number; status: string } | null>(null);
    const [result, setResult] = useState<{ downloaded: number; failed: number } | null>(null);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    // Count total media items for preview
    const totalMedia = tasks.reduce((sum, t) => sum + extractMediaUrls(t).length, 0);

    const handleExport = async () => {
        setError('');
        setResult(null);

        if (format === 'json') {
            const timestamp = new Date().toISOString().slice(0, 10);
            const content = exportTasksAsJson(tasks);
            downloadFile(content, `genmix_tasks_${tabLabel}_${timestamp}.json`, 'application/json');
            onClose();
        } else if (format === 'csv') {
            const timestamp = new Date().toISOString().slice(0, 10);
            const content = exportTasksAsCsv(tasks);
            downloadFile(content, `genmix_tasks_${tabLabel}_${timestamp}.csv`, 'text/csv');
            onClose();
        } else {
            // Media export
            setExporting(true);
            setProgress({ percent: 0, status: '准备中...' });
            try {
                const res = await exportMediaAsZip(tasks, tabLabel, mediaMode, (percent, status) => {
                    setProgress({ percent, status });
                });
                setResult(res);
                setExporting(false);
                setProgress(null);
                // Auto-close after short delay on success
                setTimeout(() => {
                    setResult(null);
                    onClose();
                }, 2000);
            } catch (err) {
                setError(err instanceof Error ? err.message : '导出失败');
                setExporting(false);
                setProgress(null);
            }
        }
    };

    const handleClose = () => {
        if (exporting) return; // Don't close while exporting
        setProgress(null);
        setResult(null);
        setError('');
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Download size={18} /> 导出任务
                    </h2>
                    <button type="button" onClick={handleClose} disabled={exporting}
                        className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-50">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-4 space-y-4">
                    <div className="bg-slate-50 dark:bg-slate-900/30 rounded-md p-3 text-sm">
                        <p className="text-slate-700 dark:text-slate-300">
                            将导出 <strong className="text-blue-600 dark:text-blue-400">{tabLabel}</strong> 下的 <strong>{tasks.length}</strong> 个任务
                            {totalMedia > 0 && <span className="text-slate-400 ml-1">({totalMedia} 个媒体文件)</span>}
                        </p>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">导出格式</label>
                        <div className="grid grid-cols-3 gap-2">
                            <button
                                onClick={() => setFormat('json')}
                                disabled={exporting}
                                className={`p-3 rounded-md border text-sm font-medium transition-colors text-center ${format === 'json'
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <div className="text-lg mb-1">📦</div>
                                <div>JSON</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">完整数据</div>
                            </button>
                            <button
                                onClick={() => setFormat('csv')}
                                disabled={exporting}
                                className={`p-3 rounded-md border text-sm font-medium transition-colors text-center ${format === 'csv'
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <div className="text-lg mb-1">📊</div>
                                <div>CSV</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">表格格式</div>
                            </button>
                            <button
                                onClick={() => setFormat('media')}
                                disabled={exporting || totalMedia === 0}
                                className={`p-3 rounded-md border text-sm font-medium transition-colors text-center ${format === 'media'
                                    ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                    : totalMedia === 0
                                        ? 'border-slate-200 text-slate-300 dark:border-slate-700 dark:text-slate-600 cursor-not-allowed'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-700'
                                    }`}
                            >
                                <div className="text-lg mb-1">📁</div>
                                <div>媒体</div>
                                <div className="text-[10px] text-slate-400 mt-0.5">{totalMedia} 个文件</div>
                            </button>
                        </div>
                    </div>

                    {/* Media options */}
                    {format === 'media' && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">打包方式</label>
                            <div className="grid grid-cols-2 gap-2">
                                <button
                                    onClick={() => setMediaMode('per-task')}
                                    disabled={exporting}
                                    className={`p-2.5 rounded-md border text-sm transition-colors text-left ${mediaMode === 'per-task'
                                        ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                                        }`}
                                >
                                    <div className="font-medium">📂 按任务分文件夹</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">每个任务一个子文件夹</div>
                                </button>
                                <button
                                    onClick={() => setMediaMode('flat')}
                                    disabled={exporting}
                                    className={`p-2.5 rounded-md border text-sm transition-colors text-left ${mediaMode === 'flat'
                                        ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:border-blue-500 dark:text-blue-400'
                                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400'
                                        }`}
                                >
                                    <div className="font-medium">📄 全部放一个文件夹</div>
                                    <div className="text-[10px] text-slate-400 mt-0.5">平铺所有文件</div>
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Progress bar */}
                    {progress && (
                        <div className="space-y-1.5">
                            <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                <Loader2 size={14} className="animate-spin" />
                                <span>{progress.status}</span>
                            </div>
                            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
                                <div
                                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                    style={{ width: `${progress.percent}%` }}
                                />
                            </div>
                        </div>
                    )}

                    {/* Result */}
                    {result && (
                        <div className="text-sm bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 p-3 rounded-md">
                            ✅ 下载完成：{result.downloaded} 个文件
                            {result.failed > 0 && <span className="text-amber-600"> (⚠️ {result.failed} 个失败，详见 errors.txt)</span>}
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 p-3 rounded-md">
                            <AlertCircle size={14} />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 p-4 border-t border-slate-200 dark:border-slate-700">
                    <button
                        onClick={handleClose}
                        disabled={exporting}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md disabled:opacity-50"
                    >
                        {result ? '关闭' : '取消'}
                    </button>
                    {!result && (
                        <button
                            onClick={handleExport}
                            disabled={tasks.length === 0 || exporting}
                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md disabled:opacity-50 flex items-center gap-1"
                        >
                            {exporting ? (
                                <><Loader2 size={14} className="animate-spin" /> 导出中...</>
                            ) : (
                                <><Download size={14} /> 导出 {format === 'media' ? 'ZIP' : format.toUpperCase()}</>
                            )}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
