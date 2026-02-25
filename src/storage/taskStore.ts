import type { Task } from '@/types/task';

const STORAGE_KEY = 'genmix_tasks';

export const TaskStore = {
    async getAll(): Promise<Task[]> {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        return (result[STORAGE_KEY] as Task[]) || [];
    },

    async get(id: string): Promise<Task | undefined> {
        const tasks = await this.getAll();
        return tasks.find(t => t.id === id);
    },

    async add(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<Task> {
        const tasks = await this.getAll();
        const newTask: Task = {
            ...task,
            id: crypto.randomUUID(),
            status: 'pending',
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        tasks.unshift(newTask);
        await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
        return newTask;
    },

    async update(id: string, updates: Partial<Task>): Promise<Task> {
        const tasks = await this.getAll();
        const index = tasks.findIndex(t => t.id === id);
        if (index === -1) throw new Error('Task not found');

        const updatedTask = { ...tasks[index], ...updates, updatedAt: Date.now() };
        tasks[index] = updatedTask;
        await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
        return updatedTask;
    },

    async delete(id: string): Promise<void> {
        const tasks = await this.getAll();
        const filtered = tasks.filter(t => t.id !== id);
        await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    }
};
