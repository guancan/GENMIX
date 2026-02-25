import type { ToolAdapter } from './types';

export const ChatGPTAdapter: ToolAdapter = {
    name: 'chatgpt',
    detect: () => window.location.hostname.includes('chatgpt.com'),

    async fillPrompt(text: string) {
        console.log('[Genmix] Attempting to fill prompt using updated selectors...');

        // Target the ProseMirror contenteditable div specifically
        const editor = document.querySelector('#prompt-textarea.ProseMirror') ||
            document.querySelector('div[contenteditable="true"][id="prompt-textarea"]');

        if (!editor) {
            console.error('[Genmix] ProseMirror editor not found. Searched for #prompt-textarea.ProseMirror');
            throw new Error('ChatGPT input element not found');
        }

        console.log('[Genmix] Found editor:', editor);

        // ProseMirror/ContentEditable handling
        // We need to clear it and insert a P tag to match ChatGPT's format
        (editor as HTMLElement).innerHTML = `<p>${text}</p>`;

        // Dispatch input event to notify React/ProseMirror of changes
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        // Focus might be needed for the send button to become active
        (editor as HTMLElement).focus();

        console.log('[Genmix] Prompt filled successfully');
    },

    async clickSend() {
        // Wait a brief moment for the UI to update state (enable button)
        await new Promise(resolve => setTimeout(resolve, 500));

        const sendButton = document.querySelector('[data-testid="send-button"]') ||
            document.querySelector('#composer-submit-button');

        if (sendButton instanceof HTMLElement) {
            if ((sendButton as HTMLButtonElement).disabled) {
                console.warn('[Genmix] Send button is disabled. Input might not have triggered validation.');
            }
            sendButton.click();
            console.log('[Genmix] Clicked send button');
        } else {
            console.error('[Genmix] Send button not found');
            throw new Error('Send button not found');
        }
    },

    async waitForCompletion() {
        console.log('[Genmix] Waiting for completion...');

        // Polling loop
        return new Promise<void>((resolve) => {
            const checkSync = setInterval(() => {
                // Check 1: Stop button (text streaming in progress)
                const stopButton = document.querySelector('[data-testid="stop-button"]');

                // Check 2: Image generation loading indicators
                const loadingShimmer = document.querySelector('.loading-shimmer');
                const creatingImage = document.body.innerText.includes('Creating image');
                const imageContainerLoading = document.querySelector('[class*="imagegen-image"] .pointer-events-none');

                const isLoading = stopButton || loadingShimmer || creatingImage || imageContainerLoading;

                if (!isLoading) {
                    // Additional buffer for render stability
                    setTimeout(() => {
                        clearInterval(checkSync);
                        console.log('[Genmix] Generation appears complete.');
                        resolve();
                    }, 500);
                }
            }, 1000);

            // Safety timeout 2 minutes
            setTimeout(() => {
                clearInterval(checkSync);
                console.warn('[Genmix] Timed out waiting for completion.');
                resolve();
            }, 120000);
        });
    },

    async getLatestResult(): Promise<string | null> {
        // Find the last assistant message
        const turns = document.querySelectorAll('article[data-turn="assistant"]');
        if (turns.length === 0) return null;

        const lastTurn = turns[turns.length - 1];

        // Check if this is an image generation result
        // Look for the imagegen container
        const imageContainer = lastTurn.querySelector('[class*="imagegen-image"]') ||
            lastTurn.querySelector('[id^="image-"]');

        if (imageContainer) {
            console.log('[Genmix] Detected image result');

            // Find the actual image element
            const imgElement = imageContainer.querySelector('img[src*="backend-api/estuary"]') ||
                imageContainer.querySelector('img[alt="Generated image"]');

            if (imgElement) {
                const imageUrl = (imgElement as HTMLImageElement).src;
                console.log('[Genmix] Found image URL:', imageUrl);

                // Get image description if available
                const descElement = lastTurn.querySelector('.text-token-text-tertiary');
                const description = descElement ? (descElement as HTMLElement).innerText : '';

                // Request background worker to fetch and convert to base64
                try {
                    const response = await chrome.runtime.sendMessage({
                        type: 'FETCH_IMAGE',
                        url: imageUrl
                    });

                    if (response && response.success) {
                        console.log('[Genmix] Image fetched successfully, base64 length:', response.base64?.length);

                        // Return structured result as JSON string
                        return JSON.stringify({
                            type: 'image',
                            imageUrl: imageUrl,
                            imageBase64: response.base64,
                            imageDescription: description
                        });
                    } else {
                        console.warn('[Genmix] Failed to fetch image:', response?.error);
                        // Fall back to URL only
                        return JSON.stringify({
                            type: 'image',
                            imageUrl: imageUrl,
                            imageDescription: description,
                            error: response?.error
                        });
                    }
                } catch (err) {
                    console.error('[Genmix] Error fetching image:', err);
                    return JSON.stringify({
                        type: 'image',
                        imageUrl: imageUrl,
                        imageDescription: description,
                        error: String(err)
                    });
                }
            }
        }

        // Default: text result
        const markdown = lastTurn.querySelector('.markdown');
        if (markdown) {
            return JSON.stringify({
                type: 'text',
                content: (markdown as HTMLElement).innerText
            });
        }

        return JSON.stringify({
            type: 'text',
            content: (lastTurn as HTMLElement).innerText
        });
    }
};
