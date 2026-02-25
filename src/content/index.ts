import { ChatGPTAdapter } from './adapters/chatgpt';
import { GeminiAdapter } from './adapters/gemini';
import { JimengAdapter } from './adapters/jimeng';
import type { ToolAdapter } from './adapters/types';

const adapters: ToolAdapter[] = [ChatGPTAdapter, GeminiAdapter, JimengAdapter];

function getAdapter(): ToolAdapter | undefined {
    return adapters.find(a => a.detect());
}

const adapter = getAdapter();

if (adapter) {
    console.log(`[Genmix] Connected to ${adapter.name}`);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        console.log('[Genmix] Received message:', message);

        if (message.type === 'EXECUTE_PROMPT' && message.payload) {
            console.log('[Genmix] Executing prompt (Fill + Send)...');
            (async () => {
                try {
                    await adapter.fillPrompt(message.payload);
                    await adapter.clickSend();
                    console.log('[Genmix] Sent. Waiting for response...');

                    // Helper: Wait for AI to Start generating (optional, but good if there's lag before stop button appears)
                    await new Promise(r => setTimeout(r, 2000));

                    await adapter.waitForCompletion();
                    console.log('[Genmix] Completed. Capturing result...');

                    const result = await adapter.getLatestResult();
                    console.log('[Genmix] Execution success. Result length:', result?.length);

                    sendResponse({ success: true, result: result });
                } catch (err: any) {
                    console.error('[Genmix] Execution failed:', err);
                    sendResponse({ success: false, error: err.message });
                }
            })();
            return true; // Keep channel open
        }

        if (message.type === 'FILL_PROMPT' && message.payload) {
            // ... (keep existing logic if we want to fallback, but for now mostly focusing on execute)
            console.log('[Genmix] Invoking adapter.fillPrompt...');
            adapter.fillPrompt(message.payload)
                .then(() => {
                    console.log('[Genmix] Prompt fill success, sending response.');
                    sendResponse({ success: true });
                })
                .catch(err => {
                    console.error('[Genmix] Prompt fill failed:', err);
                    sendResponse({ success: false, error: err.message });
                });
            return true; // Keep channel open
        }
    });
} else {
    console.log('[Genmix] No adapter found for this site.');
}
