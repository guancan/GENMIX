import { useState } from 'react';
import { Layout } from '@/components/Layout';
import { useTasks } from '@/hooks/useTasks';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { EditTaskModal } from '@/components/EditTaskModal';
import { Plus, MoreHorizontal, MessageSquare } from 'lucide-react';
import type { Task } from '@/types/task';

const TOOL_ICONS: Record<string, string> = {
    chatgpt: 'https://upload.wikimedia.org/wikipedia/commons/0/04/ChatGPT_logo.svg',
    gemini: 'https://upload.wikimedia.org/wikipedia/commons/8/8a/Google_Gemini_logo.svg',
    jimeng: 'https://jimeng.jianying.com/favicon.ico',
};

export default function App() {
    const { tasks, loading, addTask, updateTask, deleteTask } = useTasks();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);

    return (
        <Layout>
            <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Active Tasks</h2>
                <button
                    onClick={() => setIsCreateOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md font-medium flex items-center space-x-2 shadow-sm transition-all"
                >
                    <Plus size={18} />
                    <span>New Task</span>
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center h-64 text-slate-400">Loading tasks...</div>
            ) : tasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-3xl">📝</div>
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">No tasks yet</h3>
                        <p className="text-slate-500 max-w-sm mx-auto mt-1">Create a task to start automating your AIGC workflows.</p>
                    </div>
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="text-blue-600 font-medium hover:underline"
                    >
                        Create your first task
                    </button>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-800 rounded-lg shadow ring-1 ring-slate-900/5 overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                        <thead className="bg-slate-50 dark:bg-slate-900/50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Title</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Tool</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Created</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Result</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
                            {tasks.map(task => (
                                <tr
                                    key={task.id}
                                    className="hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer"
                                    onClick={() => setEditingTask(task)}
                                >
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize
                       ${task.status === 'completed' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                                task.status === 'in_progress' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                                    'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'}`}>
                                            {task.status.replace('_', ' ')}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            <MessageSquare size={16} className="text-slate-400 mr-2" />
                                            <span className="text-sm font-medium text-slate-900 dark:text-white">{task.title}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center">
                                            {TOOL_ICONS[task.tool] && (
                                                <img
                                                    src={TOOL_ICONS[task.tool]}
                                                    className="w-5 h-5 mr-2 opacity-80"
                                                    alt=""
                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                />
                                            )}
                                            <span className="text-sm text-slate-500 dark:text-slate-400 capitalize">{task.tool}</span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                                        {new Date(task.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                                        {(() => {
                                            const t = task as any;
                                            const results = Array.isArray(t.results) ? t.results : (t.result ? [{ content: t.result }] : []);
                                            const latest = results.length > 0 ? results[results.length - 1] : null;

                                            if (!latest) return <span className="text-slate-300">-</span>;

                                            let displayContent = latest.content;
                                            try {
                                                const parsed = JSON.parse(latest.content);
                                                if (parsed.type === 'image') displayContent = '[Image Result]';
                                                else if (parsed.type === 'video') displayContent = '[Video Result]';
                                            } catch (e) {
                                                // Not JSON, use as is
                                            }

                                            return (
                                                <span title={latest.content}>
                                                    {results.length > 1 && <span className="mr-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800">{results.length} Execs</span>}
                                                    {displayContent.length > 50 ? displayContent.substring(0, 50) + '...' : displayContent}
                                                </span>
                                            );
                                        })()}
                                    </td>
                                    <td
                                        className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium"
                                        onClick={(e) => e.stopPropagation()} // Prevent row click when using the button
                                    >
                                        <button
                                            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                                            onClick={() => setEditingTask(task)}
                                            title="Edit task"
                                        >
                                            <MoreHorizontal size={20} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <CreateTaskModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSubmit={(data) => addTask({ ...data, results: [], referenceImageIds: data.referenceImageIds || [] })}
            />

            <EditTaskModal
                task={editingTask}
                isOpen={editingTask !== null}
                onClose={() => setEditingTask(null)}
                onSave={updateTask}
                onDelete={deleteTask}
            />
        </Layout>
    );
}
