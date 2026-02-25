import { ChatGPTAdapter } from './adapters/chatgpt';
import { GeminiAdapter } from './adapters/gemini';
import { JimengAdapter } from './adapters/jimeng';
import type { ToolAdapter } from './adapters/types';

const adapters: ToolAdapter[] = [ChatGPTAdapter, GeminiAdapter, JimengAdapter];

function getAdapter(): ToolAdapter | undefined {
    return adapters.find(a => a.detect());
}

const adapter = getAdapter();

// Module-level abort controller for cancelling in-progress execution
let currentAbortController: AbortController | null = null;

if (adapter) {
    console.log(`[Genmix] Connected to ${adapter.name}`);

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        console.log('[Genmix] Received message:', message);

        if (message.type === 'CANCEL_EXECUTION') {
            console.log('[Genmix] Cancelling current execution...');
            if (currentAbortController) {
                currentAbortController.abort();
                currentAbortController = null;
            }
            sendResponse({ success: true });
            return;
        }

        if (message.type === 'EXECUTE_PROMPT' && message.payload) {
            console.log('[Genmix] Executing prompt (Fill + Send)...');

            // Create a new AbortController for this execution
            currentAbortController = new AbortController();
            const signal = currentAbortController.signal;

            (async () => {
                try {
                    // Step -1: Pre-flight validation (e.g. correct URL for task result type)
                    if (adapter.validateState && message.task) {
                        const state = await adapter.validateState(message.task);
                        if (!state.valid) {
                            console.warn('[Genmix] State validation failed:', state.error);
                            if (state.redirectUrl) {
                                sendResponse({ success: false, redirectUrl: state.redirectUrl, error: state.error });
                                return;
                            }
                            throw new Error(state.error || 'Invalid page state for this task');
                        }
                    }

                    // Check abort before each major step
                    if (signal.aborted) throw new Error('Execution cancelled');

                    // Step 0: Clear any existing editor content (images + text) to prevent pollution
                    if (adapter.clearEditor) {
                        await adapter.clearEditor();
                    }

                    if (signal.aborted) throw new Error('Execution cancelled');

                    // Step 1: Inject reference images if provided
                    if (message.images?.length && adapter.fillImages) {
                        console.log('[Genmix] Converting', message.images.length, 'base64 images to blobs...');
                        const blobs: Blob[] = [];
                        for (const dataUrl of message.images) {
                            const res = await fetch(dataUrl);
                            const blob = await res.blob();
                            blobs.push(blob);
                        }
                        await adapter.fillImages(blobs);
                    }

                    if (signal.aborted) throw new Error('Execution cancelled');

                    // Step 2: Fill the prompt text
                    await adapter.fillPrompt(message.payload.prompt);

                    if (message.payload.fillOnly) {
                        console.log('[Genmix] Fill Only mode requested. Skipping send.');
                        sendResponse({ success: true, result: null });
                        return;
                    }

                    // Step 3: Click send
                    await adapter.clickSend();
                    console.log('[Genmix] Sent. Waiting for response...');

                    // Helper: Wait for AI to Start generating
                    await new Promise(r => setTimeout(r, 2000));

                    if (signal.aborted) throw new Error('Execution cancelled');

                    await adapter.waitForCompletion(signal);
                    console.log('[Genmix] Completed. Capturing result...');

                    if (signal.aborted) throw new Error('Execution cancelled');

                    const result = await adapter.getLatestResult(message.task?.resultType);
                    console.log('[Genmix] Execution success. Result length:', result?.length);

                    sendResponse({ success: true, result: result });
                } catch (err: any) {
                    console.error('[Genmix] Execution failed:', err);
                    sendResponse({ success: false, error: err.message });
                } finally {
                    currentAbortController = null;
                }
            })();
            return true; // Keep the message channel open for the async response
        }

        if (message.type === 'PING') {
            return true; // Keep channel open
        }

        if (message.type === 'FILL_PROMPT' && message.payload) {
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
