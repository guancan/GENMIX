console.log('Genmix Background Service Worker Initialized');

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error: unknown) => console.error(error));

// Message handler for cross-origin image fetching
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'FETCH_IMAGE' && message.url) {
        console.log('[Genmix BG] Fetching image:', message.url);

        fetch(message.url, { credentials: 'include' })
            .then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.blob();
            })
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64 = reader.result as string;
                    console.log('[Genmix BG] Image fetched, size:', base64.length);
                    sendResponse({ success: true, base64 });
                };
                reader.onerror = () => {
                    sendResponse({ success: false, error: 'Failed to read blob' });
                };
                reader.readAsDataURL(blob);
            })
            .catch(err => {
                console.error('[Genmix BG] Fetch error:', err);
                sendResponse({ success: false, error: err.message });
            });

        return true; // Keep channel open for async response
    }
});
