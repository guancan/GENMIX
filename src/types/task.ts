export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ToolType = 'chatgpt' | 'gemini' | 'sora' | 'jimeng' | 'other';

export interface TaskResult {
    id: string;
    content: string;
    createdAt: number;
}

export interface Task {
    id: string;
    title: string;
    prompt: string;
    tool: ToolType;
    status: TaskStatus;
    results: TaskResult[];
    lastExecutedAt?: number;
    createdAt: number;
    updatedAt: number;
}
