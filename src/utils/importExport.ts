import type { Task, ToolType, TaskResultType } from '@/types/task';
import JSZip from 'jszip';

/* ─── Export Helpers ─── */

/** Export tasks as JSON string */
export function exportTasksAsJson(tasks: Task[]): string {
    return JSON.stringify(tasks, null, 2);
}

/** Export tasks as CSV string (flat fields + latest result summary) */
export function exportTasksAsCsv(tasks: Task[]): string {
    const headers = ['title', 'tool', 'resultType', 'status', 'prompt', 'latestResult', 'createdAt'];
    const rows = tasks.map(t => {
        let latestResult = '';
        if (t.results?.length) {
            const last = t.results[t.results.length - 1];
            try {
                const parsed = JSON.parse(last.content);
                if (parsed.type === 'image') latestResult = parsed.allImageUrls?.[0] || parsed.imageUrl || '[image]';
                else if (parsed.type === 'video') latestResult = parsed.videoUrl || '[video]';
                else latestResult = (parsed.rawText || parsed.content || last.content || '').substring(0, 200);
            } catch {
                latestResult = last.content.substring(0, 200);
            }
        }
        return [
            csvEscape(t.title),
            t.tool,
            t.resultType || 'mixed',
            t.status,
            csvEscape(t.prompt),
            csvEscape(latestResult),
            new Date(t.createdAt).toISOString(),
        ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

function csvEscape(str: string): string {
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/** Trigger a file download in the browser */
export function downloadFile(content: string, filename: string, mimeType: string) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/* ─── Media Export ─── */

/** Extract all media URLs from a task's results */
export function extractMediaUrls(task: Task): { url: string; type: 'image' | 'video' }[] {
    const urls: { url: string; type: 'image' | 'video' }[] = [];
    for (const result of task.results || []) {
        try {
            const parsed = JSON.parse(result.content);
            if (parsed.type === 'image') {
                const imageUrls: string[] = parsed.allImageUrls?.length
                    ? parsed.allImageUrls
                    : [parsed.imageBase64 || parsed.imageUrl].filter(Boolean);
                for (const u of imageUrls) urls.push({ url: u, type: 'image' });
            } else if (parsed.type === 'video' && parsed.videoUrl) {
                urls.push({ url: parsed.videoUrl, type: 'video' });
            }
        } catch { /* not JSON, skip */ }
    }
    return urls;
}

function getExtension(blob: Blob, url: string): string {
    if (blob.type.includes('image/png')) return 'png';
    if (blob.type.includes('image/jpeg')) return 'jpg';
    if (blob.type.includes('image/webp')) return 'webp';
    if (blob.type.includes('video/mp4')) return 'mp4';
    if (url.includes('.png')) return 'png';
    if (url.includes('.jpg') || url.includes('.jpeg')) return 'jpg';
    if (url.includes('.mp4')) return 'mp4';
    if (url.includes('.webp')) return 'webp';
    return blob.type.startsWith('video/') ? 'mp4' : 'webp';
}

function sanitizeFilename(str: string): string {
    return str.replace(/[^a-z0-9\u4e00-\u9fa5_-]/gi, '_').substring(0, 40);
}

/**
 * Download result media from all tasks as a ZIP.
 * @param mode 'flat' = all files in one folder, 'per-task' = sub-folder per task
 */
export async function exportMediaAsZip(
    tasks: Task[],
    tabLabel: string,
    mode: 'flat' | 'per-task',
    onProgress?: (percent: number, status: string) => void
): Promise<{ downloaded: number; failed: number }> {
    const zip = new JSZip();
    const timestamp = new Date().toISOString().slice(0, 10);
    const rootFolder = `genmix_media_${sanitizeFilename(tabLabel)}_${timestamp}`;
    const root = zip.folder(rootFolder) || zip;

    const errors: string[] = [];
    let downloaded = 0;
    let totalUrls = 0;

    const taskMedia = tasks.map(t => ({ task: t, media: extractMediaUrls(t) }));
    for (const tm of taskMedia) totalUrls += tm.media.length;

    if (totalUrls === 0) {
        throw new Error('没有找到可下载的媒体文件');
    }

    let processed = 0;
    for (const { task, media } of taskMedia) {
        if (media.length === 0) continue;

        const folder = mode === 'per-task'
            ? root.folder(sanitizeFilename(task.title)) || root
            : root;

        for (let i = 0; i < media.length; i++) {
            const { url, type } = media[i];
            onProgress?.(Math.round((processed / totalUrls) * 80), `正在下载 ${processed + 1}/${totalUrls}...`);

            try {
                if (url.startsWith('data:')) {
                    const res = await fetch(url);
                    const blob = await res.blob();
                    const ext = getExtension(blob, url);
                    const fname = mode === 'flat'
                        ? `${sanitizeFilename(task.title)}_${i + 1}.${ext}`
                        : `${i + 1}.${ext}`;
                    folder.file(fname, blob);
                    downloaded++;
                } else {
                    const res = await fetch(url);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    const blob = await res.blob();
                    const ext = getExtension(blob, url);
                    const fname = mode === 'flat'
                        ? `${sanitizeFilename(task.title)}_${type}_${i + 1}.${ext}`
                        : `${type}_${i + 1}.${ext}`;
                    folder.file(fname, blob);
                    downloaded++;
                }
            } catch (err) {
                const msg = `[${task.title}] ${url} — ${err instanceof Error ? err.message : 'Unknown error'}`;
                errors.push(msg);
            }
            processed++;
        }
    }

    if (errors.length > 0) {
        root.file('errors.txt', `以下文件下载失败:\n\n${errors.join('\n')}`);
    }

    onProgress?.(85, '正在生成 ZIP...');
    const content = await zip.generateAsync({ type: 'blob' }, (meta) => {
        onProgress?.(85 + Math.round(meta.percent * 0.15), '正在生成 ZIP...');
    });

    onProgress?.(100, '下载中...');
    const zipUrl = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${rootFolder}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);

    return { downloaded, failed: errors.length };
}

/* ─── Import Helpers ─── */

export interface ImportedTask {
    title: string;
    tool: ToolType;
    resultType: TaskResultType;
    prompt: string;
}

/** Parse a JSON file into importable tasks */
export function parseJsonImport(content: string): ImportedTask[] {
    const data = JSON.parse(content);
    const arr = Array.isArray(data) ? data : [data];
    return arr.map(item => ({
        title: item.title || 'Untitled',
        tool: validateTool(item.tool),
        resultType: validateResultType(item.resultType),
        prompt: item.prompt || '',
    }));
}

/** Parse a CSV file into importable tasks */
export function parseCsvImport(content: string): ImportedTask[] {
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const titleIdx = headers.indexOf('title');
    const toolIdx = headers.indexOf('tool');
    const resultTypeIdx = headers.indexOf('resulttype');
    const promptIdx = headers.indexOf('prompt');

    return lines.slice(1).map(line => {
        const cols = parseCsvLine(line);
        return {
            title: cols[titleIdx] || 'Untitled',
            tool: validateTool(cols[toolIdx]),
            resultType: validateResultType(cols[resultTypeIdx]),
            prompt: cols[promptIdx] || '',
        };
    });
}

/** Simple CSV line parser that handles quoted fields */
function parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (inQuotes) {
            if (ch === '"' && line[i + 1] === '"') {
                current += '"';
                i++;
            } else if (ch === '"') {
                inQuotes = false;
            } else {
                current += ch;
            }
        } else {
            if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                result.push(current.trim());
                current = '';
            } else {
                current += ch;
            }
        }
    }
    result.push(current.trim());
    return result;
}

const VALID_TOOLS: ToolType[] = ['chatgpt', 'gemini', 'jimeng', 'sora', 'other'];
const VALID_RESULT_TYPES: TaskResultType[] = ['image', 'video', 'text', 'mixed'];

function validateTool(val: string | undefined): ToolType {
    if (val && VALID_TOOLS.includes(val as ToolType)) return val as ToolType;
    return 'chatgpt';
}

function validateResultType(val: string | undefined): TaskResultType {
    if (val && VALID_RESULT_TYPES.includes(val as TaskResultType)) return val as TaskResultType;
    return 'mixed';
}

/* ─── Import Templates ─── */

/** Generate a sample JSON import template */
export function generateJsonTemplate(): string {
    return JSON.stringify([
        {
            title: '示例任务 1 - 图片生成',
            tool: 'gemini',
            resultType: 'image',
            prompt: '一只可爱的猫咪在阳光下玩耍',
        },
        {
            title: '示例任务 2 - 视频生成',
            tool: 'jimeng',
            resultType: 'video',
            prompt: '日落时分的城市天际线，延时摄影效果',
        },
    ], null, 2);
}

/** Generate a sample CSV import template */
export function generateCsvTemplate(): string {
    return [
        'title,tool,resultType,prompt',
        '示例任务 1 - 图片生成,gemini,image,一只可爱的猫咪在阳光下玩耍',
        '示例任务 2 - 视频生成,jimeng,video,日落时分的城市天际线延时摄影效果',
    ].join('\n');
}
