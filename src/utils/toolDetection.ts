import type { ToolType } from '@/types/task';

export function detectToolFromUrl(url: string): ToolType | 'unknown' {
    if (!url) return 'unknown';

    const u = new URL(url);
    const hostname = u.hostname;

    if (hostname.includes('chatgpt.com') || hostname.includes('openai.com')) {
        return 'chatgpt';
    }
    if (hostname.includes('gemini.google.com')) {
        return 'gemini';
    }
    if (hostname.includes('jimeng.jianying.com')) {
        return 'jimeng';
    }
    if (hostname.includes('sora')) {
        return 'sora';
    }

    return 'unknown';
}
