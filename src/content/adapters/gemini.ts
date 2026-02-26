import type { ToolAdapter } from './types';

export const GeminiAdapter: ToolAdapter = {
    name: 'gemini',
    detect: () => window.location.hostname.includes('gemini.google.com'),

    async fillImages(blobs: Blob[]) {
        if (!blobs || blobs.length === 0) return;

        // Gemini uses Quill.js editor — the most reliable way to inject images
        // is simulating a clipboard paste, exactly like a user doing Ctrl+V.
        const editor = document.querySelector('.ql-editor') as HTMLElement;
        if (!editor) {
            console.warn('[Genmix] Gemini editor (.ql-editor) not found for image paste');
            return;
        }

        // Ensure the editor is focused before pasting
        editor.focus();

        for (let i = 0; i < blobs.length; i++) {
            const blob = blobs[i];
            const ext = blob.type === 'image/png' ? 'png' : 'jpg';
            const file = new File([blob], `reference_image_${i + 1}.${ext}`, { type: blob.type || 'image/png' });

            // Build a DataTransfer with this single file
            const dt = new DataTransfer();
            dt.items.add(file);

            // Dispatch a paste event on the editor — Quill listens for this
            const pasteEvent = new ClipboardEvent('paste', {
                bubbles: true,
                cancelable: true,
                clipboardData: dt,
            });
            editor.dispatchEvent(pasteEvent);

            console.log(`[Genmix] Pasted reference image ${i + 1}/${blobs.length}`);

            // Wait for Gemini to process the pasted image before the next one
            await new Promise(r => setTimeout(r, 1500));
        }

        // Extra settle time after all images are pasted
        await new Promise(r => setTimeout(r, 500));
    },

    async fillPrompt(text: string) {
        const editor = document.querySelector('.ql-editor');
        if (!editor) {
            console.warn('[Genmix] Gemini editor (.ql-editor) not found');
            throw new Error('Gemini input editor not found.');
        }

        // Replace the rich text editor content
        editor.innerHTML = `<p>${text}</p>`;

        // Dispatch input events so the framework (Angular/Quill) updates its internal state
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));

        // Wait a moment for state sync
        await new Promise(r => setTimeout(r, 200));
    },

    async clickSend() {
        const sendButton = document.querySelector('button.send-button');
        if (!sendButton) {
            throw new Error('[Genmix] Gemini send button not found');
        }

        // Small delay to ensure the button is enabled after input
        await new Promise(r => setTimeout(r, 300));

        if (sendButton instanceof HTMLElement) {
            sendButton.click();
        }
    },

    async waitForCompletion(signal?: AbortSignal) {
        return new Promise<void>((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (signal?.aborted) {
                    clearInterval(checkInterval);
                    reject(new Error('Execution cancelled'));
                    return;
                }

                // During generation, Gemini changes the send button into a stop button.
                // It might have the "stop" class, or an aria-label for stopping, or contain a stop-icon.
                const sendButton = document.querySelector('button.send-button');
                const isStopButton = sendButton && (
                    sendButton.classList.contains('stop') ||
                    sendButton.getAttribute('aria-label')?.includes('停止') ||
                    sendButton.querySelector('.stop-icon') !== null
                );

                // There is also usually a spinner or a processing-state element.
                const isProcessingStateVisible = document.querySelector('.extension-processing-state:not([hidden])');
                const isSpinnerVisible = document.querySelector('.avatar_spinner_animation:not([style*="visibility: hidden"])');

                // If none of the generation indicators are present, it is likely finished.
                if (!isStopButton && !isProcessingStateVisible && !isSpinnerVisible) {
                    // Make sure at least one model response exists to confirm it's not just an empty state
                    const responses = document.querySelectorAll('model-response');
                    if (responses.length > 0) {
                        clearInterval(checkInterval);
                        // Delay slightly to allow rendering of final elements (e.g. video load)
                        setTimeout(resolve, 1000);
                    }
                }
            }, 1000);
        });
    },

    async getLatestResult(expectedType?: string) {
        const responses = document.querySelectorAll('model-response');
        if (responses.length === 0) return null;

        const latestResponse = responses[responses.length - 1];

        // 1. Extract raw text (clean up UI elements like video player times)
        let rawText = '';
        let htmlContent = '';
        const markdownElement = latestResponse.querySelector('message-content .markdown');
        if (markdownElement) {
            const clone = markdownElement.cloneNode(true) as HTMLElement;
            // Remove attachment containers (which contain "0:00 / 0:08", image tags, etc)
            const attachments = clone.querySelectorAll('.attachment-container');
            attachments.forEach(a => a.remove());
            // Remove thoughts container if present
            const thoughts = clone.querySelectorAll('.thoughts-container');
            thoughts.forEach(t => t.remove());

            rawText = clone.textContent?.trim() || '';
            htmlContent = clone.innerHTML?.trim() || '';
        }

        // 2. Extract images strictly from generated-image components
        const imageElements = Array.from(latestResponse.querySelectorAll('generated-image img.image'));
        const allImageUrls = imageElements
            .map(img => (img as HTMLImageElement).src)
            .filter(src => src && !src.startsWith('data:image/svg'));

        // 3. Extract videos strictly from generated-video components
        const videoElements = Array.from(latestResponse.querySelectorAll('generated-video video'));
        const allVideoUrls = videoElements
            .map(v => (v as HTMLVideoElement).src)
            .filter(src => src);

        // 4. Determine the result type and build the response in UI-compatible format
        //    The UI expects: { type: 'image'|'video'|'text', imageUrl?, imageBase64?, videoUrl?, allImageUrls? }
        const hasImages = allImageUrls.length > 0;
        const hasVideos = allVideoUrls.length > 0;

        // Prioritize based on expectedType
        if ((expectedType === 'video' || expectedType === 'mixed') && hasVideos) {
            return JSON.stringify({
                type: 'video',
                videoUrl: allVideoUrls[0],
                allVideoUrls,
            });
        }

        if ((expectedType === 'image' || expectedType === 'mixed') && hasImages) {
            // Return raw URLs — the sidepanel (extension page) will fetch them
            // using its privileged context which bypasses CORS/CSP.
            return JSON.stringify({
                type: 'image',
                imageUrl: allImageUrls[0],
                allImageUrls,
                imageDescription: rawText || `Gemini generated image (${allImageUrls.length} results)`,
            });
        }

        // Fallback: auto-detect type from what was actually generated
        if (hasVideos) {
            return JSON.stringify({
                type: 'video',
                videoUrl: allVideoUrls[0],
                allVideoUrls,
            });
        }

        if (hasImages) {
            return JSON.stringify({
                type: 'image',
                imageUrl: allImageUrls[0],
                allImageUrls,
                imageDescription: rawText || `Gemini generated image (${allImageUrls.length} results)`,
            });
        }

        // Text-only response
        if (rawText) {
            return JSON.stringify({
                type: 'text',
                rawText,
                htmlContent,
            });
        }

        return null;
    }
};
