export interface ToolAdapter {
    name: string;
    detect: () => boolean;
    fillPrompt: (text: string) => Promise<void>;
    clickSend: () => Promise<void>;
    waitForCompletion: () => Promise<void>;
    getLatestResult: () => Promise<string | null>;
}
