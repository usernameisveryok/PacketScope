/* eslint-disable @typescript-eslint/no-explicit-any */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { LOCAL_STORE } from '@/constants';
import { devtools } from 'zustand/middleware';

type ThemeType = 'light' | 'dark' | 'system';

// 监听系统主题
export const getSystemTheme = (): Exclude<ThemeType, 'system'> =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

interface ThemeState {
  systemTheme: Exclude<ThemeType, 'system'>;
  currentTheme: ThemeType;
  setCurrentTheme: (newTheme: ThemeType) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set) => ({
      currentTheme: 'light', // 默认值，不用 getStoredTheme()，persist 会自动读取存储值
      systemTheme: getSystemTheme(),
      setCurrentTheme: (newTheme) => {
        set({ currentTheme: newTheme });
      },
    }),
    {
      name: LOCAL_STORE.theme, // persist 处理 localStorage 存储
    },
  ),
);
// 监听系统主题变化
export const listenSystemThemeChange = () => {
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

  const handleThemeChange = (event: MediaQueryListEvent) => {
    if (useTheme.getState().currentTheme === 'system') {
      useTheme.setState({ systemTheme: event.matches ? 'dark' : 'light' });
    }
  };

  mediaQuery.addEventListener('change', handleThemeChange);

  return () => {
    mediaQuery.removeEventListener('change', handleThemeChange);
  };
};

type LangType = 'en-US' | 'zh-CN';

interface SelectLangState {
  defaultValue: LangType;
  currentLang: LangType;
  setCurrentLang: (newLang: LangType) => void;
}

// 获取浏览器默认语言
const getDefaultLang = (): LangType => (navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US');

export const useSelectLang = create<SelectLangState>()(
  persist(
    (set) => ({
      defaultValue: getDefaultLang(),
      currentLang: getDefaultLang(), // 语言默认值
      setCurrentLang: (newLang) => {
        set({ currentLang: newLang });
      },
    }),
    {
      name: LOCAL_STORE.local, // localStorage key
    },
  ),
);

interface AutoScrollState {
  isAutoScroll: boolean;
  setIsAutoScroll: (value: boolean) => void;
  toggleAutoScroll: () => void;
}

export const useIsAutoScroll = create<AutoScrollState>((set, get) => ({
  isAutoScroll: true,

  // 显式设置
  setIsAutoScroll: (value: boolean) => {
    set({ isAutoScroll: value });
  },

  // 切换 true/false
  toggleAutoScroll: () => {
    set({ isAutoScroll: !get().isAutoScroll });
  },
}));

interface AIModalVisibleState {
  aiGenerateModalVisible: boolean;
  setAiGenerateModalVisible: (value: boolean) => void;
  toggleAiGenerateModalVisible: () => void;
}
export const useAIModalVisible = create<AIModalVisibleState>((set, get) => ({
  aiGenerateModalVisible: false,

  // 显式设置
  setAiGenerateModalVisible: (value: boolean) => {
    set({ aiGenerateModalVisible: value });
  },

  // 切换 true/false
  toggleAiGenerateModalVisible: () => {
    set({ aiGenerateModalVisible: !get().aiGenerateModalVisible });
  },
}));

// 模态框可见性状态
interface ModalState {
  aiConfigModalVisible: boolean;
  setAiConfigModalVisible: (visible: boolean) => void;
  aiGenerateModalVisible: boolean;
  setAiGenerateModalVisible: (visible: boolean) => void;
  aiAnalyzeModalVisible: boolean;
  setAiAnalyzeModalVisible: (visible: boolean) => void;
  filterModalVisible: boolean;
  setFilterModalVisible: (visible: boolean) => void;
}

export const useModals = create<ModalState>()(
  // devtools(
  (set) => ({
    aiConfigModalVisible: false,
    setAiConfigModalVisible: (visible) => {
      set({ aiConfigModalVisible: visible });
    },
    aiGenerateModalVisible: false,
    setAiGenerateModalVisible: (visible) => {
      set({ aiGenerateModalVisible: visible });
    },
    aiAnalyzeModalVisible: false,
    setAiAnalyzeModalVisible: (visible) => {
      set({ aiAnalyzeModalVisible: visible });
    },
    filterModalVisible: false,
    setFilterModalVisible: (visible) => {
      set({ filterModalVisible: visible });
    },
  }),
  //   {
  //     name: 'modals-storage',
  //   },
  // ),
);

// 编辑状态
interface EditState {
  editingFilter: Filter | null;
  setEditingFilter: (filter: Filter | null) => void;
}

export const useEdit = create<EditState>()(
  devtools(
    (set) => ({
      editingFilter: null,
      setEditingFilter: (filter) => {
        set({ editingFilter: filter });
      },
    }),
    {
      name: 'edit-storage',
    },
  ),
);
