import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import svgr from 'vite-plugin-svgr';
// 自定义插件
import vitePluginMockFull from './plugins/vite-plugin-mock-full';

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [vitePluginMockFull(), react(), tailwindcss(), svgr()],
  resolve: { alias: { '@': resolve(__dirname, 'src') } },
  server: {
    watch: {
      ignored: ['**/modules/monitor/**'],
    },
  },
});
