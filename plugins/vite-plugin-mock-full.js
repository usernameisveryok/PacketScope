import fs from 'fs';
import path from 'path';
import Mock from 'mockjs';
import fg from 'fast-glob';
import { WebSocketServer } from 'ws';

export default function vitePluginMockFull() {
  const mockHttpDir = path.resolve(process.cwd(), 'mock/http');
  const mockWsFile = path.resolve(process.cwd(), 'mock/ws/index.js');

  return {
    name: 'vite-plugin-mock-full',
    apply: 'serve',

    async configureServer(server) {
      // 获取所有 mock/http 下的 .js 文件
      const httpFiles = fg.sync(`${mockHttpDir}/**/*.js`);

      // 遍历所有 mock http 文件
      for (const file of httpFiles) {
        const absPath = path.resolve(file);

        // 动态导入为 ESM 格式
        const mod = await import(absPath);

        const mocks = mod.default || mod;

        // 注册每个 mock 接口
        Object.entries(mocks).forEach(([route, handler]) => {
          server.middlewares.use(route, (req, res) => {
            const result = typeof handler === 'function' ? handler(req) : handler;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify(Mock.mock(result)));
          });
        });
      }

      // 加载 WS mock handler
      let wsHandlers = {};
      if (fs.existsSync(mockWsFile)) {
        const mod = await import(mockWsFile);
        wsHandlers = mod.default || mod;
      }

      const httpServer = server.httpServer;
      if (!httpServer) return;

      const wss = new WebSocketServer({ noServer: true });

      httpServer.on('upgrade', (request, socket, head) => {
        if (request.url === '/ws') {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
          });
        }
      });

      wss.on('connection', (ws) => {
        console.log('[mock-ws] client connected');

        ws.on('message', (message) => {
          try {
            const parsed = JSON.parse(message.toString());
            console.log('[mock-ws] received message:', parsed);
            const { path, payload, delay } = parsed;
            if (typeof wsHandlers[path] === 'function') {
              const result = wsHandlers[path](payload || {});
              const interval = setInterval(() => {
                ws.send(JSON.stringify(Mock.mock(result)));
              }, delay || 1000);

              // 🟡 绑定 close 事件，清除 interval，防止内存泄漏
              ws.on('close', () => {
                clearInterval(interval);
                console.log('[mock-ws] client disconnected');
              });
            } else {
              ws.send(JSON.stringify({ error: `Unknown path: ${path}` }));
            }
          } catch (err) {
            ws.send(JSON.stringify({ error: 'Invalid JSON or internal error', err }));
          }
        });

        // ✅ 额外加一层保护：关闭事件未在 message 分支中处理时
        ws.on('close', () => {
          console.log('[mock-ws] client disconnected (no message handler)');
        });
      });

      console.log('[vite-plugin-mock-full] ✅ Mock HTTP & WebSocket ready.');
    },
  };
}
