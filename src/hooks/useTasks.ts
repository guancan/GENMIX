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
        // Optimistic removal
        setTasks(prev => prev.filter(t => t.id !== id));
        await TaskStore.delete(id);
        // Storage listener will confirm
    };

    const refresh = loadTasks;

    return { tasks, loading, addTask, updateTask, deleteTask, refresh };
}

