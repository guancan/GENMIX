import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useActiveTab } from '@/hooks/useActiveTab';
import { useTaskQueue } from '@/hooks/useTaskQueue';
import { getImages, blobToBase64 } from '@/storage/imageStore';
import { Play, Copy, Square, PlayCircle, RotateCcw, FastForward, Loader2 } from 'lucide-react';
import { downloadAsZip } from '@/utils/downloadUtils';

export default function App() {
    const { tasks, loading, updateTask } = useTasks();
    const { currentTool, tabId } = useActiveTab();

    const visibleTasks = tasks.filter(t => t.tool === currentTool);

    const [error, setError] = useState<string | null>(null);
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());

    const toggleDownloading = (id: string, isDownloading: boolean) => {
        setDownloadingIds(prev => {
            const next = new Set(prev);
            if (isDownloading) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const handleDownloadAll = async (task: any, urls: string[]) => {
        const downloadId = `${task.id}_all`;
        if (downloadingIds.has(downloadId)) return;

        try {
            toggleDownloading(downloadId, true);
            await downloadAsZip(urls, task.tool, task.title);
        } catch (err) {
            console.error('Download failed:', err);
            setError('Download failed. Please try again.');
        } finally {
            toggleDownloading(downloadId, false);
        }
    };

    // Auto-clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    // Core execution function: returns true on success, false on failure
    const executeTask = useCallback(async (taskId: string): Promise<{ success: boolean; retryAfterRedirect?: boolean }> => {
        if (!tabId) return { success: false };

        const task = tasks.find(t => t.id === taskId);
        if (!task) return { success: false };

        setError(null);
        await updateTask(taskId, { status: 'in_progress' });

        try {
            // Load reference images from IndexedDB and convert to base64
            let imageDataUrls: string[] = [];
            let imageIds = Array.isArray(task.referenceImageIds) ? task.referenceImageIds : [];
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
                task: task             // pass full task (including resultType) for adapter validation
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
                return { success: true };
            } else if (response && response.redirectUrl) {
                console.log(`[Genmix] Task ${task.id} requires redirect to:`, response.redirectUrl);
                // Update the tab URL
                await chrome.tabs.update(tabId, { url: response.redirectUrl });
                // Mark task as pending (not failed) since it's just waiting for a redirect
                setError(`Redirecting to match requested Result Type (${task.resultType})...`);
                await updateTask(taskId, { status: 'pending' });
                return { success: false, retryAfterRedirect: true };
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
            return { success: false };
        }
    }, [tabId, tasks, updateTask]);

    const handleStop = useCallback(() => {
        if (tabId) {
            chrome.tabs.sendMessage(tabId, { type: 'CANCEL_EXECUTION' }).catch(() => { });
        }
    }, [tabId]);

    const queue = useTaskQueue({ executeTask, onStop: handleStop });

    // --- Visibility Warning Logic ---
    const [isTargetTabVisible, setIsTargetTabVisible] = useState(true);

    useEffect(() => {
        const checkVisibility = async () => {
            if (!tabId) {
                setIsTargetTabVisible(false);
                return;
            }

            try {
                // Get current active tab in current window
                const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                // Get focus state of that window
                const window = await chrome.windows.getLastFocused();

                // Visible if target tab is active in current window AND window is focused
                const visible = activeTab?.id === tabId && window.focused;
                setIsTargetTabVisible(visible);
            } catch (err) {
                setIsTargetTabVisible(false);
            }
        };

        // Initial check
        checkVisibility();

        // Listen for changes
        const onTabActivated = () => checkVisibility();
        const onWindowFocusChanged = () => checkVisibility();
        const onTabUpdated = (id: number, changeInfo: any) => {
            if (id === tabId && (changeInfo.status === 'complete' || changeInfo.url)) {
                checkVisibility();
            }
        };

        chrome.tabs.onActivated.addListener(onTabActivated);
        chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
        chrome.tabs.onUpdated.addListener(onTabUpdated);

        return () => {
            chrome.tabs.onActivated.removeListener(onTabActivated);
            chrome.windows.onFocusChanged.removeListener(onWindowFocusChanged);
            chrome.tabs.onUpdated.removeListener(onTabUpdated);
        };
    }, [tabId]);

    // System Notification Logic
    useEffect(() => {
        if (queue.isRunning && !isTargetTabVisible) {
            // Trigger notification
            chrome.notifications.create({
                type: 'basic',
                iconUrl: 'icon-34.png',
                title: 'Genmix 运行提示',
                message: '⚠️ Genmix 在执行任务时，建议您保持网页在前台 ⚠️',
                priority: 2
            });
        }
    }, [queue.isRunning, isTargetTabVisible]);

    const openDashboard = () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    };

    const handleRunAll = () => {
        const ids = visibleTasks.map(t => t.id);
        queue.runAll(ids);
    };

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
            {/* Visibility Warning Banner */}
            {queue.isRunning && !isTargetTabVisible && (
                <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800/50 px-3 py-2 text-amber-700 dark:text-amber-400 text-[11px] font-medium flex items-center justify-center animate-pulse">
                    <span className="mr-1.5 flex-shrink-0">⚠️</span>
                    <span className="text-center font-bold">Genmix 在执行任务时，建议您保持网页在前台</span>
                    <span className="ml-1.5 flex-shrink-0">⚠️</span>
                </div>
            )}

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
                                                    {parsed?.type === 'image' ? '🖼️ Image Result' : parsed?.type === 'video' ? '🎬 Video Result' : 'Latest Result'}
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
                                                            {allUrls.map((url: string, i: number) => {
                                                                const src = i === 0 ? primarySrc : url;
                                                                return (
                                                                    <a
                                                                        key={i}
                                                                        href={src}
                                                                        target="_blank"
                                                                        rel="noopener noreferrer"
                                                                        title="Click to view full size"
                                                                    >
                                                                        <img
                                                                            src={src}
                                                                            alt={`Result ${i + 1}`}
                                                                            className="w-full h-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer bg-slate-100 dark:bg-slate-900"
                                                                        />
                                                                    </a>
                                                                );
                                                            })}
                                                        </div>
                                                        <div className="flex space-x-2">
                                                            <button
                                                                onClick={() => handleDownloadAll(task, allUrls)}
                                                                disabled={downloadingIds.has(`${task.id}_all`)}
                                                                className="flex-1 text-center text-xs bg-green-600 hover:bg-green-700 text-white py-1 rounded disabled:opacity-50 flex items-center justify-center space-x-1"
                                                            >
                                                                {downloadingIds.has(`${task.id}_all`) ? (
                                                                    <>
                                                                        <Loader2 size={12} className="animate-spin" />
                                                                        <span>Bundling ZIP...</span>
                                                                    </>
                                                                ) : (
                                                                    <span>{allUrls.length > 1 ? `Download All (${allUrls.length})` : 'Download'}</span>
                                                                )}
                                                            </button>
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
                                            })() : parsed?.type === 'video' ? (
                                                <div className="space-y-2">
                                                    <a href={parsed.videoUrl} target="_blank" rel="noopener noreferrer" title="Click to open video">
                                                        <video
                                                            src={parsed.videoUrl}
                                                            controls
                                                            autoPlay
                                                            loop
                                                            className="w-full max-h-[120px] object-cover rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity"
                                                        />
                                                    </a>
                                                    <div className="flex space-x-2">
                                                        <button
                                                            onClick={() => handleDownloadAll(task, [parsed.videoUrl])}
                                                            disabled={downloadingIds.has(`${task.id}_all`)}
                                                            className="flex-1 text-center text-xs bg-green-600 hover:bg-green-700 text-white py-1 rounded disabled:opacity-50 flex items-center justify-center space-x-1"
                                                        >
                                                            {downloadingIds.has(`${task.id}_all`) ? (
                                                                <>
                                                                    <Loader2 size={12} className="animate-spin" />
                                                                    <span>Preparing...</span>
                                                                </>
                                                            ) : (
                                                                <span>Download</span>
                                                            )}
                                                        </button>
                                                        <button
                                                            onClick={() => navigator.clipboard.writeText(parsed.videoUrl)}
                                                            className="flex-1 text-xs bg-slate-200 hover:bg-slate-300 text-slate-700 py-1 rounded"
                                                        >
                                                            Copy URL
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
                                                    {parsed?.content || latestResult.content}
                                                </div>
                                            )}

                                            {results.length > 1 && (
                                                <div className="mt-2 text-center pb-1">
                                                    <button
                                                        onClick={openDashboard}
                                                        className="text-[11px] text-blue-600 dark:text-blue-400 font-medium hover:text-blue-700 dark:hover:text-blue-300 transition-colors cursor-pointer flex items-center justify-center mx-auto space-x-1"
                                                    >
                                                        <span>+ {results.length - 1} earlier results (View in Dashboard)</span>
                                                    </button>
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
