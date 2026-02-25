import type { Task, TaskResultType } from '@/types/task';

export interface ToolAdapter {
    name: string;
    detect: () => boolean;
    validateState?: (task: Task) => Promise<{ valid: boolean; redirectUrl?: string; error?: string }>;
    clearEditor?: () => Promise<void>;
    fillImages?: (images: Blob[]) => Promise<void>;
    fillPrompt: (text: string) => Promise<void>;
    clickSend: () => Promise<void>;
    waitForCompletion: (signal?: AbortSignal) => Promise<void>;
    getLatestResult: (expectedType?: TaskResultType) => Promise<string | null>;
}
