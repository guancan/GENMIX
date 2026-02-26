import type { Task, TaskResultType } from '@/types/task';

/** A single scannable result detected on the current page */
export interface CapturedItem {
    id: string;              // unique key for dedup & selection
    type: 'image' | 'video' | 'text';
    url?: string;            // primary URL (image or video)
    urls?: string[];         // all URLs (multi-image)
    rawText?: string;        // plain text content
    htmlContent?: string;    // HTML rich text content
    thumbnail?: string;      // thumbnail URL for list preview
    sourceIndex?: number;    // position on the page (for ordering)
}

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
    /** Scan the entire page for all AI-generated results */
    scanAllResults?: () => Promise<CapturedItem[]>;
}
