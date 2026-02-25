export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'failed';

export type ToolType = 'chatgpt' | 'gemini' | 'sora' | 'jimeng' | 'other';

export interface TaskResult {
    id: string;
    content: string;
    createdAt: number;
}

export type TaskResultType = 'text' | 'image' | 'video' | 'mixed';

export interface Task {
    id: string;
    title: string;
    prompt: string;
    tool: ToolType;
    resultType: TaskResultType;
    status: TaskStatus;
    results: TaskResult[];
    referenceImageIds: string[];  // IndexedDB image IDs, 0-12
    lastExecutedAt?: number;
    createdAt: number;
    updatedAt: number;
}
