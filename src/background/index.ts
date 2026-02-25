console.log('Genmix Background Service Worker Initialized');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error(error));

// Message handler for cross-origin image fetching
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'FETCH_IMAGE' && message.url) {
        console.log('[Genmix BG] Fetching image:', message.url);

        // Strategy: manually read auth cookies via chrome.cookies API, then inject them
        // as a Cookie header. We use credentials: 'omit' to avoid the CORS conflict
        // (server returns Access-Control-Allow-Origin: * which is incompatible with 'include').
        // Extensions with host_permissions can set the normally-forbidden 'Cookie' header.
        (async () => {
            try {
                const url = new URL(message.url);

                // Read all cookies for this domain
                const cookies = await chrome.cookies.getAll({ url: message.url });
                const cookieHeader = cookies.map(c => `${c.name}=${c.value}`).join('; ');

                console.log('[Genmix BG] Injecting', cookies.length, 'cookies for', url.hostname);

                const headers: Record<string, string> = {};
                if (cookieHeader) {
                    headers['Cookie'] = cookieHeader;
                }

                const response = await fetch(message.url, {
                    credentials: 'omit',
                    headers,
                });

                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const blob = await response.blob();
                const buffer = await blob.arrayBuffer();

                // Service worker compatible base64 conversion
                let binary = '';
                const bytes = new Uint8Array(buffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64Content = btoa(binary);
                const base64 = `data:${blob.type};base64,${base64Content}`;

                console.log('[Genmix BG] Image fetched and converted, size:', base64.length);
                sendResponse({ success: true, base64 });
            } catch (err: any) {
                console.error('[Genmix BG] Fetch error:', err);
                sendResponse({ success: false, error: err.message });
            }
        })();

        return true; // Keep channel open for async response
    }
});
