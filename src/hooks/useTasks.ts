import { useState, useEffect } from 'react';
import type { Task } from '@/types/task';
import { TaskStore } from '@/storage/taskStore';

export function useTasks() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    const loadTasks = async () => {
        setLoading(true);
        const data = await TaskStore.getAll();
        setTasks(data);
        setLoading(false);
    };

    useEffect(() => {
        loadTasks();

        const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
            if (areaName === 'local' && changes['genmix_tasks']) {
                loadTasks();
            }
        };

        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
    }, []);

    const addTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => {
        await TaskStore.add(task);
        // Load tasks handled by storage listener
    };

    const updateTask = async (id: string, updates: Partial<Task>) => {
        // Optimistic local state update — instant UI feedback
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates, updatedAt: Date.now() } : t));
        // Persist to storage (triggers storage listener in other pages too)
        await TaskStore.update(id, updates);
    };

    const deleteTask = async (id: string) => {
        setTasks(prev => prev.filter(t => t.id !== id));
        await TaskStore.delete(id);
    };

    /** Reorder tasks by providing the new ordered ID list */
    const reorderTasks = async (orderedIds: string[]) => {
        const taskMap = new Map(tasks.map(t => [t.id, t]));
        const reordered = orderedIds.map(id => taskMap.get(id)!).filter(Boolean);
        setTasks(reordered);
        await TaskStore.setAll(reordered);
    };

    /** Delete multiple tasks at once */
    const deleteTasks = async (ids: string[]) => {
        const idSet = new Set(ids);
        setTasks(prev => prev.filter(t => !idSet.has(t.id)));
        await TaskStore.deleteMany(ids);
    };

    /** Import tasks with a merge strategy */
    const importTasks = async (
        newTasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>[],
        strategy: 'replace' | 'prepend' | 'append'
    ) => {
        await TaskStore.importTasks(newTasks, strategy);
        // Storage listener will reload
    };

    /** Duplicate a task (copy with new ID, cleared results) */
    const duplicateTask = async (id: string): Promise<Task> => {
        const copy = await TaskStore.duplicateTask(id);
        // Storage listener will reload
        return copy;
    };

    const refresh = loadTasks;

    return { tasks, loading, addTask, updateTask, deleteTask, reorderTasks, deleteTasks, importTasks, duplicateTask, refresh };
}

