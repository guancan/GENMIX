import JSZip from 'jszip';

/**
 * Formats a date to YYYY-MM-DD_HHMMSS
 */
export function formatTimestamp(date: number): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    const secs = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day}_${hours}${mins}${secs}`;
}

/**
 * Generates a descriptive filename
 */
export function generateFilename(tool: string, title: string, timestamp: number, index: number, total: number, extension: string): string {
    const cleanTitle = title.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_').substring(0, 30);
    const timeStr = formatTimestamp(timestamp);
    const indexStr = total > 1 ? `_${index + 1}` : '';
    return `${tool}_${cleanTitle}_${timeStr}${indexStr}.${extension}`;
}

/**
 * Downloads multiple URLs as a single ZIP file
 */
export async function downloadAsZip(
    urls: string[],
    tool: string,
    taskTitle: string,
    onProgress?: (progress: number) => void
) {
    const zip = new JSZip();
    const timestamp = Date.now();

    // Create a folder inside the zip for neatness
    const folderName = `${tool}_${taskTitle.replace(/[^a-z0-9\u4e00-\u9fa5]/gi, '_')}_${formatTimestamp(timestamp)}`;
    const folder = zip.folder(folderName) || zip;

    const promises = urls.map(async (url, index) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();

            // Detect extension from content type or URL
            let extension = 'webp';
            if (blob.type.includes('image/png')) extension = 'png';
            else if (blob.type.includes('image/jpeg')) extension = 'jpg';
            else if (blob.type.includes('video/mp4')) extension = 'mp4';
            else if (url.includes('.png')) extension = 'png';
            else if (url.includes('.jpg')) extension = 'jpg';
            else if (url.includes('.mp4')) extension = 'mp4';

            const filename = generateFilename(tool, taskTitle, timestamp, index, urls.length, extension);
            folder.file(filename, blob);

            if (onProgress) {
                onProgress(Math.round(((index + 1) / urls.length) * 50)); // First 50% is downloading
            }
        } catch (err) {
            console.error(`Failed to download ${url}:`, err);
        }
    });

    await Promise.all(promises);

    if (onProgress) onProgress(75); // 75% Generating ZIP

    const content = await zip.generateAsync({ type: 'blob' }, (metadata) => {
        if (onProgress) {
            onProgress(50 + Math.round(metadata.percent / 2)); // Final 50% is generating
        }
    });

    // Create download link and trigger it
    const zipUrl = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = zipUrl;
    link.download = `${folderName}.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(zipUrl);

    if (onProgress) onProgress(100);
}
