import { useState, useCallback, useRef } from 'react';

interface UseTaskQueueOptions {
    /** Execute a single task by ID. Returns true on success, false on failure. */
    executeTask: (taskId: string) => Promise<boolean>;
}

interface UseTaskQueueReturn {
    /** ID of the currently executing task */
    executingId: string | null;
    /** Ordered list of task IDs waiting to execute */
    queuedIds: string[];
    /** Whether auto-next is enabled */
    autoNext: boolean;
    setAutoNext: (v: boolean) => void;
    /** Whether retry-on-failure is enabled */
    retryOnFail: boolean;
    setRetryOnFail: (v: boolean) => void;
    /** Whether the queue is actively processing */
    isRunning: boolean;
    /** Queue all provided task IDs and start processing */
    runAll: (taskIds: string[]) => void;
    /** Queue a single task and start (or append to existing queue) */
    runSingle: (taskId: string) => void;
    /** Stop after the current task finishes */
    stop: () => void;
}

/** Random delay between 1-4 seconds */
function randomDelay(): Promise<void> {
    const ms = Math.floor(Math.random() * 3000) + 1000;
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function useTaskQueue({ executeTask }: UseTaskQueueOptions): UseTaskQueueReturn {
    const [executingId, setExecutingId] = useState<string | null>(null);
    const [queuedIds, setQueuedIds] = useState<string[]>([]);
    const [autoNext, setAutoNext] = useState(true);
    const [retryOnFail, setRetryOnFail] = useState(false);
    const [isRunning, setIsRunning] = useState(false);

    // Use refs to access latest toggle values inside the async loop
    const autoNextRef = useRef(autoNext);
    autoNextRef.current = autoNext;
    const retryOnFailRef = useRef(retryOnFail);
    retryOnFailRef.current = retryOnFail;
    const stoppedRef = useRef(false);

    const processQueue = useCallback(async (queue: string[]) => {
        setIsRunning(true);
        stoppedRef.current = false;

        let remaining = [...queue];

        while (remaining.length > 0) {
            if (stoppedRef.current) break;

            const currentId = remaining[0];
            remaining = remaining.slice(1);

            setExecutingId(currentId);
            setQueuedIds([...remaining]);

            const success = await executeTask(currentId);

            setExecutingId(null);

            if (stoppedRef.current) break;

            if (!success && retryOnFailRef.current) {
                // Retry: put it back at the front
                remaining = [currentId, ...remaining];
                setQueuedIds([...remaining]);
                await randomDelay();
                continue;
            }

            if (!success && !autoNextRef.current) {
                // Failed and no auto-next — stop
                break;
            }

            if (success && !autoNextRef.current) {
                // Succeeded but auto-next is off — stop
                break;
            }

            // Delay before next task
            if (remaining.length > 0) {
                await randomDelay();
            }
        }

        setIsRunning(false);
        setExecutingId(null);
        setQueuedIds([]);
    }, [executeTask]);

    const runAll = useCallback((taskIds: string[]) => {
        if (isRunning) return; // Don't start if already running
        if (taskIds.length === 0) return;
        processQueue(taskIds);
    }, [isRunning, processQueue]);

    const runSingle = useCallback((taskId: string) => {
        if (isRunning) return;
        processQueue([taskId]);
    }, [isRunning, processQueue]);

    const stop = useCallback(() => {
        stoppedRef.current = true;
        setQueuedIds([]);
        // executingId will clear when the current task finishes
    }, []);

    return {
        executingId,
        queuedIds,
        autoNext,
        setAutoNext,
        retryOnFail,
        setRetryOnFail,
        isRunning,
        runAll,
        runSingle,
        stop,
    };
}
