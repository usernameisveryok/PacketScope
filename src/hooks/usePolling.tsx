import { useCallback, useEffect, useRef, useState } from 'react';

export interface UsePollingOptions {
  /** 轮询间隔时间，单位：毫秒 */
  interval?: number;
  /** 是否立即执行一次 */
  immediate?: boolean;
  /** 是否自动开始轮询 */
  autoStart?: boolean;
  /** 轮询函数执行出错时的回调 */
  onError?: (error: Error) => void;
  /** 轮询开始时的回调 */
  onStart?: () => void;
  /** 轮询停止时的回调 */
  onStop?: () => void;
  /** 最大重试次数，默认为 0（不重试） */
  maxRetries?: number;
  /** 重试延迟时间，单位：毫秒 */
  retryDelay?: number;
}

export interface UsePollingReturn {
  /** 是否正在轮询 */
  isPolling: boolean;
  /** 是否正在执行轮询函数 */
  isLoading: boolean;
  /** 最后一次执行的错误 */
  error: Error | null;
  /** 开始轮询 */
  start: () => void;
  /** 停止轮询 */
  stop: () => void;
  /** 切换轮询状态 */
  toggle: () => void;
  /** 手动执行一次轮询函数 */
  execute: () => Promise<void>;
  /** 重置错误状态 */
  resetError: () => void;
  /** 当前重试次数 */
  retryCount: number;
}

/**
 * 轮询 Hook
 * @param pollingFn 轮询执行的函数
 * @param options 配置选项
 * @returns 轮询控制方法和状态
 */
export const usePolling = (pollingFn: () => Promise<void> | void, options: UsePollingOptions = {}): UsePollingReturn => {
  const { interval = 3000, immediate = false, autoStart = false, onError, onStart, onStop, maxRetries = 0, retryDelay = 1000 } = options;

  const [isPolling, setIsPolling] = useState(autoStart);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const pollingFnRef = useRef(pollingFn);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 更新轮询函数引用
  pollingFnRef.current = pollingFn;

  // 清理定时器
  const clearTimers = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // 执行轮询函数
  const execute = useCallback(async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      const result = pollingFnRef.current();

      // 如果返回 Promise，等待执行完成
      if (result instanceof Promise) {
        await result;
      }

      // 执行成功，重置重试次数
      setRetryCount(0);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      setError(error);

      // 如果设置了重试次数且当前重试次数小于最大重试次数
      if (maxRetries > 0 && retryCount < maxRetries) {
        setRetryCount((prev) => prev + 1);

        // 延迟重试
        retryTimerRef.current = setTimeout(() => {
          execute();
        }, retryDelay);

        return;
      }

      // 执行错误回调
      onError?.(error);
    } finally {
      setIsLoading(false);
    }
  }, [retryCount, maxRetries, retryDelay, onError]);

  // 开始轮询
  const start = useCallback(() => {
    if (isPolling) return;

    setIsPolling(true);
    setError(null);
    setRetryCount(0);
    onStart?.();

    // 立即执行一次
    if (immediate) {
      console.log(immediate, isPolling);
      execute();
    }

    // 设置定时器
    const runPolling = () => {
      timerRef.current = setTimeout(async () => {
        await execute();

        // 如果仍在轮询状态，继续下一次轮询
        if (isPolling) {
          runPolling();
        }
      }, interval);
    };

    // 如果不立即执行，延迟后开始第一次轮询
    if (!immediate) {
      runPolling();
    } else {
      // 立即执行后，设置后续轮询
      setTimeout(() => {
        if (isPolling) {
          runPolling();
        }
      }, interval);
    }
  }, [isPolling, immediate, interval, execute, onStart]);

  // 停止轮询
  const stop = useCallback(() => {
    if (!isPolling) return;

    setIsPolling(false);
    clearTimers();
    onStop?.();
  }, [isPolling, clearTimers, onStop]);

  // 切换轮询状态
  const toggle = useCallback(() => {
    if (isPolling) {
      stop();
    } else {
      start();
    }
  }, [isPolling, start, stop]);

  // 重置错误状态
  const resetError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  // 自动开始轮询
  useEffect(() => {
    if (autoStart) {
      start();
    }

    return () => {
      clearTimers();
    };
  }, []); // 只在组件挂载时执行

  // 清理副作用
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  // 当 isPolling 状态改变时，更新轮询逻辑
  useEffect(() => {
    if (!isPolling) {
      clearTimers();
      return;
    }

    const runPolling = () => {
      timerRef.current = setTimeout(async () => {
        if (isPolling) {
          await execute();
          runPolling();
        }
      }, interval);
    };

    runPolling();

    return () => {
      clearTimers();
    };
  }, [isPolling, interval, execute, clearTimers]);

  return {
    isPolling,
    isLoading,
    error,
    start,
    stop,
    toggle,
    execute,
    resetError,
    retryCount,
  };
};

// 使用示例和类型导出
export default usePolling;
