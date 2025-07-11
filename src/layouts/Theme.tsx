import React, { useEffect } from 'react';
import { ConfigProvider, theme } from 'antd';
import { useTheme, listenSystemThemeChange } from '@/stores/useStore';

const Theme: React.FC<{ children?: React.ReactNode }> = ({ children }) => {
  const { currentTheme, systemTheme } = useTheme();

  // 在 component mount 时开始监听系统主题变化
  useEffect(() => {
    const unsubscribe = listenSystemThemeChange();
    return () => unsubscribe(); // 在 component unmount 时取消监听
  }, []);

  // 如果当前主题是 system，就根据系统设置来选择 light 或 dark
  const resolvedTheme = currentTheme === 'system' ? systemTheme : currentTheme;
  const algorithm = resolvedTheme === 'light' ? theme.defaultAlgorithm : theme.darkAlgorithm;

  return <ConfigProvider theme={{ algorithm }}>{children}</ConfigProvider>;
};

export default Theme;
