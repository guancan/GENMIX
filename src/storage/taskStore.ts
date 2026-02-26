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
    },

    /** Replace the entire task array (used for drag-and-drop reordering) */
    async setAll(tasks: Task[]): Promise<void> {
        await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
    },

    /** Delete multiple tasks at once (used for batch deletion) */
    async deleteMany(ids: string[]): Promise<void> {
        const idSet = new Set(ids);
        const tasks = await this.getAll();
        const filtered = tasks.filter(t => !idSet.has(t.id));
        await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
    },

    /** Import tasks with a merge strategy */
    async importTasks(
        newTasks: Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'status'>[],
        strategy: 'replace' | 'prepend' | 'append'
    ): Promise<void> {
        const now = Date.now();
        const created: Task[] = newTasks.map(t => ({
            ...t,
            id: crypto.randomUUID(),
            status: 'pending' as const,
            createdAt: now,
            updatedAt: now,
            results: [],
            referenceImageIds: [],
        }));

        if (strategy === 'replace') {
            await chrome.storage.local.set({ [STORAGE_KEY]: created });
        } else {
            const existing = await this.getAll();
            const merged = strategy === 'prepend' ? [...created, ...existing] : [...existing, ...created];
            await chrome.storage.local.set({ [STORAGE_KEY]: merged });
        }
    },

    /** Duplicate a task: copy everything except id/status/results, insert after original */
    async duplicateTask(id: string): Promise<Task> {
        const tasks = await this.getAll();
        const source = tasks.find(t => t.id === id);
        if (!source) throw new Error('Task not found');

        const now = Date.now();
        const copy: Task = {
            ...source,
            id: crypto.randomUUID(),
            title: `${source.title} (Copy)`,
            status: 'pending',
            results: [],
            createdAt: now,
            updatedAt: now,
        };

        // Insert right after the original
        const idx = tasks.findIndex(t => t.id === id);
        tasks.splice(idx + 1, 0, copy);
        await chrome.storage.local.set({ [STORAGE_KEY]: tasks });
        return copy;
    }
};
