import type { ToolAdapter } from './types';

export const JimengAdapter: ToolAdapter = {
    name: 'jimeng',
    detect: () => window.location.hostname.includes('jimeng.jianying.com'),

    async validateState(task) {
        console.log('[Genmix] Jimeng: validating state for resultType:', task.resultType);

        // Jimeng uses query parameters to determine generation type: ?type=image or ?type=video
        const currentUrl = window.location.href;
        const isImagePage = currentUrl.includes('type=image');
        const isVideoPage = currentUrl.includes('type=video');

        if (task.resultType === 'image' && !isImagePage) {
            return {
                valid: false,
                redirectUrl: 'https://jimeng.jianying.com/ai-tool/generate?type=image',
                error: 'Task requires image generation but current page is not set to image mode.'
            };
        }

        if (task.resultType === 'video' && !isVideoPage) {
            return {
                valid: false,
                redirectUrl: 'https://jimeng.jianying.com/ai-tool/generate?type=video',
                error: 'Task requires video generation but current page is not set to video mode.'
            };
        }

        return { valid: true };
    },

    async clearEditor() {
        console.log('[Genmix] Jimeng: clearing editor...');

        // 1. Remove all existing reference images by clicking their × buttons
        const removeButtons = document.querySelectorAll<HTMLDivElement>('[class*="remove-button-UmHkUb"]');
        if (removeButtons.length > 0) {
            console.log(`[Genmix] Jimeng: removing ${removeButtons.length} existing reference image(s)...`);
            for (const btn of Array.from(removeButtons)) {
                btn.click();
                await new Promise(r => setTimeout(r, 300));
            }
            // Settle after removals
            await new Promise(r => setTimeout(r, 500));
        }

        // 2. Clear the prompt textarea
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[class*="prompt-textarea-"]');
        if (textarea) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, 'value'
            )?.set;
            nativeInputValueSetter?.call(textarea, '');
            textarea.dispatchEvent(new Event('input', { bubbles: true }));
            textarea.dispatchEvent(new Event('change', { bubbles: true }));
        }

        console.log('[Genmix] Jimeng: editor cleared');
        await new Promise(r => setTimeout(r, 300));
    },

    async fillImages(images: Blob[]) {
        if (images.length === 0) return;
        console.log('[Genmix] Jimeng: injecting', images.length, 'reference image(s)...');

        const input = document.querySelector<HTMLInputElement>('input[type="file"][class*="file-input-"]');
        if (!input) {
            console.error('[Genmix] Jimeng: file input not found');
            throw new Error('Jimeng file input not found — cannot upload reference images');
        }

        // Inject images one-by-one so Jimeng processes each upload
        for (let i = 0; i < images.length; i++) {
            const blob = images[i];
            const file = new File([blob], `reference-${i + 1}.png`, { type: blob.type || 'image/png' });
            const dt = new DataTransfer();
            dt.items.add(file);
            input.files = dt.files;
            input.dispatchEvent(new Event('change', { bubbles: true }));
            console.log(`[Genmix] Jimeng: injected image ${i + 1}/${images.length}, size: ${file.size} bytes`);

            // Wait for Jimeng to process the upload before injecting the next
            await new Promise(r => setTimeout(r, 800));
        }

        console.log('[Genmix] Jimeng: all reference images injected');
        // Extra settle time for UI to update
        await new Promise(r => setTimeout(r, 500));
    },

    async fillPrompt(text: string) {
        // Textarea identified from real DOM: class contains 'prompt-textarea-'
        const textarea = document.querySelector<HTMLTextAreaElement>('textarea[class*="prompt-textarea-"]');

        if (!textarea) {
            console.error('[Genmix] Jimeng: prompt textarea not found');
            throw new Error('Jimeng prompt textarea not found');
        }

        // React-controlled textarea: use native setter to trigger synthetic events
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype, 'value'
        )?.set;
        nativeInputValueSetter?.call(textarea, text);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        textarea.dispatchEvent(new Event('change', { bubbles: true }));
        textarea.focus();

        console.log('[Genmix] Jimeng: filled prompt textarea');

        // Small delay for React to process input and enable the submit button
        await new Promise(r => setTimeout(r, 500));
    },

    async clickSend() {
        // Submit button identified from real DOM: class contains 'submit-button-KJTUYS'
        // Two buttons share this class (collapsed + expanded); take the last (expanded state visible in toolbar)
        const buttons = document.querySelectorAll<HTMLButtonElement>('button[class*="submit-button-KJTUYS"]');
        const sendButton = buttons[buttons.length - 1];

        if (!sendButton) {
            console.error('[Genmix] Jimeng: submit button not found');
            throw new Error('Jimeng submit button not found');
        }

        if (sendButton.disabled) {
            console.warn('[Genmix] Jimeng: submit button disabled — prompt may be empty or unchanged');
        }

        sendButton.click();
        console.log('[Genmix] Jimeng: clicked submit button');
    },

    async waitForCompletion() {
        console.log('[Genmix] Jimeng: waiting for completion...');

        // The newest item is always at data-index="0"
        // Loading state: contains .loading-container-VeCJoq (video shimmer)
        // Completed state: contains img[class*="image-TLmgkP"]

        return new Promise<void>((resolve) => {
            const poll = setInterval(() => {
                const newestItem = document.querySelector('.item-Xh64V7[data-index="0"]');
                if (!newestItem) return;

                const isLoading = newestItem.querySelector('[class*="loading-container-"]');
                const isCompleted = newestItem.querySelector('img[class*="image-TLmgkP"]');

                if (!isLoading && isCompleted) {
                    clearInterval(poll);
                    clearTimeout(timeout);
                    console.log('[Genmix] Jimeng: generation complete');
                    // Brief settle delay
                    setTimeout(resolve, 800);
                }

                // Also check progress badge text for any % indicator
                const badge = newestItem.querySelector('[class*="progress-badge-"]');
                if (badge) {
                    console.log('[Genmix] Jimeng: progress:', badge.textContent?.trim());
                }
            }, 2000);

            // Safety timeout: 3 minutes (Jimeng video generation can queue)
            const timeout = setTimeout(() => {
                clearInterval(poll);
                console.warn('[Genmix] Jimeng: timed out waiting for completion');
                resolve();
            }, 180000);
        });
    },

    async getLatestResult(expectedType?: string): Promise<string | null> {
        // Newest item is always data-index="0"
        const newestItem = document.querySelector('.item-Xh64V7[data-index="0"]');
        if (!newestItem) return null;

        const itemId = newestItem.getAttribute('data-id');

        // Note: Jimeng sometimes returns multiple images, or a single video.
        const isMixedOrImage = !expectedType || expectedType === 'mixed' || expectedType === 'image';
        const isMixedOrVideo = !expectedType || expectedType === 'mixed' || expectedType === 'video';

        // 1. Check for Image Results (if requested)
        if (isMixedOrImage) {
            const images = newestItem.querySelectorAll<HTMLImageElement>('img[class*="image-TLmgkP"]');
            if (images.length > 0) {
                const imageUrls = Array.from(images).map(img => img.src).filter(Boolean);
                console.log('[Genmix] Jimeng: captured', imageUrls.length, 'images from item', itemId);

                // Fetch the first image as base64 via background worker
                if (imageUrls[0]) {
                    try {
                        const response = await chrome.runtime.sendMessage({
                            type: 'FETCH_IMAGE',
                            url: imageUrls[0]
                        });

                        if (response?.success) {
                            return JSON.stringify({
                                type: 'image',
                                imageUrl: imageUrls[0],
                                imageBase64: response.base64,
                                allImageUrls: imageUrls,
                                itemId,
                                imageDescription: `Jimeng generated image (${imageUrls.length} results)`
                            });
                        }
                    } catch (err) {
                        console.warn('[Genmix] Jimeng: failed to fetch image as base64', err);
                    }

                    // Fallback: return URL without base64
                    return JSON.stringify({
                        type: 'image',
                        imageUrl: imageUrls[0],
                        allImageUrls: imageUrls,
                        itemId,
                        imageDescription: `Jimeng generated image (${imageUrls.length} results)`
                    });
                }
            }
        }

        // 2. Check for Video Results (if requested or if image failed/wasn't requested in mixed mode)
        if (isMixedOrVideo) {
            const video = newestItem.querySelector<HTMLVideoElement>('video:not([class*="loading-animation-"])');
            if (video?.src) {
                console.log('[Genmix] Jimeng: captured video from item', itemId);
                return JSON.stringify({ type: 'video', videoUrl: video.src, itemId });
            }
        }

        // 3. Fallback for text (Jimeng currently doesn't generate text-only responses, but just in case)
        if (expectedType === 'text') {
            console.warn('[Genmix] Jimeng: Task requested text result, but Jimeng only produces images/videos.');
        }

        return null;
    }
};
