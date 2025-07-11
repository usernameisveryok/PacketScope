// src/store/usePollingManager.ts
import { create } from 'zustand';

type PollingKey = string;

interface PollingConfig {
  url: string;
  intervalMs: number;
  maxRetries: number;
}

interface PollingTask {
  data: any;
  isPolling: boolean;
  retryCount: number;
  config: PollingConfig;
  intervalId?: NodeJS.Timeout;
}

interface PollingStore {
  tasks: Record<PollingKey, PollingTask>;

  startPolling: (key: PollingKey) => void;
  stopPolling: (key: PollingKey) => void;
  togglePolling: (key: PollingKey) => void;
  setConfig: (key: PollingKey, config: Partial<PollingConfig>) => void;
}

export const usePollingManager = create<PollingStore>((set, get) => {
  const fetchData = async (key: string) => {
    const task = get().tasks[key];
    const { config, retryCount } = task;

    if (!config.url?.trim()) {
      console.warn(`[${key}] url 为空，跳过轮询`);
      return;
    }

    try {
      const res = await fetch(config.url);
      const json = await res.json();
      set((state) => ({
        tasks: {
          ...state.tasks,
          [key]: { ...task, data: json, retryCount: 0 },
        },
      }));
    } catch (err) {
      const retries = retryCount + 1;
      console.error(`[${key}] 请求失败 (${retries}/${config.maxRetries})`, err);
      if (retries >= config.maxRetries) {
        get().stopPolling(key);
      } else {
        set((state) => ({
          tasks: {
            ...state.tasks,
            [key]: { ...task, retryCount: retries },
          },
        }));
      }
    }
  };

  return {
    tasks: {},

    startPolling: (key) => {
      const { tasks } = get();
      const task = tasks[key];

      if (!task) return console.warn(`任务 [${key}] 不存在`);
      if (!task.config.url?.trim()) return console.warn(`[${key}] url 为空，无法启动轮询`);
      if (task.isPolling) return;

      const intervalId = setInterval(() => fetchData(key), task.config.intervalMs);
      set({
        tasks: {
          ...tasks,
          [key]: { ...task, isPolling: true, intervalId },
        },
      });
    },

    stopPolling: (key) => {
      const { tasks } = get();
      const task = tasks[key];
      if (!task) return;

      if (task.intervalId) clearInterval(task.intervalId);
      set({
        tasks: {
          ...tasks,
          [key]: { ...task, isPolling: false, intervalId: undefined, retryCount: 0 },
        },
      });
    },

    togglePolling: (key) => {
      const task = get().tasks[key];
      if (!task) return;
      task.isPolling ? get().stopPolling(key) : get().startPolling(key);
    },

    setConfig: (key, config) => {
      const { tasks } = get();
      const existing = tasks[key] || {
        data: null,
        isPolling: false,
        retryCount: 0,
        config: { url: '', intervalMs: 3000, maxRetries: 3 },
      };
      set({
        tasks: {
          ...tasks,
          [key]: {
            ...existing,
            config: { ...existing.config, ...config },
          },
        },
      });
    },
  };
});
