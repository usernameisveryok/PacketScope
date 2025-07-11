import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, Button, Space, Table, Input, App } from 'antd';
import { Activity, Shield, Globe, Zap, Eye, Search, Download, RefreshCw, RotateCcw } from 'lucide-react';
import usePolling from '@/hooks/usePolling';

// 类型定义
interface Connection {
  id: number;
  key: string;
  info: string;
}

interface Stats {
  TotalPackets: number;
  TotalBytes: number;
  DroppedPackets: number;
  MalformedPackets: number;
}

interface StatCardProps {
  label: string;
  value: string | number;
  icon: React.ReactElement;
  color: string;
}

// API 配置
const API_BASE_URL = 'http://localhost:8080/api';
const POLLING_INTERVAL = 3000;
const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;
const MIN_TABLE_HEIGHT = 300;

const Connections: React.FC = () => {
  const { notification: notificationFn } = App.useApp();
  // 状态管理
  const [connections, setConnections] = useState<Connection[]>([]);
  const [filteredConnections, setFilteredConnections] = useState<Connection[]>([]);
  const [stats, setStats] = useState<Stats>({
    TotalPackets: 0,
    TotalBytes: 0,
    DroppedPackets: 0,
    MalformedPackets: 0,
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isAutoScroll, setIsAutoScroll] = useState(true);
  const [tableHeight, setTableHeight] = useState(400);

  // 引用
  const tableContainerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<any>(null);

  // 工具函数
  const formatBytes = useCallback((bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }, []);

  // 计算表格高度
  const calculateTableHeight = useCallback(() => {
    if (tableContainerRef.current) {
      const rect = tableContainerRef.current.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const availableHeight = windowHeight - rect.top;
      const calculatedHeight = Math.max(availableHeight - 156, MIN_TABLE_HEIGHT);
      setTableHeight(calculatedHeight);
    }
  }, []);

  // API 调用函数
  const fetchStats = useCallback(async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/stats`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    setStats(data);
  }, []);

  const fetchConnections = useCallback(async (): Promise<void> => {
    const response = await fetch(`${API_BASE_URL}/connections`);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    const processedConnections = data.map((conn: any, index: number) => ({
      id: conn.id || index + 1,
      key: conn.key,
      info: conn.info,
    }));

    setConnections(processedConnections);
  }, []);

  const fetchAllData = useCallback(async (): Promise<void> => {
    await Promise.all([fetchStats(), fetchConnections()]);
  }, [fetchStats, fetchConnections]);

  // 轮询配置
  const {
    isPolling,
    isLoading,
    error,
    toggle: togglePolling,
    execute: manualRefresh,
    retryCount,
  } = usePolling(fetchAllData, {
    interval: POLLING_INTERVAL,
    immediate: true,
    autoStart: false,
    maxRetries: MAX_RETRIES,
    retryDelay: RETRY_DELAY,
    onError: (error) => {
      notificationFn.error({
        message: '数据获取失败',
        description: `无法获取数据：${error.message}${retryCount > 0 ? ` (重试 ${retryCount}/${MAX_RETRIES})` : ''}`,
        duration: 4,
      });
    },
    onStart: () => {
      notificationFn.success({
        message: '监控已开启',
        description: '开始实时监控网络连接',
        duration: 2,
      });
    },
    onStop: () => {
      notificationFn.info({
        message: '监控已停止',
        description: '已停止实时监控',
        duration: 2,
      });
    },
  });

  // 事件处理函数
  const handleRefresh = async (): Promise<void> => {
    try {
      await manualRefresh();
      notificationFn.success({
        message: '刷新成功',
        description: '数据已更新',
        duration: 2,
      });
    } catch (error) {
      // 错误已经在轮询 Hook 中处理
    }
  };

  const handleExport = (): void => {
    const exportData = {
      stats,
      connections: filteredConnections,
      exportTime: new Date().toISOString(),
      isPolling,
      retryCount,
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `network_connections_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    notificationFn.success({
      message: '导出成功',
      description: '数据已保存到本地文件',
      duration: 2,
    });
  };

  // 副作用处理
  useEffect(() => {
    calculateTableHeight();
    const handleResize = () => calculateTableHeight();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateTableHeight]);

  useEffect(() => {
    const timer = setTimeout(calculateTableHeight, 100);
    return () => clearTimeout(timer);
  }, [calculateTableHeight]);

  // 连接过滤
  useEffect(() => {
    let filtered = connections;

    if (searchTerm) {
      const searchLower = searchTerm.toLowerCase();
      filtered = filtered.filter((conn) => conn.key.toLowerCase().includes(searchLower) || conn.info.toLowerCase().includes(searchLower));
    }

    setFilteredConnections(filtered);
  }, [connections, searchTerm]);

  // 自动滚动处理
  useEffect(() => {
    if (!tableRef.current || !filteredConnections.length || !isAutoScroll) return;

    const scrollToBottom = () => {
      const body = tableRef.current?.nativeElement?.querySelector('.ant-table-tbody-virtual-holder');
      if (body) {
        setTimeout(() => {
          body.scrollTop = body.scrollHeight;
        }, 0);
      }
    };

    const frameId = requestAnimationFrame(scrollToBottom);
    return () => cancelAnimationFrame(frameId);
  }, [filteredConnections, isAutoScroll]);

  // 滚动事件监听
  useEffect(() => {
    if (!tableRef.current) return;

    const body = tableRef.current?.nativeElement?.querySelector('.ant-table-tbody-virtual-holder');
    if (!body) return;

    const handleScrollEvent = () => {
      const distanceToBottom = body.scrollHeight - body.scrollTop - body.clientHeight;
      const atBottom = distanceToBottom < 20;
      setIsAutoScroll(atBottom);
    };

    body.addEventListener('scroll', handleScrollEvent);
    return () => body.removeEventListener('scroll', handleScrollEvent);
  }, [tableRef.current]);

  // 统计卡片组件
  const StatCard: React.FC<StatCardProps> = ({ label, value, icon, color }) => (
    <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{label}</p>
          <p className={`text-3xl font-bold text-${color}-600`}>{value}</p>
        </div>
        <div className={`p-3 bg-${color}-100 rounded-lg`}>{React.cloneElement(icon, { className: `w-6 h-6 text-${color}-600` })}</div>
      </div>
    </div>
  );

  // 统计数据配置
  const statsConfig = [
    { label: '总数据包', value: stats.TotalPackets, icon: <Globe />, color: 'green' },
    { label: '总字节数', value: formatBytes(stats.TotalBytes), icon: <Zap />, color: 'blue' },
    { label: '丢弃的数据包', value: stats.DroppedPackets, icon: <Activity />, color: 'purple' },
    { label: '格式错误的数据包', value: stats.MalformedPackets, icon: <Shield />, color: 'red' },
  ];

  // 表格列配置
  const columns = [
    {
      title: '连接信息',
      key: 'key',
      width: 200,
      dataIndex: 'key',
      render: (key: string) => <div className="text-sm font-medium text-gray-600">{key}</div>,
    },
    {
      title: '详细信息',
      key: 'info',
      dataIndex: 'info',
      render: (info: string) => <div className="text-sm font-medium text-gray-600">{info}</div>,
    },
  ];

  return (
    <div>
      <div className="mx-auto space-y-6">
        {/* 页面标题 */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Activity className="text-white" size={30} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">网络连接监控</h1>
              <p className="text-gray-600">实时监控网络连接状态和流量数据</p>
            </div>
          </div>
        </header>

        {/* 统计卡片 */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {statsConfig.map((item, index) => (
            <StatCard key={index} {...item} />
          ))}
        </section>

        {/* 搜索与控制面板 */}
        <Card className="shadow-sm">
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            <div className="flex-1">
              <Input
                prefix={<Search className="text-gray-400 w-4 h-4" />}
                placeholder="搜索 IP 地址或协议..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
                allowClear
              />
            </div>
            <Space>
              <Button
                type={isPolling ? 'primary' : 'default'}
                danger={isPolling}
                icon={isPolling ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
                onClick={togglePolling}
              >
                {isPolling ? '停止监控' : '开始监控'}
              </Button>
              <Button
                onClick={handleRefresh}
                icon={<RotateCcw className="w-4 h-4" />}
                // loading={isLoading}
              >
                立即刷新
              </Button>
              <Button onClick={handleExport} icon={<Download className="w-4 h-4" />}>
                导出数据
              </Button>
            </Space>
          </div>
        </Card>

        {/* 连接列表表格 */}
        <section ref={tableContainerRef} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <header className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">连接详情</h3>
            <p className="text-sm text-gray-600">共 {filteredConnections.length} 条连接记录</p>
          </header>
          <Table
            className="pb-[2px]"
            columns={columns}
            dataSource={filteredConnections}
            pagination={false}
            rowKey="id"
            ref={tableRef}
            scroll={{ y: tableHeight }}
            virtual
            // loading={isLoading}
            locale={{
              emptyText: (
                <div className="text-center py-12 text-gray-500">
                  <Search className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                  <p className="text-lg font-medium">未找到匹配的连接</p>
                  <p>尝试调整搜索条件</p>
                </div>
              ),
            }}
          />
        </section>
      </div>
    </div>
  );
};

export default Connections;
