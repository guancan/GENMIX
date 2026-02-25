import { useState, useEffect } from 'react';
import { detectToolFromUrl } from '@/utils/toolDetection';
import type { ToolType } from '@/types/task';

export function useActiveTab() {
    const [currentTool, setCurrentTool] = useState<ToolType | 'unknown'>('unknown');
    const [tabId, setTabId] = useState<number | null>(null);

    useEffect(() => {
        async function checkTab() {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab?.url && tab?.id) {
                setTabId(tab.id);
                setCurrentTool(detectToolFromUrl(tab.url));
            }
        }

        checkTab();

        // Fires when a tab's URL changes (e.g., navigation within the same tab)
        const onUpdatedListener = (id: number, changeInfo: { url?: string }, tab: chrome.tabs.Tab) => {
            if (tab.active && changeInfo.url) {
                setCurrentTool(detectToolFromUrl(changeInfo.url));
                setTabId(id);
            }
        };

        // Fires when the user SWITCHES tabs — this is the key missing piece
        const onActivatedListener = async (activeInfo: { tabId: number; windowId: number }) => {
            try {
                const tab = await chrome.tabs.get(activeInfo.tabId);
                if (tab?.url) {
                    setCurrentTool(detectToolFromUrl(tab.url));
                    setTabId(activeInfo.tabId);
                }
            } catch {
                // Tab may have been closed
            }
        };

        chrome.tabs.onUpdated.addListener(onUpdatedListener);
        chrome.tabs.onActivated.addListener(onActivatedListener);

        return () => {
            chrome.tabs.onUpdated.removeListener(onUpdatedListener);
            chrome.tabs.onActivated.removeListener(onActivatedListener);
        };
    }, []);

    return { currentTool, tabId };
}

