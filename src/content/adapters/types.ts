export interface ToolAdapter {
    name: string;
    detect: () => boolean;
    clearEditor?: () => Promise<void>;
    fillImages?: (images: Blob[]) => Promise<void>;
    fillPrompt: (text: string) => Promise<void>;
    clickSend: () => Promise<void>;
    waitForCompletion: () => Promise<void>;
    getLatestResult: () => Promise<string | null>;
}
