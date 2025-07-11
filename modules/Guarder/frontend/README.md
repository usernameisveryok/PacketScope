# eBPF连接跟踪器 - 前端监控界面

这是一个简单的前端应用，用于实时监控eBPF连接跟踪器的API数据。

## 功能特点

1. 实时显示TCP/UDP连接信息
2. 实时显示ICMP统计信息
3. 实时显示性能指标
4. 自动定期刷新数据
5. 支持搜索和过滤功能
6. 响应式设计，适配各种屏幕尺寸

## 文件结构

```
frontend/
├── index.html       # 主页面
├── css/
│   └── style.css    # 自定义样式
└── js/
    └── app.js       # 应用逻辑
```

## 使用方法

### 配置

在使用前，请确保修改`js/app.js`中的API地址配置：

```javascript
const CONFIG = {
    apiUrl: 'http://localhost:8080', // 修改为你的API服务器地址
    refreshInterval: 5000,           // 刷新间隔，单位毫秒
    maxEntries: 1000,                // 最大显示条目数
    autoRefresh: true                // 默认开启自动刷新
};
```

### 部署方式

#### 方法1：使用简单的HTTP服务器

```bash
# 安装一个简单的HTTP服务器（如果没有）
npm install -g http-server

# 进入前端目录
cd conn-tracker/frontend

# 启动HTTP服务器
http-server -p 8000
```

然后打开浏览器访问 http://localhost:8000

#### 方法2：直接打开HTML文件

你也可以直接在浏览器中打开`index.html`文件，但可能受到浏览器安全策略的限制，无法正常获取API数据。

#### 方法3：与后端集成

如果你希望将前端与后端集成，可以将整个`frontend`目录放在eBPF连接跟踪器API服务器的静态文件目录中。

例如，修改连接跟踪器的API服务器代码，添加静态文件服务：

```go
// 在api.go中添加
http.Handle("/", http.FileServer(http.Dir("./frontend")))
```

### 使用界面

1. **连接表**：显示所有TCP/UDP连接，可以搜索和过滤特定连接
2. **ICMP表**：显示所有ICMP数据包，可以搜索和过滤
3. **性能统计**：显示系统性能指标和统计数据
4. **刷新按钮**：手动刷新所有数据
5. **自动刷新**：系统默认每5秒自动刷新一次数据

## 浏览器兼容性

该前端应用使用了现代JavaScript特性，建议使用以下浏览器：

- Chrome 58+
- Firefox 54+
- Safari 10.1+
- Edge 16+

## 故障排除

如果遇到以下问题：

1. **无法获取数据**：
   - 确保API服务器正在运行
   - 检查API URL配置是否正确
   - 检查浏览器控制台是否有CORS相关错误

2. **数据显示不正确**：
   - 检查API响应格式是否符合预期
   - 尝试清除浏览器缓存

3. **自动刷新不工作**：
   - 检查浏览器控制台是否有JavaScript错误
   - 确保`CONFIG.autoRefresh`设置为`true` 