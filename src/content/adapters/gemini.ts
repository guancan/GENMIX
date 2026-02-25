import type { ToolAdapter } from './types';

export const GeminiAdapter: ToolAdapter = {
    name: 'gemini',
    detect: () => window.location.hostname.includes('gemini.google.com'),

    async fillPrompt(text: string) {
        // Gemini often uses a rich text div or specific textarea
        // Try standard selectors. This is brittle.
        const richTextEditor = document.querySelector('.ql-editor') || document.querySelector('div[contenteditable="true"]');

        if (richTextEditor) {
            (richTextEditor as HTMLElement).innerText = text; // simplistic
            richTextEditor.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            console.warn('Gemini editor not found');
        }
    },

    async clickSend() {
        const sendButton = document.querySelector('button[aria-label="Send message"]'); // Example selector
        if (sendButton instanceof HTMLElement) {
            sendButton.click();
        }
    },

    async waitForCompletion() {
        // TODO: Implement for Gemini
        return new Promise(resolve => setTimeout(resolve, 3000));
    },

    async getLatestResult() {
        return null; // Implement later
    }
};
