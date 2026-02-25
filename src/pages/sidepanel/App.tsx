import { useState, useEffect } from 'react';
import { useTasks } from '@/hooks/useTasks';
import { useActiveTab } from '@/hooks/useActiveTab';
import { Play, Copy } from 'lucide-react';

export default function App() {
    const { tasks, loading, updateTask } = useTasks();
    const { currentTool, tabId } = useActiveTab();

    // Show all tasks for the current tool, regardless of status
    const visibleTasks = tasks.filter(t => t.tool === currentTool);

    const [error, setError] = useState<string | null>(null);
    const [executingId, setExecutingId] = useState<string | null>(null);

    // Auto-clear error after 5 seconds
    useEffect(() => {
        if (error) {
            const timer = setTimeout(() => setError(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [error]);

    const handleFill = async (task: any) => {
        if (!tabId) return;

        setError(null);
        setExecutingId(task.id);

        // Persist in_progress status immediately — visible in Dashboard and any other views
        await updateTask(task.id, { status: 'in_progress' });

        try {
            const response = await chrome.tabs.sendMessage(tabId, { type: 'EXECUTE_PROMPT', payload: task.prompt });

            if (response && response.success) {
                const newResult = {
                    id: Date.now().toString(),
                    content: response.result || '',
                    createdAt: Date.now()
                };

                const currentResults = Array.isArray(task.results) ? task.results : [];

                await updateTask(task.id, {
                    results: [...currentResults, newResult],
                    status: 'completed',
                    lastExecutedAt: Date.now()
                });
            } else {
                throw new Error(response?.error || 'Unknown error');
            }

        } catch (e: any) {
            console.error('Failed to send message:', e);

            // Persist failed status so Dashboard also reflects the error
            await updateTask(task.id, { status: 'failed' });

            if (e.message && e.message.includes('Could not establish connection')) {
                setError('Please refresh the page to enable Genmix.');
            } else {
                setError('Failed to inject prompt. ' + (e.message || ''));
            }
        } finally {
            setExecutingId(null);
        }
    };

    const openDashboard = () => {
        chrome.tabs.create({ url: 'dashboard.html' });
    };

    return (
        <div className="h-screen bg-slate-50 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col">
            <header className="p-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm relative">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-sm font-semibold text-slate-900 dark:text-white">Genmix Assistant</h1>
                    <button onClick={openDashboard} className="text-xs text-blue-600 hover:underline">Open Dashboard</button>
                </div>
                <div className="flex items-center space-x-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${currentTool !== 'unknown' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                        {currentTool === 'unknown' ? 'No Tool Detected' : currentTool}
                    </span>
                </div>
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
                        // Ensure results is an array (backwards compatibility)
                        const t = task as any;
                        const results = Array.isArray(t.results) ? t.results : (t.result ? [{ id: 'legacy', content: t.result, createdAt: t.updatedAt }] : []);
                        const latestResult = results.length > 0 ? results[results.length - 1] : null;

                        return (
                            <div key={task.id} className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow-md transition-shadow">
                                <h3 className="text-sm font-medium text-slate-900 dark:text-white mb-1">{task.title}</h3>
                                <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mb-3 bg-slate-50 dark:bg-slate-900/50 p-2 rounded">
                                    "{task.prompt}"
                                </p>

                                <div className="flex items-center space-x-2 mb-3">
                                    <button
                                        onClick={() => handleFill(task)}
                                        disabled={executingId === task.id}
                                        className={`flex-1 text-white text-xs px-3 py-1.5 rounded flex items-center justify-center space-x-1 transition-colors ${executingId === task.id ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
                                    >
                                        {executingId === task.id ? (
                                            <span>Generating...</span>
                                        ) : (
                                            <>
                                                <Play size={12} />
                                                <span>{results.length > 0 ? 'Run Again' : 'Send & Capture'}</span>
                                            </>
                                        )}
                                    </button>
                                    <button
                                        onClick={() => navigator.clipboard.writeText(task.prompt)}
                                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
                                        title="Copy prompt"
                                    >
                                        <Copy size={12} />
                                    </button>
                                </div>

                                {/* Results Display */}
                                {latestResult && (() => {
                                    // Try to parse as structured result
                                    let parsed: any = null;
                                    try {
                                        parsed = JSON.parse(latestResult.content);
                                    } catch {
                                        // Not JSON, treat as plain text
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
                                                // Prefer allImageUrls for multi-result grid (Jimeng returns 4 images)
                                                const allUrls: string[] = parsed.allImageUrls?.length
                                                    ? parsed.allImageUrls
                                                    : [parsed.imageBase64 || parsed.imageUrl].filter(Boolean);
                                                const primarySrc = parsed.imageBase64 || parsed.imageUrl || allUrls[0];

                                                return (
                                                    <div className="space-y-2">
                                                        {parsed.imageDescription && (
                                                            <p className="text-[10px] text-slate-500 italic">"{parsed.imageDescription}"</p>
                                                        )}

                                                        {/* Multi-image grid: 2 columns when >1, single when =1 */}
                                                        <div className={`grid gap-1 ${allUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                            {allUrls.map((url, i) => (
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
                                                                    allUrls.length > 1
                                                                        ? allUrls.join('\n')
                                                                        : (parsed.imageUrl || '')
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
