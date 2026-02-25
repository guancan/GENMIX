import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useActiveTab } from '@/hooks/useActiveTab';
import { useTaskQueue } from '@/hooks/useTaskQueue';
import { getImages, blobToBase64 } from '@/storage/imageStore';
import { Play, Copy, Square, PlayCircle, RotateCcw, FastForward } from 'lucide-react';

export default function App() {
    const { tasks, loading, updateTask } = useTasks();
    const { currentTool, tabId } = useActiveTab();

    const visibleTasks = tasks.filter(t => t.tool === currentTool);

    const [error, setError] = useState<string | null>(null);

    // Auto-clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Core execution function: returns true on success, false on failure
    const executeTask = useCallback(async (taskId: string): Promise<boolean> => {
        if (!tabId) return false;

        const task = tasks.find(t => t.id === taskId);
        if (!task) return false;

        setError(null);
        await updateTask(taskId, { status: 'in_progress' });

        try {
            // Load reference images from IndexedDB and convert to base64
            let imageDataUrls: string[] = [];
            const imageIds = task.referenceImageIds || [];
            if (imageIds.length > 0) {
                const storedImages = await getImages(imageIds);
                imageDataUrls = await Promise.all(
                    storedImages.map(s => blobToBase64(s.blob))
                );
            }

            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'EXECUTE_PROMPT',
                payload: task.prompt,
                images: imageDataUrls, // base64 data URLs for content script
            });

            if (response && response.success) {
                const newResult = {
                    id: Date.now().toString(),
                    content: response.result || '',
                    createdAt: Date.now()
                };

                const currentResults = Array.isArray(task.results) ? task.results : [];

                await updateTask(taskId, {
                    results: [...currentResults, newResult],
                    status: 'completed',
                    lastExecutedAt: Date.now()
                });
                return true;
            } else {
                throw new Error(response?.error || 'Unknown error');
            }
        } catch (e: any) {
            console.error('Failed to execute task:', e);
            await updateTask(taskId, { status: 'failed' });

            if (e.message?.includes('Could not establish connection')) {
                setError('Please refresh the page to enable Genmix.');
            } else {
                setError('Failed: ' + (e.message || ''));
            }
            return false;
        }
    }, [tabId, tasks, updateTask]);

    const queue = useTaskQueue({ executeTask });

    const openDashboard = () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    };

    const handleRunAll = () => {
        const ids = visibleTasks.map(t => t.id);
        queue.runAll(ids);
    };

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <header className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm relative">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-sm font-semibold text-slate-900 dark:text-white">Genmix Assistant</h1>
                    <button onClick={openDashboard} className="text-xs text-blue-600 hover:underline">Open Dashboard</button>
                </div>
                <div className="flex items-center space-x-2 mb-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${currentTool !== 'unknown' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {currentTool === 'unknown' ? 'No Tool Detected' : currentTool}
                    </span>
                </div>

                {/* Queue Controls */}
                {visibleTasks.length > 0 && (
                    <div className="space-y-2">
                        {/* Run All / Stop */}
                        <div className="flex items-center space-x-2">
                            {!queue.isRunning ? (
                                <button
                                    onClick={handleRunAll}
                                    disabled={visibleTasks.length === 0}
                                    className="flex-1 flex items-center justify-center space-x-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded transition-colors"
                                >
                                    <PlayCircle size={14} />
                                    <span>Run All ({visibleTasks.length})</span>
                                </button>
                            ) : (
                                <button
                                    onClick={queue.stop}
                                    className="flex-1 flex items-center justify-center space-x-1 text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 px-3 rounded transition-colors"
                                >
                                    <Square size={12} />
                                    <span>Stop Queue</span>
                                </button>
                            )}
                        </div>

                        {/* Toggle Switches */}
                        <div className="flex items-center justify-between text-[11px]">
                            <label className="flex items-center space-x-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-400">
                                <input
                                    type="checkbox"
                                    checked={queue.autoNext}
                                    onChange={e => queue.setAutoNext(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded accent-blue-600"
                                />
                                <FastForward size={12} />
                                <span>Auto Next</span>
                            </label>
                            <label className="flex items-center space-x-1.5 cursor-pointer select-none text-slate-600 dark:text-slate-400">
                                <input
                                    type="checkbox"
                                    checked={queue.retryOnFail}
                                    onChange={e => queue.setRetryOnFail(e.target.checked)}
                                    className="w-3.5 h-3.5 rounded accent-orange-500"
                                />
                                <RotateCcw size={12} />
                                <span>Retry Failed</span>
                            </label>
                        </div>
                    </div>
                )}

                {error && (
                    <div className="absolute left-0 top-full w-full bg-red-500 text-white text-xs p-2 text-center animate-pulse z-10">
                        {error}
                    </div>
                )}
            </header>

            <div className="flex-1 overflow-auto p-4 space-y-4">
                {loading ? (
                    <div className="text-center text-slate-400 text-sm mt-10">Loading...</div>
                ) : visibleTasks.length === 0 ? (
                    <div className="text-center mt-10">
                        <div className="text-4xl mb-2">😴</div>
                        <p className="text-sm text-slate-500">No tasks for {currentTool !== 'unknown' ? currentTool : 'this site'}.</p>
                        {currentTool === 'unknown' && (
                            <p className="text-xs text-slate-400 mt-2">Navigate to ChatGPT or Gemini to see context.</p>
                        )}
                    </div>
                ) : (
                    visibleTasks.map(task => {
                        const t = task as any;
                        const results = Array.isArray(t.results) ? t.results : (t.result ? [{ id: 'legacy', content: t.result, createdAt: t.updatedAt }] : []);
                        const latestResult = results.length > 0 ? results[results.length - 1] : null;

                        const isExecuting = queue.executingId === task.id;
                        const queuePosition = queue.queuedIds.indexOf(task.id);
                        const isQueued = queuePosition >= 0;
                        const isDisabled = queue.isRunning; // Disable manual buttons while queue is active

                        return (
                            <div
                                key={task.id}
                                className={`bg-white dark:bg-slate-800 p-3 rounded-lg border shadow-sm transition-all ${isExecuting
                                    ? 'border-blue-400 ring-1 ring-blue-200 dark:ring-blue-800'
                                    : isQueued
                                        ? 'border-slate-200 dark:border-slate-700 opacity-75'
                                        : 'border-slate-200 dark:border-slate-700 hover:shadow-md'
                                    }`}
                            >
                                <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">{task.title}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                                    "{task.prompt}"
                                </p>

                                <div className="flex items-center space-x-2 mb-3">
                                    {isExecuting ? (
                                        <div className="flex-1 text-xs px-3 py-1.5 rounded flex items-center justify-center space-x-1 bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                            <span className="animate-spin inline-block w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full" />
                                            <span>Executing...</span>
                                        </div>
                                    ) : isQueued ? (
                                        <div className="flex-1 text-xs px-3 py-1.5 rounded flex items-center justify-center space-x-1 bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                                            <span>🕐 Queued #{queuePosition + 1}</span>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => queue.runSingle(task.id)}
                                            disabled={isDisabled}
                                            className={`flex-1 text-white text-xs px-3 py-1.5 rounded flex items-center justify-center space-x-1 transition-colors ${isDisabled
                                                ? 'bg-slate-300 cursor-not-allowed'
                                                : 'bg-blue-600 hover:bg-blue-700'
                                                }`}
                                        >
                                            <Play size={12} />
                                            <span>{results.length > 0 ? 'Run Again' : 'Send & Capture'}</span>
                                        </button>
                                    )}
                                    <button
                                        onClick={() => navigator.clipboard.writeText(task.prompt)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                        title="Copy prompt"
                                    >
                                        <Copy size={12} />
                                    </button>
                                </div>

                                {/* Status badge */}
                                {task.status === 'failed' && !isExecuting && !isQueued && (
                                    <div className="text-[10px] text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded mb-2 text-center">
                                        ❌ Failed — click Run Again to retry
                                    </div>
                                )}

                                {/* Results Display */}
                                {latestResult && (() => {
                                    let parsed: any = null;
                                    try {
                                        parsed = JSON.parse(latestResult.content);
                                    } catch {
                                        // Not JSON
                                    }

                                    return (
                                        <div className="border-t border-slate-100 dark:border-slate-700 pt-2">
                                            <div className="flex items-center justify-between mb-1">
                                                <span className="text-[10px] uppercase font-bold text-slate-400">
                                                    {parsed?.type === 'image' ? '🖼️ Image Result' : 'Latest Result'}
                                                </span>
                                                <span className="text-[10px] text-slate-400">{new Date(latestResult.createdAt).toLocaleTimeString()}</span>
                                            </div>

                                            {parsed?.type === 'image' ? (() => {
                                                const allUrls: string[] = parsed.allImageUrls?.length
                                                    ? parsed.allImageUrls
                                                    : [parsed.imageBase64 || parsed.imageUrl].filter(Boolean);
                                                const primarySrc = parsed.imageBase64 || parsed.imageUrl || allUrls[0];

                                                return (
                                                    <div className="space-y-2">
                                                        {parsed.imageDescription && (
                                                            <p className="text-[10px] text-slate-500 italic">"{parsed.imageDescription}"</p>
                                                        )}
                                                        <div className={`grid gap-1 ${allUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                            {allUrls.map((url: string, i: number) => (
                                                                <a
                                                                    key={i}
                                                                    href={i === 0 ? primarySrc : url}
                                                                    download={`genmix-${Date.now()}-${i + 1}.webp`}
                                                                    title={`Download image ${i + 1}`}
                                                                >
                                                                    <img
                                                                        src={i === 0 ? primarySrc : url}
                                                                        alt={`Result ${i + 1}`}
                                                                        className="w-full rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer"
                                                                    />
                                                                </a>
                                                            ))}
                                                        </div>
                                                        <div className="flex space-x-2">
                                                            <a
                                                                href={primarySrc}
                                                                download={`genmix-${Date.now()}.webp`}
                                                                className="flex-1 text-center text-xs bg-green-600 hover:bg-green-700 text-white py-1 rounded"
                                                            >
                                                                {allUrls.length > 1 ? `Download All (${allUrls.length})` : 'Download'}
                                                            </a>
                                                            <button
                                                                onClick={() => navigator.clipboard.writeText(
                                                                    allUrls.length > 1 ? allUrls.join('\n') : (parsed.imageUrl || '')
                                                                )}
                                                                className="flex-1 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 py-1 rounded"
                                                            >
                                                                {allUrls.length > 1 ? 'Copy All URLs' : 'Copy URL'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                );
                                            })() : (
                                                <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
                                                    {parsed?.content || latestResult.content}
                                                </div>
                                            )}

                                            {results.length > 1 && (
                                                <div className="mt-1 text-center">
                                                    <span className="text-[10px] text-slate-400 cursor-pointer hover:text-slate-600">
                                                        + {results.length - 1} earlier results (View in Dashboard)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
