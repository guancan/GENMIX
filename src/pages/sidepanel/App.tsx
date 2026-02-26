import { useState, useEffect, useCallback } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useActiveTab } from '@/hooks/useActiveTab';
import { useTaskQueue } from '@/hooks/useTaskQueue';
import { getImages, blobToBase64 } from '@/storage/imageStore';
import { cacheMediaUrls } from '@/storage/mediaStore';
import { Play, Square, PlayCircle, RotateCcw, Loader2, Plus, Settings, ScanSearch } from 'lucide-react';
import { downloadAsZip } from '@/utils/downloadUtils';
import FetchImage from './FetchImage';
import ReferenceImageThumbnail from './ReferenceImageThumbnail';
import { MediaThumbnail } from '@/components/MediaThumbnail';
import { ResultCapturePanel } from '@/components/ResultCapturePanel';
import type { CapturedItem } from '@/content/adapters/types';
import type { TaskResult } from '@/types/task';

export default function App() {
    const { tasks, loading, updateTask } = useTasks();
    const { currentTool, tabId } = useActiveTab();

    const [resultTypeFilter, setResultTypeFilter] = useState<string>('all');

    const toolTasks = tasks.filter(t => t.tool === currentTool);
    const visibleTasks = resultTypeFilter === 'all'
        ? toolTasks
        : toolTasks.filter(t => t.resultType === resultTypeFilter);

    const [error, setError] = useState<string | null>(null);
    const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    // Result capture state
    const [isCaptureOpen, setIsCaptureOpen] = useState(false);
    const [capturedItems, setCapturedItems] = useState<CapturedItem[]>([]);
    const [isScanning, setIsScanning] = useState(false);

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
    const executeTask = useCallback(async ({ taskId, fillOnly = false }: { taskId: string, fillOnly?: boolean }): Promise<{ success: boolean; retryAfterRedirect?: boolean }> => {
        if (!tabId) return { success: false };

        const task = tasks.find(t => t.id === taskId);
        if (!task) return { success: false };

        setError(null);
        // If fillOnly, we might not want to show a long "in_progress" state, but we do it briefly
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
                payload: {
                    ...task,
                    fillOnly // Pass the flag to content script
                },
                images: imageDataUrls, // base64 data URLs for content script
                task: task             // pass full task for adapter validation
            });

            if (response && response.success) {
                if (fillOnly) {
                    // In fillOnly mode, there is no new result to append
                    await updateTask(taskId, { status: 'pending' }); // Reset to pending ready to run
                    return { success: true };
                }

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

                // Cache media blobs to IndexedDB (async, non-blocking)
                // The sidepanel has privileged fetch (no CORS), so this is the ideal place.
                try {
                    const parsed = JSON.parse(response.result || '{}');
                    const mediaUrls: { url: string; type: 'image' | 'video' }[] = [];
                    if (parsed.type === 'image') {
                        const urls: string[] = parsed.allImageUrls?.length
                            ? parsed.allImageUrls
                            : [parsed.imageUrl].filter(Boolean);
                        for (const u of urls) mediaUrls.push({ url: u, type: 'image' });
                    } else if (parsed.type === 'video' && parsed.videoUrl) {
                        mediaUrls.push({ url: parsed.videoUrl, type: 'video' });
                    }

                    console.log(`[Genmix Cache] Found ${mediaUrls.length} media URLs to cache`, mediaUrls.map(m => m.url.substring(0, 60)));

                    if (mediaUrls.length > 0) {
                        console.log('[Genmix Cache] Starting media download...');
                        const cached = await cacheMediaUrls(mediaUrls);
                        console.log(`[Genmix Cache] Cached ${cached.length}/${mediaUrls.length} media blobs`, cached.map(c => c.mediaId));

                        if (cached.length > 0) {
                            const cachedMediaIds = cached.map(c => c.mediaId);
                            // Use the results we already have in scope (NOT stale tasks closure)
                            const allResults = [...currentResults, { ...newResult, cachedMediaIds }];
                            await updateTask(taskId, { results: allResults });
                            console.log(`[Genmix Cache] ✅ Updated task ${taskId} with cachedMediaIds`, cachedMediaIds);
                        }
                    }
                } catch (cacheErr) {
                    console.warn('[Genmix Cache] ❌ Media caching failed (non-fatal):', cacheErr);
                }

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

    const handleScanPage = async () => {
        setIsCaptureOpen(true);
        setIsScanning(true);
        setCapturedItems([]);
        try {
            if (!tabId) throw new Error('No tab ID');

            // Try sending message to existing content script
            let items: CapturedItem[] = [];
            try {
                const response = await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE_RESULTS' });
                if (response?.success && response.items) {
                    items = response.items;
                }
            } catch {
                // Content script not injected — use dynamic injection with inline function
                console.log('[Genmix] Content script not found, scanning via chrome.scripting...');
                const results = await chrome.scripting.executeScript({
                    target: { tabId },
                    func: () => {
                        // Inline scanning function — replicates adapter selectors
                        const items: any[] = [];
                        const host = window.location.hostname;

                        if (host.includes('gemini.google.com')) {
                            const responses = document.querySelectorAll('model-response');
                            responses.forEach((response, idx) => {
                                const imageElements = Array.from(response.querySelectorAll('generated-image img.image'));
                                const imageUrls = imageElements.map(img => (img as HTMLImageElement).src).filter(src => src && !src.startsWith('data:image/svg'));
                                if (imageUrls.length > 0) {
                                    items.push({ id: `gemini-img-${idx}`, type: 'image', url: imageUrls[0], urls: imageUrls, thumbnail: imageUrls[0], sourceIndex: idx });
                                }
                                const videoElements = Array.from(response.querySelectorAll('generated-video video'));
                                videoElements.forEach((v, vIdx) => {
                                    const vUrl = (v as HTMLVideoElement).src;
                                    if (vUrl) items.push({ id: `gemini-vid-${idx}-${vIdx}`, type: 'video', url: vUrl, thumbnail: vUrl, sourceIndex: idx });
                                });
                                const markdownEl = response.querySelector('message-content .markdown');
                                if (markdownEl) {
                                    const clone = markdownEl.cloneNode(true) as HTMLElement;
                                    clone.querySelectorAll('.attachment-container').forEach(a => a.remove());
                                    clone.querySelectorAll('.thoughts-container').forEach(t => t.remove());
                                    const rawText = clone.textContent?.trim() || '';
                                    const htmlContent = clone.innerHTML?.trim() || '';
                                    if (rawText.length > 0) items.push({ id: `gemini-txt-${idx}`, type: 'text', rawText, htmlContent, sourceIndex: idx });
                                }
                            });
                        } else if (host.includes('chatgpt.com')) {
                            const turns = document.querySelectorAll('article[data-turn="assistant"]');
                            turns.forEach((turn, idx) => {
                                const imageContainer = turn.querySelector('[class*="imagegen-image"]') || turn.querySelector('[id^="image-"]');
                                if (imageContainer) {
                                    const imgEl = imageContainer.querySelector('img[src*="backend-api/estuary"]') || imageContainer.querySelector('img[alt="Generated image"]');
                                    if (imgEl) {
                                        const imgUrl = (imgEl as HTMLImageElement).src;
                                        if (imgUrl) items.push({ id: `chatgpt-img-${idx}`, type: 'image', url: imgUrl, urls: [imgUrl], thumbnail: imgUrl, sourceIndex: idx });
                                    }
                                }
                                const markdown = turn.querySelector('.markdown');
                                if (markdown) {
                                    const rawText = (markdown as HTMLElement).innerText?.trim();
                                    const htmlContent = (markdown as HTMLElement).innerHTML?.trim();
                                    if (rawText && rawText.length > 0) items.push({ id: `chatgpt-txt-${idx}`, type: 'text', rawText, htmlContent, sourceIndex: idx });
                                }
                            });
                        } else if (host.includes('jimeng.jianying.com')) {
                            const allItems = document.querySelectorAll('.item-Xh64V7[data-index]');
                            allItems.forEach((item) => {
                                const idx = parseInt(item.getAttribute('data-index') || '0', 10);
                                const itemId = item.getAttribute('data-id') || `${idx}`;
                                if (item.querySelector('[class*="loading-container-"]')) return;
                                if (item.querySelector('[class*="error-tips-"]')) return;
                                const images = item.querySelectorAll<HTMLImageElement>('img[class*="image-TLmgkP"]');
                                if (images.length > 0) {
                                    const imageUrls = Array.from(images).map(img => img.src).filter(Boolean);
                                    if (imageUrls.length > 0) items.push({ id: `jimeng-img-${itemId}`, type: 'image', url: imageUrls[0], urls: imageUrls, thumbnail: imageUrls[0], sourceIndex: idx });
                                }
                                const video = item.querySelector<HTMLVideoElement>('video:not([class*="loading-animation-"])');
                                if (video?.src) items.push({ id: `jimeng-vid-${itemId}`, type: 'video', url: video.src, thumbnail: video.src, sourceIndex: idx });
                            });
                            items.reverse(); // Jimeng data-index=0 is newest
                        }
                        return items;
                    },
                });
                if (results?.[0]?.result) {
                    items = results[0].result as CapturedItem[];
                }
            }

            setCapturedItems(items);
        } catch (err) {
            console.error('[Genmix] Scan error:', err);
        } finally {
            setIsScanning(false);
        }
    };

    const handleCaptureImport = async (taskId: string, results: TaskResult[]) => {
        // Get the current task and append the new results
        const task = tasks.find(t => t.id === taskId);
        if (!task) return;
        await updateTask(taskId, {
            results: [...task.results, ...results],
            status: 'completed',
        });
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
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center space-x-2">
                        <h1 className="text-sm font-semibold text-slate-900 dark:text-white">Genmix Assistant</h1>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-sm font-medium ${currentTool !== 'unknown' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                            {currentTool === 'unknown' ? 'No Tool Detected' : currentTool}
                        </span>
                    </div>
                    <button onClick={openDashboard} className="text-xs text-blue-600 hover:underline">Open Dashboard</button>
                </div>

                {/* Queue Controls & Filters */}
                {toolTasks.length > 0 && (
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex-1 mr-2 max-w-[120px]">
                            <select
                                value={resultTypeFilter}
                                onChange={e => setResultTypeFilter(e.target.value)}
                                className="w-full text-xs font-medium border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 rounded py-1.5 px-2 focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-700 dark:text-slate-300 cursor-pointer"
                            >
                                <option value="all">类型: 全部</option>
                                <option value="image">类型: 🖼️ 图片</option>
                                <option value="video">类型: 🎬 视频</option>
                                <option value="text">类型: 📝 文本</option>
                            </select>
                        </div>
                        <div className="flex items-center space-x-1 relative">
                            {!queue.isRunning ? (
                                <button
                                    onClick={handleRunAll}
                                    disabled={visibleTasks.length === 0}
                                    className="flex items-center justify-center space-x-1 text-xs bg-blue-600 hover:bg-blue-700 text-white py-1.5 px-3 rounded transition-colors"
                                >
                                    <PlayCircle size={14} />
                                    <span>Run All ({visibleTasks.length})</span>
                                </button>
                            ) : (
                                <button
                                    onClick={queue.stop}
                                    className="flex items-center justify-center space-x-1 text-xs bg-red-500 hover:bg-red-600 text-white py-1.5 px-3 rounded transition-colors"
                                >
                                    <Square size={12} />
                                    <span>Stop Queue</span>
                                </button>
                            )}
                            <button
                                onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                                className={`p-1.5 rounded transition-colors ${isSettingsOpen ? 'bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                            >
                                <Settings size={14} />
                            </button>
                            {isSettingsOpen && (
                                <div className="absolute right-0 top-full mt-1.5 w-40 bg-white dark:bg-slate-800 rounded shadow-lg border border-slate-200 dark:border-slate-700 p-2 z-50">
                                    <label className="flex items-center justify-between cursor-pointer text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 p-1.5 rounded transition-colors">
                                        <div className="flex items-center space-x-1.5">
                                            <RotateCcw size={13} className="text-orange-500" />
                                            <span className="font-medium">Retry Failed</span>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={queue.retryOnFail}
                                            onChange={e => queue.setRetryOnFail(e.target.checked)}
                                            className="w-3.5 h-3.5 rounded accent-orange-500 cursor-pointer"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Capture Page Results — in header */}
                <button
                    onClick={handleScanPage}
                    className="flex items-center justify-center gap-1.5 w-full text-xs py-1.5 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:border-indigo-500 transition-all"
                >
                    <ScanSearch size={14} />
                    <span>Capture Page Results</span>
                </button>

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
                                <div className="flex items-center space-x-2 mb-1">
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium flex-shrink-0 ${task.resultType === 'image' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300'
                                        : task.resultType === 'video' ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300'
                                            : task.resultType === 'text' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                                : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                        }`}>
                                        {task.resultType === 'image' ? '🖼️' : task.resultType === 'video' ? '🎬' : task.resultType === 'text' ? '📝' : '🔀'}
                                    </span>
                                    <h3 className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.title}</h3>
                                </div>

                                {/* Reference Images Indicator */}
                                {task.referenceImageIds && task.referenceImageIds.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mb-2">
                                        {task.referenceImageIds.map((id: string) => (
                                            <ReferenceImageThumbnail key={id} imageId={id} />
                                        ))}
                                    </div>
                                )}

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
                                        <div className="flex-1 flex space-x-1">
                                            <button
                                                onClick={() => executeTask({ taskId: task.id, fillOnly: true })}
                                                disabled={isDisabled}
                                                className={`flex-1 flex max-w-[80px] text-slate-600 dark:text-slate-300 text-[11px] px-2 py-1.5 rounded flex items-center justify-center space-x-1 transition-colors border ${isDisabled
                                                    ? 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 cursor-not-allowed opacity-50'
                                                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-sm'
                                                    }`}
                                                title="Update prompt and images in editor without running"
                                            >
                                                <Square size={10} className="mr-1" />
                                                <span>Fill Only</span>
                                            </button>
                                            <button
                                                onClick={() => queue.runSingle(task.id)}
                                                disabled={isDisabled}
                                                className={`flex-[2] text-white text-xs px-3 py-1.5 rounded flex items-center justify-center space-x-1 transition-colors shadow-sm ${isDisabled
                                                    ? 'bg-blue-400 cursor-not-allowed'
                                                    : 'bg-blue-600 hover:bg-blue-700'
                                                    }`}
                                            >
                                                <Play size={12} />
                                                <span>{results.length > 0 ? 'Run Again' : 'Send & Capture'}</span>
                                            </button>
                                        </div>
                                    )}
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
                                                const cachedIds = latestResult.cachedMediaIds || [];

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
                                                                        {/* Use FetchImage only for Gemini images (googleusercontent.com) which need
                                                                            privileged sidepanel fetch. All other images use standard <img> */}
                                                                        {src.includes('googleusercontent.com') ? (
                                                                            <FetchImage
                                                                                src={src}
                                                                                alt={`Result ${i + 1}`}
                                                                                className="w-full h-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer bg-slate-100 dark:bg-slate-900"
                                                                                cachedMediaId={cachedIds[i]}
                                                                            />
                                                                        ) : (
                                                                            <MediaThumbnail
                                                                                src={src}
                                                                                alt={`Result ${i + 1}`}
                                                                                className="w-full h-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 hover:opacity-90 transition-opacity cursor-pointer bg-slate-100 dark:bg-slate-900"
                                                                                cachedMediaId={cachedIds[i]}
                                                                            />
                                                                        )}
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
                                                        <MediaThumbnail
                                                            src={parsed.videoUrl}
                                                            type="video"
                                                            className="w-full max-h-[200px] object-contain rounded border border-slate-200 dark:border-slate-700 cursor-pointer hover:opacity-90 transition-opacity bg-slate-100 dark:bg-slate-900"
                                                            cachedMediaId={latestResult.cachedMediaIds?.[0]}
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
                                            ) : parsed?.htmlContent ? (
                                                <div
                                                    className="genmix-prose text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/30 p-2 rounded max-h-32 overflow-y-auto"
                                                    dangerouslySetInnerHTML={{ __html: parsed.htmlContent }}
                                                />
                                            ) : (
                                                <div className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/30 p-2 rounded max-h-32 overflow-y-auto whitespace-pre-wrap">
                                                    {parsed?.rawText || parsed?.content || latestResult.content}
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


                {/* Add Task Placeholder Card */}
                <div
                    onClick={openDashboard}
                    className="m-3 p-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 hover:text-blue-600 hover:border-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-all group"
                >
                    <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 flex items-center justify-center mb-2 transition-colors">
                        <Plus size={16} />
                    </div>
                    <span className="text-sm font-medium">Add New Task</span>
                    <span className="text-[10px] mt-1 opacity-70">Go to Dashboard to manage tasks</span>
                </div>
            </div >

            {/* Result Capture Panel Overlay */}
            {isCaptureOpen && (
                <ResultCapturePanel
                    items={capturedItems}
                    tasks={toolTasks}
                    isLoading={isScanning}
                    onImport={handleCaptureImport}
                    onClose={() => setIsCaptureOpen(false)}
                    onRescan={handleScanPage}
                />
            )}
        </div >
    );
}
