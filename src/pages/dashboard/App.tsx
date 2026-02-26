import { useState, useMemo, useRef, useCallback } from 'react';
import { Layout } from '@/components/Layout';
import { useTasks } from '@/hooks/useTasks';
import { CreateTaskModal } from '@/components/CreateTaskModal';
import { EditTaskModal } from '@/components/EditTaskModal';
import { ImportModal } from '@/components/ImportModal';
import { ExportModal } from '@/components/ExportModal';
import { Plus, MoreHorizontal, Filter, Trash2, GripVertical, Upload, Download, Copy } from 'lucide-react';
import type { Task } from '@/types/task';
import ReferenceImageThumbnail from '@/pages/sidepanel/ReferenceImageThumbnail';
import { MediaThumbnail } from '@/components/MediaThumbnail';

import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const TOOL_DISPLAY: Record<string, string> = {
    chatgpt: 'ChatGPT',
    gemini: 'Gemini',
    jimeng: '即梦',
    sora: 'Sora',
    other: 'Other',
};

const RESULT_TYPE_BADGE: Record<string, { emoji: string; label: string; cls: string }> = {
    image: { emoji: '🖼️', label: '图片', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300' },
    video: { emoji: '🎬', label: '视频', cls: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300' },
    text: { emoji: '📝', label: '文本', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
    mixed: { emoji: '🔀', label: '混合', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

const STATUS_OPTIONS: { key: string; label: string }[] = [
    { key: 'all', label: '全部状态' },
    { key: 'pending', label: 'Pending' },
    { key: 'completed', label: 'Completed' },
    { key: 'failed', label: 'Failed' },
    { key: 'in_progress', label: 'In Progress' },
];

/* ─── Sortable Row Component ─── */
function SortableRow({
    task,
    activeTab,
    isSelected,
    onToggleSelect,
    onEdit,
    onDuplicate,
    renderResultPreview,
}: {
    task: Task;
    activeTab: string;
    isSelected: boolean;
    onToggleSelect: (id: string) => void;
    onEdit: (task: Task) => void;
    onDuplicate: (taskId: string) => void;
    renderResultPreview: (task: Task) => React.ReactNode;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    const statusCls =
        task.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
            task.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                task.status === 'failed' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';

    const rtBadge = RESULT_TYPE_BADGE[task.resultType] || RESULT_TYPE_BADGE.mixed;

    return (
        <tr
            ref={setNodeRef}
            style={style}
            className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors cursor-pointer group ${isSelected ? 'bg-blue-50/60 dark:bg-blue-900/10' : ''}`}
            onClick={() => onEdit(task)}
        >
            {/* Drag handle + Checkbox */}
            <td className="px-2 py-3 whitespace-nowrap w-16" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center gap-1">
                    <button
                        {...attributes}
                        {...listeners}
                        className="text-slate-300 hover:text-slate-500 dark:text-slate-600 dark:hover:text-slate-400 cursor-grab active:cursor-grabbing touch-none p-0.5"
                        title="Drag to reorder"
                    >
                        <GripVertical size={14} />
                    </button>
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onToggleSelect(task.id)}
                        className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                </div>
            </td>

            {/* Status */}
            <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${statusCls}`}>
                    {task.status.replace('_', ' ')}
                </span>
            </td>

            {/* Result Type badge */}
            <td className="px-4 py-3 whitespace-nowrap">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${rtBadge.cls}`}>
                    {rtBadge.emoji} {rtBadge.label}
                </span>
            </td>

            {/* Title + Prompt preview */}
            <td className="px-4 py-3 max-w-xs">
                <div className="text-sm font-medium text-slate-900 dark:text-white truncate">{task.title}</div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 line-clamp-1 mt-0.5">
                    {task.prompt}
                </p>
            </td>

            {/* Tool (only in All tab) */}
            {activeTab === 'all' && (
                <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {TOOL_DISPLAY[task.tool] || task.tool}
                    </span>
                </td>
            )}

            {/* Reference images */}
            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                {task.referenceImageIds && task.referenceImageIds.length > 0 ? (
                    <div className="flex items-center gap-0.5">
                        {task.referenceImageIds.slice(0, 3).map(id => (
                            <ReferenceImageThumbnail key={id} imageId={id} />
                        ))}
                        {task.referenceImageIds.length > 3 && (
                            <span className="text-[10px] text-slate-400 ml-1">+{task.referenceImageIds.length - 3}</span>
                        )}
                    </div>
                ) : (
                    <span className="text-slate-300 dark:text-slate-600">—</span>
                )}
            </td>

            {/* Result preview */}
            <td className="px-4 py-3">
                {renderResultPreview(task)}
            </td>

            {/* Actions */}
            <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                        className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => onDuplicate(task.id)}
                        title="Duplicate task"
                    >
                        <Copy size={15} />
                    </button>
                    <button
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                        onClick={() => onEdit(task)}
                        title="Edit task"
                    >
                        <MoreHorizontal size={18} />
                    </button>
                </div>
            </td>
        </tr>
    );
}

/* ─── Main Dashboard ─── */
export default function App() {
    const { tasks, loading, addTask, updateTask, deleteTask, reorderTasks, deleteTasks, importTasks, duplicateTask } = useTasks();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [isExportOpen, setIsExportOpen] = useState(false);
    const [editingTask, setEditingTask] = useState<Task | null>(null);
    const [activeTab, setActiveTab] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [jumpToast, setJumpToast] = useState<{ tool: string; visible: boolean } | null>(null);
    const jumpToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Multi-select
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [confirmBatchDelete, setConfirmBatchDelete] = useState(false);

    const toggleSelect = useCallback((id: string) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        setConfirmBatchDelete(false);
    }, []);

    const toggleSelectAll = useCallback(() => {
        setSelectedIds(prev => {
            if (prev.size === filteredTasks.length && filteredTasks.length > 0) {
                return new Set();
            }
            return new Set(filteredTasks.map(t => t.id));
        });
        setConfirmBatchDelete(false);
    }, []);

    const handleBatchDelete = async () => {
        if (!confirmBatchDelete) {
            setConfirmBatchDelete(true);
            return;
        }
        await deleteTasks(Array.from(selectedIds));
        setSelectedIds(new Set());
        setConfirmBatchDelete(false);
    };

    // Drag-and-drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Compute task counts per tool for sidebar badges
    const taskCounts = useMemo(() => {
        const counts: Record<string, number> = { all: tasks.length };
        for (const t of tasks) {
            counts[t.tool] = (counts[t.tool] || 0) + 1;
        }
        return counts;
    }, [tasks]);

    // Filter tasks by active tab + status filter
    const filteredTasks = useMemo(() => {
        let result = tasks;
        if (activeTab !== 'all') {
            result = result.filter(t => t.tool === activeTab);
        }
        if (statusFilter !== 'all') {
            result = result.filter(t => t.status === statusFilter);
        }
        return result;
    }, [tasks, activeTab, statusFilter]);

    // Handle drag end: reorder
    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = tasks.findIndex(t => t.id === active.id);
        const newIndex = tasks.findIndex(t => t.id === over.id);
        if (oldIndex === -1 || newIndex === -1) return;

        const reordered = [...tasks];
        const [moved] = reordered.splice(oldIndex, 1);
        reordered.splice(newIndex, 0, moved);

        await reorderTasks(reordered.map(t => t.id));
    };

    // Render a compact result preview
    const renderResultPreview = (task: Task) => {
        const results = Array.isArray(task.results) ? task.results : [];
        const latest = results.length > 0 ? results[results.length - 1] : null;

        if (!latest) return <span className="text-slate-300 dark:text-slate-600">—</span>;

        let parsed: any = null;
        try { parsed = JSON.parse(latest.content); } catch { /* not JSON */ }

        return (
            <div className="flex items-center gap-2">
                {results.length > 1 && (
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 border border-blue-200 dark:border-blue-800 flex-shrink-0">
                        {results.length}x
                    </span>
                )}
                {parsed?.type === 'image' && parsed.allImageUrls?.length > 0 ? (
                    <div className="flex items-center gap-1">
                        <MediaThumbnail
                            src={parsed.allImageUrls[0]}
                            alt="Result"
                            className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-600"
                            cachedMediaId={latest.cachedMediaIds?.[0]}
                        />
                        {parsed.allImageUrls.length > 1 && (
                            <span className="text-[10px] text-slate-400">+{parsed.allImageUrls.length - 1}</span>
                        )}
                    </div>
                ) : parsed?.type === 'image' && (parsed.imageBase64 || parsed.imageUrl) ? (
                    <MediaThumbnail
                        src={parsed.imageBase64 || parsed.imageUrl}
                        alt="Result"
                        className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-600"
                        cachedMediaId={latest.cachedMediaIds?.[0]}
                    />
                ) : parsed?.type === 'video' && parsed.videoUrl ? (
                    <div className="flex items-center gap-1">
                        <MediaThumbnail
                            src={parsed.videoUrl}
                            type="video"
                            className="w-8 h-8 rounded object-cover border border-slate-200 dark:border-slate-600 bg-black"
                            cachedMediaId={latest.cachedMediaIds?.[0]}
                        />
                        <span className="text-xs text-slate-500">Video</span>
                    </div>
                ) : (
                    <span className="text-xs text-slate-500 truncate max-w-[180px]">
                        {(parsed?.rawText || parsed?.content || latest.content || '').substring(0, 60)}
                    </span>
                )}
            </div>
        );
    };

    const headerActions = (
        <div className="flex items-center gap-2">
            <button
                onClick={() => setIsImportOpen(true)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="导入任务"
            >
                <Upload size={15} />
                <span>导入</span>
            </button>
            <button
                onClick={() => setIsExportOpen(true)}
                className="text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-2.5 py-1.5 rounded-md text-sm font-medium flex items-center space-x-1 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="导出任务"
            >
                <Download size={15} />
                <span>导出</span>
            </button>
            <button
                onClick={() => setIsCreateOpen(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-md text-sm font-medium flex items-center space-x-1.5 shadow-sm transition-colors"
            >
                <Plus size={16} />
                <span>New Task</span>
            </button>
        </div>
    );

    const allFilteredSelected = filteredTasks.length > 0 && selectedIds.size === filteredTasks.length;

    return (
        <Layout activeTab={activeTab} onTabChange={setActiveTab} taskCounts={taskCounts} headerActions={headerActions}>
            {/* Filter Bar */}
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                    <Filter size={14} className="text-slate-400" />
                    <div className="flex items-center space-x-1">
                        {STATUS_OPTIONS.map(opt => (
                            <button
                                key={opt.key}
                                onClick={() => setStatusFilter(opt.key)}
                                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${statusFilter === opt.key
                                    ? 'bg-blue-600 text-white font-semibold'
                                    : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-600'
                                    }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>
                <span className="text-xs text-slate-400">
                    {filteredTasks.length} task{filteredTasks.length !== 1 ? 's' : ''}
                </span>
            </div>

            {/* Batch Action Bar */}
            {selectedIds.size > 0 && (
                <div className="mb-3 flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-4 py-2.5">
                    <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        已选 {selectedIds.size} 项
                    </span>
                    <button
                        onClick={handleBatchDelete}
                        className={`flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-md transition-colors ${confirmBatchDelete
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'bg-red-50 text-red-600 border border-red-200 hover:bg-red-100'
                            }`}
                    >
                        <Trash2 size={12} />
                        <span>{confirmBatchDelete ? '确认删除' : '删除选中'}</span>
                    </button>
                    <button
                        onClick={() => { setSelectedIds(new Set()); setConfirmBatchDelete(false); }}
                        className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 ml-auto"
                    >
                        取消选择
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center justify-center h-64 text-slate-400">Loading tasks...</div>
            ) : filteredTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-80 text-center space-y-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-lg">
                    <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-3xl">📝</div>
                    <div>
                        <h3 className="text-lg font-medium text-slate-900 dark:text-white">
                            {tasks.length === 0 ? 'No tasks yet' : 'No matching tasks'}
                        </h3>
                        <p className="text-slate-500 max-w-sm mx-auto mt-1 text-sm">
                            {tasks.length === 0
                                ? 'Create a task to start automating your AIGC workflows.'
                                : 'Try adjusting your filters.'}
                        </p>
                    </div>
                    {tasks.length === 0 && (
                        <button onClick={() => setIsCreateOpen(true)} className="text-blue-600 font-medium hover:underline text-sm">
                            Create your first task
                        </button>
                    )}
                </div>
            ) : (
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="bg-white dark:bg-slate-800 rounded-lg shadow ring-1 ring-slate-900/5 overflow-hidden">
                        <table className="min-w-full divide-y divide-slate-200 dark:divide-slate-700">
                            <thead className="bg-slate-50 dark:bg-slate-900/50">
                                <tr>
                                    <th className="px-2 py-3 text-left w-16">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={toggleSelectAll}
                                            className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer ml-5"
                                        />
                                    </th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">Status</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Type</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Task</th>
                                    {activeTab === 'all' && (
                                        <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-24">Tool</th>
                                    )}
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Ref</th>
                                    <th className="px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Result</th>
                                    <th className="px-4 py-3 text-right text-[11px] font-semibold text-slate-500 uppercase tracking-wider w-16">Actions</th>
                                </tr>
                            </thead>
                            <SortableContext items={filteredTasks.map(t => t.id)} strategy={verticalListSortingStrategy}>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50 bg-white dark:bg-slate-800">
                                    {filteredTasks.map(task => (
                                        <SortableRow
                                            key={task.id}
                                            task={task}
                                            activeTab={activeTab}
                                            isSelected={selectedIds.has(task.id)}
                                            onToggleSelect={toggleSelect}
                                            onEdit={setEditingTask}
                                            onDuplicate={duplicateTask}
                                            renderResultPreview={renderResultPreview}
                                        />
                                    ))}
                                </tbody>
                            </SortableContext>
                        </table>
                    </div>
                </DndContext>
            )}

            <CreateTaskModal
                isOpen={isCreateOpen}
                onClose={() => setIsCreateOpen(false)}
                onSubmit={async (data) => {
                    await addTask({ ...data, results: [], referenceImageIds: data.referenceImageIds || [] });
                    if (activeTab !== 'all' && data.tool !== activeTab) {
                        if (jumpToastTimerRef.current) clearTimeout(jumpToastTimerRef.current);
                        setJumpToast({ tool: data.tool, visible: true });
                        jumpToastTimerRef.current = setTimeout(() => setJumpToast(null), 6000);
                    }
                }}
                taskCount={tasks.length}
            />

            <EditTaskModal
                task={editingTask}
                isOpen={editingTask !== null}
                onClose={() => setEditingTask(null)}
                onSave={updateTask}
                onDelete={deleteTask}
                onDuplicate={duplicateTask}
            />

            <ImportModal
                isOpen={isImportOpen}
                onClose={() => setIsImportOpen(false)}
                onImport={async (importedTasks, strategy) => {
                    const fullTasks = importedTasks.map(t => ({
                        ...t,
                        results: [],
                        referenceImageIds: t.referenceImageIds || [],
                    }));
                    await importTasks(fullTasks, strategy);
                }}
            />

            <ExportModal
                isOpen={isExportOpen}
                onClose={() => setIsExportOpen(false)}
                tasks={filteredTasks}
                tabLabel={activeTab === 'all' ? '全部' : (TOOL_DISPLAY[activeTab] || activeTab)}
            />

            {/* Tool Tab Jump Guidance Toast */}
            {jumpToast?.visible && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-slate-800 dark:bg-slate-700 text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 animate-[fadeInUp_0.3s_ease-out]">
                    <span className="text-sm">
                        任务已创建在 <strong>{TOOL_DISPLAY[jumpToast.tool] || jumpToast.tool}</strong> 下
                    </span>
                    <button
                        onClick={() => { setActiveTab(jumpToast.tool); setJumpToast(null); }}
                        className="px-3 py-1 text-xs font-semibold bg-blue-500 hover:bg-blue-600 rounded-md transition-colors"
                    >
                        跳转
                    </button>
                    <button
                        onClick={() => setJumpToast(null)}
                        className="text-slate-300 hover:text-white text-xs"
                    >
                        留在当前
                    </button>
                </div>
            )}
        </Layout>
    );
}
