import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Play, ArrowLeft, Clock, Hash, Cpu, X, Search, Filter, RotateCcw, AlertCircle, BarChart2 } from 'lucide-react';
import { Input, Select, Button, Tree, ConfigProvider, Segmented, Spin, Modal, App, Slider } from 'antd';
import * as echarts from 'echarts';
import { DownOutlined, CaretRightOutlined, CaretDownOutlined, ReloadOutlined } from '@ant-design/icons';
const { Option } = Select;

interface FunctionCallChainViewerProps {
  queryParams: {
    srcip: string;
    dstip: string;
    srcport: number;
    dstport: number;
  } | null;
}

const FunctionCallChainViewer: React.FC<FunctionCallChainViewerProps> = ({ queryParams }) => {
  const [currentChainType, setCurrentChainType] = useState('接收函数链');
  const [chainData, setChainData] = useState({
    接收函数链: null,
    发送函数链: null,
  });
  const [funcTable, setFuncTable] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { message } = App.useApp();
  const isCheckedRef = useRef<boolean>(false);
  const [isClickedAllChains, setIsClickedAllChains] = useState<boolean>(false);

  const [selectedCall, setSelectedCall] = useState(null);
  const [expandedKeys, setExpandedKeys] = useState(['chain-0']);
  const [filterText, setFilterText] = useState('');
  const [callTypeFilter, setCallTypeFilter] = useState('all');
  const [threadFilter, setThreadFilter] = useState('all');

  const [isGraphVisible, setIsGraphVisible] = useState(false);
  // 新增: 用于控制图表显示哪条链 ('all' 或具体的 chainIndex)
  const [graphChainIndex, setGraphChainIndex] = useState<'all' | number>('all');

  // 新增：耗时过滤控制
  const [durationFilter, setDurationFilter] = useState([0, 10000]); // 微秒范围
  const [showDurationFilter, setShowDurationFilter] = useState(false);

  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  let chartInstance: echarts.ECharts | null = null;

  const getGraphOption = (data, targetChainIndex: 'all' | number = 'all') => {
    const rawData = data || chainData;
    if (!rawData) return { series: [] };

    const nodes = new Map<string, any>();
    const links: { source: string; target: string; weight: number }[] = [];
    const functionStats = new Map<string, { callCount: number; totalDuration: number; durations: number[] }>();

    // 基础颜色配置
    const CATEGORY_BASE_COLORS = {
      接收: {
        name: '接收',
        hue: 210, // 蓝色色调
        saturation: 70,
      },
      发送: {
        name: '发送',
        hue: 35, // 橙色色调
        saturation: 85,
      },
    };

    function getFunctionNameFromItem(item: [number, number, number, number]) {
      const [, , addr] = item;
      const funcName = funcTable?.[addr]?.name || `0x${addr.toString(16)}`;
      return funcName.length > 20 ? funcName.substring(0, 17) + '...' : funcName;
    }

    function getFunctionKey(item: [number, number, number, number], category: '接收' | '发送') {
      const [, , addr] = item;
      return `${category}_${addr}`;
    }

    // 处理单个调用链，计算函数耗时和调用关系
    function processChain(chain: number[][][], category: '接收' | '发送') {
      if (!Array.isArray(chain)) return;

      // 如果指定了单条链，则只处理该链
      const chainsToProcess = targetChainIndex === 'all' ? chain : [chain[targetChainIndex]].filter(Boolean);

      for (const singleChain of chainsToProcess) {
        const callStack: Array<{ item: [number, number, number, number]; startTime: number; key: string }> = [];

        for (let i = 0; i < singleChain.length; i++) {
          const item = singleChain[i] as [number, number, number, number];
          const [timestamp, isReturn, addr, threadId] = item;
          const functionKey = getFunctionKey(item, category);

          if (!isReturn) {
            // 函数调用开始
            callStack.push({
              item,
              startTime: timestamp,
              key: functionKey,
            });

            // 更新节点统计信息
            if (!functionStats.has(functionKey)) {
              functionStats.set(functionKey, {
                callCount: 0,
                totalDuration: 0,
                durations: [],
              });
            }
            const stats = functionStats.get(functionKey)!;
            stats.callCount++;

            // 建立调用关系（从上一级调用到当前函数）
            if (callStack.length > 1) {
              const callerKey = callStack[callStack.length - 2].key;
              const linkKey = `${callerKey}->${functionKey}`;

              const existingLink = links.find((link) => link.source === callerKey && link.target === functionKey);

              if (existingLink) {
                existingLink.weight++;
              } else {
                links.push({
                  source: callerKey,
                  target: functionKey,
                  weight: 1,
                });
              }
            }
          } else {
            // 函数返回
            if (callStack.length > 0) {
              const callInfo = callStack.pop();
              if (callInfo && callInfo.key === functionKey) {
                // 计算函数执行时间（转换为微秒）
                const duration = (timestamp - callInfo.startTime) * 1000000; // 转换为微秒
                const stats = functionStats.get(functionKey)!;
                stats.totalDuration += duration;
                stats.durations.push(duration);
              }
            }
          }
        }
      }
    }

    // 处理接收和发送函数链
    processChain(rawData['接收函数链'], '接收');
    processChain(rawData['发送函数链'], '发送');

    // 分别计算接收和发送函数的平均耗时范围
    const receiveStats = Array.from(functionStats.entries())
      .filter(([key]) => key.startsWith('接收'))
      .map(([key, stats]) => ({
        key,
        avgDuration: stats.durations.length > 0 ? stats.totalDuration / stats.durations.length : 0,
      }));

    const sendStats = Array.from(functionStats.entries())
      .filter(([key]) => key.startsWith('发送'))
      .map(([key, stats]) => ({
        key,
        avgDuration: stats.durations.length > 0 ? stats.totalDuration / stats.durations.length : 0,
      }));

    // 计算各自的最大最小值
    const receiveAvgDurations = receiveStats.map((item) => item.avgDuration).filter((d) => d > 0);
    const sendAvgDurations = sendStats.map((item) => item.avgDuration).filter((d) => d > 0);

    const maxReceiveDuration = receiveAvgDurations.length > 0 ? Math.max(...receiveAvgDurations) : 0.001;
    const minReceiveDuration = receiveAvgDurations.length > 0 ? Math.min(...receiveAvgDurations) : 0;

    const maxSendDuration = sendAvgDurations.length > 0 ? Math.max(...sendAvgDurations) : 0.001;
    const minSendDuration = sendAvgDurations.length > 0 ? Math.min(...sendAvgDurations) : 0;

    // 根据平均耗时生成颜色深浅
    function getColorByDuration(avgDuration: number, category: '接收' | '发送') {
      const baseColor = CATEGORY_BASE_COLORS[category];

      // 根据类别选择对应的最大最小值
      const maxDuration = category === '接收' ? maxReceiveDuration : maxSendDuration;
      const minDuration = category === '接收' ? minReceiveDuration : minSendDuration;

      // 计算耗时比例 (0-1)
      const durationRatio = maxDuration > minDuration ? (avgDuration - minDuration) / (maxDuration - minDuration) : 0.5;

      // 根据耗时调整亮度：耗时越长，颜色越深
      // 亮度范围：75% (浅色) 到 35% (深色)
      const lightness = 75 - durationRatio * 40;

      return {
        color: `hsl(${baseColor.hue}, ${baseColor.saturation}%, ${lightness}%)`,
        borderColor: `hsl(${baseColor.hue}, ${baseColor.saturation}%, ${lightness - 15}%)`,
        shadowColor: `hsla(${baseColor.hue}, ${baseColor.saturation}%, ${lightness}%, 0.4)`,
      };
    }

    // 过滤节点：根据耗时范围过滤
    const filteredFunctionStats = new Map();
    functionStats.forEach((stats, functionKey) => {
      const avgDuration = stats.durations.length > 0 ? stats.totalDuration / stats.durations.length : 0;

      // 只显示在耗时范围内的节点
      if (avgDuration >= durationFilter[0] && avgDuration <= durationFilter[1]) {
        filteredFunctionStats.set(functionKey, stats);
      }
    });

    // 创建节点
    filteredFunctionStats.forEach((stats, functionKey) => {
      const [category, addr] = functionKey.split('_');
      const addrNum = parseInt(addr);
      const item = [0, 0, addrNum, 0] as [number, number, number, number];
      const funcName = getFunctionNameFromItem(item);
      const avgDuration = stats.durations.length > 0 ? stats.totalDuration / stats.durations.length : 0;

      // 根据调用次数调整节点大小
      const baseSize = 60;
      const sizeMultiplier = Math.min(Math.log(stats.callCount + 1) * 15, 80);
      const nodeSize = [Math.max(baseSize + sizeMultiplier, funcName.length * 8 + 20), 35 + Math.min(sizeMultiplier / 4, 15)];

      // 根据平均耗时获取颜色
      const colorConfig = getColorByDuration(avgDuration, category as '接收' | '发送');

      nodes.set(functionKey, {
        id: functionKey,
        name: funcName,
        category: category,
        value: [avgDuration, stats.callCount, stats.totalDuration], // 用于visualMap映射的值：[平均耗时, 调用次数, 总耗时]
        avgDuration: avgDuration, // 单独保存平均耗时用于visualMap
        symbol: 'rect',
        symbolSize: nodeSize,
        itemStyle: {
          color: colorConfig.color,
          borderColor: colorConfig.borderColor,
          borderWidth: 2,
          shadowBlur: 8,
          shadowColor: colorConfig.shadowColor,
          shadowOffsetY: 2,
        },
        label: {
          show: true,
          formatter: function (params) {
            const [avgDur, callCount, totalDur] = params.data.value;
            return `${params.data.name}\n[${callCount}次 | ${avgDur.toFixed(1)}μs]`;
          },
          fontSize: 10,
          fontWeight: '500',
          color: '#FFFFFF',
          textBorderColor: 'transparent',
          position: 'inside',
          lineHeight: 14,
        },
        emphasis: {
          focus: 'adjacency',
          itemStyle: {
            shadowBlur: 15,
            shadowColor: colorConfig.shadowColor,
            borderWidth: 3,
            scale: 1.1,
            color: colorConfig.borderColor,
          },
          label: {
            fontSize: 11,
            fontWeight: 'bold',
          },
        },
      });
    });

    // 过滤连接线：只保留在过滤节点中的连接
    const filteredNodeKeys = new Set(filteredFunctionStats.keys());
    const filteredLinks = links.filter((link) => filteredNodeKeys.has(link.source) && filteredNodeKeys.has(link.target));

    // 计算权重范围用于连接线颜色映射
    const maxWeight = Math.max(...filteredLinks.map((link) => link.weight));
    const minWeight = Math.min(...filteredLinks.map((link) => link.weight));

    // 创建连接线
    const processedLinks = filteredLinks.map((link) => {
      // 计算权重比例
      const weightRatio = maxWeight > minWeight ? (link.weight - minWeight) / (maxWeight - minWeight) : 0.5;

      // 根据源节点类型确定基础颜色
      const sourceCategory = link.source.startsWith('接收') ? '接收' : '发送';
      const baseColor = CATEGORY_BASE_COLORS[sourceCategory];

      // 根据权重调整连接线颜色深浅
      const lightness = 65 - weightRatio * 25;
      const lineColor = `hsl(${baseColor.hue}, ${baseColor.saturation}%, ${lightness}%)`;

      return {
        source: link.source,
        target: link.target,
        value: link.weight,
        lineStyle: {
          color: lineColor,
          width: Math.min(1 + Math.log(link.weight + 1) * 1.5, 6),
          opacity: 0.8,
          curveness: 0.2,
        },
        emphasis: {
          lineStyle: {
            width: Math.min(2 + Math.log(link.weight + 1) * 2, 8),
            opacity: 1,
            shadowBlur: 10,
            shadowColor: lineColor,
            color: `hsl(${baseColor.hue}, ${baseColor.saturation}%, ${lightness - 15}%)`,
          },
        },
        label: {
          show: link.weight > 1,
          formatter: `${link.weight}次`,
          fontSize: 8,
          color: '#666',
          backgroundColor: 'rgba(255,255,255,0.9)',
          borderRadius: 2,
          padding: [1, 3],
        },
      };
    });

    // 创建图例数据
    const legendData = Object.keys(CATEGORY_BASE_COLORS).map((category) => ({
      name: category,
      itemStyle: {
        color: `hsl(${CATEGORY_BASE_COLORS[category].hue}, ${CATEGORY_BASE_COLORS[category].saturation}%, 55%)`,
        borderColor: `hsl(${CATEGORY_BASE_COLORS[category].hue}, ${CATEGORY_BASE_COLORS[category].saturation}%, 40%)`,
        borderWidth: 2,
      },
    }));

    // 动态生成标题
    const chartTitle = targetChainIndex === 'all' ? '函数调用链关系图 (聚合)' : `函数调用链 #${targetChainIndex + 1} 关系图`;

    const chartSubtext =
      targetChainIndex === 'all'
        ? `耗时范围 ${durationFilter[0]}-${durationFilter[1]}μs | ${nodes.size}个函数 | ${processedLinks.length}种调用关系`
        : `线程ID: ${rawData[currentChainType]?.[targetChainIndex]?.[0]?.[3]} | ${nodes.size}个函数 | ${processedLinks.length}种调用关系`;

    return {
      backgroundColor: '#f8fafc',
      title: {
        text: chartTitle,
        subtext: chartSubtext,
        left: 'center',
        top: 20,
        textStyle: {
          fontSize: 24,
          fontWeight: 'bold',
          color: '#1a202c',
        },
        subtextStyle: {
          fontSize: 14,
          color: '#718096',
        },
      },
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        borderRadius: 8,
        textStyle: {
          color: '#2d3748',
          fontSize: 12,
        },
        padding: [12, 16],
        formatter: function (params) {
          if (params.dataType === 'node') {
            const [avgDur, callCount, totalDur] = params.data.value;
            const stats = filteredFunctionStats.get(params.data.id);
            const maxDuration = stats.durations.length > 0 ? Math.max(...stats.durations).toFixed(1) : '0';
            const minDuration = stats.durations.length > 0 ? Math.min(...stats.durations).toFixed(1) : '0';

            return `
              <div style="line-height: 1.6;">
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #2b6cb0;">
                  ${params.data.category} 函数: ${params.data.name}
                </div>
                <div><strong>调用次数:</strong> ${callCount}</div>
                <div><strong>总耗时:</strong> ${totalDur.toFixed(1)}μs</div>
                <div><strong>平均耗时:</strong> ${avgDur.toFixed(1)}μs</div>
                <div><strong>最大耗时:</strong> ${maxDuration}μs</div>
                <div><strong>最小耗时:</strong> ${minDuration}μs</div>
                <div style="font-size: 11px; color: #666; margin-top: 4px;">
                  颜色深浅表示平均耗时，越深表示耗时越长
                </div>
              </div>
            `;
          } else if (params.dataType === 'edge') {
            return `
              <div style="line-height: 1.6;">
                <div style="font-weight: bold; font-size: 14px; margin-bottom: 8px; color: #2b6cb0;">
                  调用关系
                </div>
                <div><strong>调用频率:</strong> ${params.data.value}次</div>
                <div><strong>调用方向:</strong> ${params.data.source.split('_')[1]} → ${params.data.target.split('_')[1]}</div>
                <div style="font-size: 11px; color: #666; margin-top: 4px;">
                  颜色深浅表示调用频率，越深表示调用越频繁
                </div>
              </div>
            `;
          }
          return '';
        },
      },
      legend: {
        data: legendData,
        top: 80,
        left: 'center',
        orient: 'horizontal',
        itemGap: 30,
        textStyle: {
          fontSize: 14,
          color: '#4a5568',
        },
        icon: 'rect',
        itemWidth: 20,
        itemHeight: 12,
      },
      toolbox: {
        show: true,
        itemGap: 10,
        feature: {
          saveAsImage: {
            title: '保存为图片',
            pixelRatio: 2,
          },
          myrefresh: {
            show: true,
            title: '刷新',
            icon: 'path://M951.296 153.6H801.792C909.312 240.64 972.8 372.736 972.8 512c0 246.784-194.56 448.512-438.272 459.776-12.288 1.024-22.528-8.192-22.528-20.48 0-10.24 8.192-19.456 19.456-20.48C753.664 921.6 931.84 737.28 931.84 512c0-131.072-60.416-253.952-163.84-332.8V337.92c0 12.288-11.264 22.528-23.552 20.48-10.24-2.048-17.408-11.264-17.408-21.504V133.12c0-11.264 9.216-20.48 20.48-20.48h204.8c12.288 0 22.528 11.264 20.48 23.552-2.048 10.24-11.264 17.408-21.504 17.408zM492.544 51.2C244.736 51.2 51.2 253.952 51.2 512c0 139.264 63.488 271.36 171.008 358.4H73.728c-10.24 0-19.456 7.168-21.504 17.408-2.048 12.288 7.168 23.552 19.456 23.552h204.8c11.264 0 20.48-9.216 20.48-20.48V687.104c0-10.24-7.168-19.456-17.408-21.504-12.288-2.048-23.552 8.192-23.552 20.48v158.72C152.576 765.952 92.16 643.072 92.16 512 92.16 276.48 268.288 92.16 492.544 92.16c11.264 0 20.48-9.216 20.48-20.48s-9.216-20.48-20.48-20.48z',
            type: 'myrefresh',
            onclick: async () => {
              const chart = chartInstanceRef.current;
              if (!chart) return;

              chart.showLoading('default', {
                text: '加载中...',
                color: '#3182ce',
                textColor: '#2d3748',
                maskColor: 'rgba(255,255,255,0.7)',
                zlevel: 0,
              });

              try {
                const updatedData = await fetchChainData({ ...queryParams, count: 20000 });
                chart.hideLoading();
                // 刷新时也保持当前的链选择
                chart.setOption(getGraphOption(updatedData, graphChainIndex), true);
              } catch (err) {
                chart.hideLoading();
                console.error('刷新数据失败', err);
              }
            },
          },
        },
        right: 20,
        top: 20,
      },
      // 为接收函数添加visualMap
      visualMap: [
        {
          type: 'continuous',
          seriesIndex: 0,
          dimension: 0, // 使用value数组的第0个元素（平均耗时）
          min: minReceiveDuration,
          max: maxReceiveDuration,
          text: ['高', '低', '接收函数耗时'],
          textGap: 10,
          left: 'left',
          top: 'middle',
          calculable: true,
          realtime: false,
          inRange: {
            opacity: [0.8, 1], // 透明度范围，用于控制显示/隐藏
            color: ['#2b6cb000', '#2b6cb0'],
          },
          outOfRange: {
            opacity: 0, // 超出范围的完全透明（隐藏）
          },
          controller: {
            inRange: {
              opacity: [0.3, 1],
            },
            outOfRange: {
              opacity: 0,
            },
          },
          textStyle: {
            color: '#2b6cb0',
            fontSize: 12,
          },
          // 只对接收节点生效
          pieces:
            receiveStats.length > 0
              ? undefined
              : [
                  {
                    min: minReceiveDuration,
                    max: maxReceiveDuration,
                    opacity: 1,
                  },
                ],
        },
        {
          type: 'continuous',
          seriesIndex: 1,
          dimension: 0, // 使用value数组的第0个元素（平均耗时）
          min: minSendDuration,
          max: maxSendDuration,
          text: ['高', '低'],
          textGap: 10,
          right: 'right',
          top: 'middle',
          calculable: true,
          realtime: false,
          inRange: {
            opacity: [0.9, 1], // 透明度范围，用于控制显示/隐藏
            color: ['#d69e2e00', '#d69e2e'],
          },
          outOfRange: {
            opacity: 0, // 超出范围的完全透明（隐藏）
          },
          controller: {
            inRange: {
              opacity: [0.3, 1],
            },
            outOfRange: {
              opacity: 0,
            },
          },
          textStyle: {
            color: '#d69e2e',
            fontSize: 12,
          },
          // 只对发送节点生效
          pieces:
            sendStats.length > 0
              ? undefined
              : [
                  {
                    min: minSendDuration,
                    max: maxSendDuration,
                    opacity: 1,
                  },
                ],
        },
      ],
      series: [
        // 接收函数图系列
        {
          name: '接收函数',
          type: 'graph',
          layout: 'force',
          roam: true,
          focusNodeAdjacency: true,
          legendHoverLink: false,
          categories: [legendData[0]], // 只包含接收类别
          force: {
            repulsion: [300, 500],
            gravity: 0.1,
            edgeLength: [120, 300],
            friction: 0.3,
          },
          edgeSymbol: ['', 'arrow'],
          edgeSymbolSize: [0, 12],
          data: Array.from(nodes.values()).filter((node) => node.category === '接收'),
          links: processedLinks.filter((link) => link.source.startsWith('接收') && link.target.startsWith('接收')),
          lineStyle: {
            opacity: 0.8,
            curveness: 0.3,
          },
          emphasis: {
            focus: 'series',
            blurScope: 'coordinateSystem',
          },
          scaleLimit: {
            min: 0.4,
            max: 3,
          },
        },
        // 发送函数图系列
        {
          name: '发送函数',
          type: 'graph',
          layout: 'force',
          roam: true,
          focusNodeAdjacency: true,
          legendHoverLink: false,
          categories: [legendData[1]], // 只包含发送类别
          force: {
            repulsion: [300, 500],
            gravity: 0.1,
            edgeLength: [120, 300],
            friction: 0.3,
          },
          edgeSymbol: ['', 'arrow'],
          edgeSymbolSize: [0, 12],
          data: Array.from(nodes.values()).filter((node) => node.category === '发送'),
          links: processedLinks.filter((link) => link.source.startsWith('发送') && link.target.startsWith('发送')),
          lineStyle: {
            opacity: 0.8,
            curveness: 0.3,
          },
          emphasis: {
            focus: 'series',
            blurScope: 'coordinateSystem',
          },
          scaleLimit: {
            min: 0.4,
            max: 3,
          },
        },
        // 混合连接线系列（接收和发送之间的连接）
        {
          name: '混合连接',
          type: 'graph',
          layout: 'force',
          roam: true,
          focusNodeAdjacency: true,
          legendHoverLink: false,
          force: {
            repulsion: [300, 500],
            gravity: 0.1,
            edgeLength: [120, 300],
            friction: 0.3,
          },
          edgeSymbol: ['', 'arrow'],
          edgeSymbolSize: [0, 12],
          data: [], // 不包含节点数据，只用于连接线
          links: processedLinks.filter(
            (link) =>
              (link.source.startsWith('接收') && link.target.startsWith('发送')) ||
              (link.source.startsWith('发送') && link.target.startsWith('接收')),
          ),
          lineStyle: {
            opacity: 0.8,
            curveness: 0.3,
          },
          emphasis: {
            focus: 'series',
            blurScope: 'coordinateSystem',
          },
          scaleLimit: {
            min: 0.4,
            max: 3,
          },
        },
      ],
      dataZoom: [
        {
          type: 'inside',
          disabled: false,
          zoomOnMouseWheel: 'ctrl',
        },
      ],
    };
  };
  // 计算所有函数的平均耗时范围，用于初始化滑块
  const durationRange = useMemo(() => {
    if (!chainData || (!chainData['接收函数链'] && !chainData['发送函数链'])) {
      return [0, 10000];
    }

    const functionStats = new Map();

    const processChain = (chain: number[][][]) => {
      if (!Array.isArray(chain)) return;

      for (const singleChain of chain) {
        const callStack = [];

        for (let i = 0; i < singleChain.length; i++) {
          const item = singleChain[i] as [number, number, number, number];
          const [timestamp, isReturn, addr, threadId] = item;
          const functionKey = `${addr}`;

          if (!isReturn) {
            callStack.push({
              addr,
              startTime: timestamp,
            });

            if (!functionStats.has(functionKey)) {
              functionStats.set(functionKey, {
                durations: [],
                totalDuration: 0,
              });
            }
          } else {
            if (callStack.length > 0) {
              const callInfo = callStack.pop();
              if (callInfo && callInfo.addr === addr) {
                const duration = (timestamp - callInfo.startTime) * 1000000; // 转换为微秒
                const stats = functionStats.get(functionKey);
                if (stats) {
                  stats.durations.push(duration);
                  stats.totalDuration += duration;
                }
              }
            }
          }
        }
      }
    };

    processChain(chainData['接收函数链']);
    processChain(chainData['发送函数链']);

    const avgDurations = Array.from(functionStats.values())
      .map((stats) => (stats.durations.length > 0 ? stats.totalDuration / stats.durations.length : 0))
      .filter((duration) => duration > 0);

    if (avgDurations.length === 0) return [0, 10000];

    const min = Math.min(...avgDurations);
    const max = Math.max(...avgDurations);

    return [Math.floor(min), Math.ceil(max)];
  }, [chainData]);

  // 当数据变化时更新滑块范围
  useEffect(() => {
    if (durationRange[0] !== durationRange[1]) {
      setDurationFilter(durationRange);
    }
  }, [durationRange]);

  // 获取函数映射表
  const fetchFuncTable = async () => {
    try {
      const res = await fetch('http://127.0.0.1:19999/GetFuncTable', {
        method: 'GET',
      });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();
      setFuncTable(data);
    } catch (err) {
      console.error('获取函数映射表失败:', err);
      message.error('获取函数映射表失败');
    }
  };

  // 获取函数调用链数据
  const fetchChainData = async (params) => {
    if (!params.srcip) {
      message.warning('请先提供查询参数');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const endpoint = 'http://127.0.0.1:19999/GetRecentMap';

      const formData = new URLSearchParams();
      formData.append('srcip', params.srcip);
      formData.append('dstip', params.dstip);
      formData.append('srcport', params.srcport);
      formData.append('dstport', params.dstport);
      formData.append('count', params.count ?? 1);

      const res = await fetch(endpoint, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

      const data = await res.json();

      setChainData((prev) => ({
        ...prev,
        接收函数链: data[0],
        发送函数链: data[1],
      }));
      if (params.count) {
        isCheckedRef.current = true;
      }
      setIsClickedAllChains(false);
      setSelectedCall(null);
      setExpandedKeys(['chain-0']);
      return { 接收函数链: data[0], 发送函数链: data[1] }; // ✅ 返回
    } catch (err) {
      console.error('获取调用链数据失败:', err);
      setError(`获取${currentChainType}数据失败: ${err.message}`);
      message.error(`获取${currentChainType}数据失败`);
    } finally {
      setLoading(false);
    }
  };

  // 处理链类型切换
  const handleChainTypeChange = (value) => {
    setCurrentChainType(value);
  };

  // 初始化加载
  useEffect(() => {
    if (queryParams) {
      isCheckedRef.current = false;
      setIsClickedAllChains(false);
      fetchFuncTable();
      fetchChainData(queryParams);
    }
  }, [queryParams]);

  const resetFilters = () => {
    setFilterText('');
    setCallTypeFilter('all');
    setThreadFilter('all');
    setDurationFilter(durationRange);
    setShowDurationFilter(false);
  };
  // 打开图表模态框的函数
  const openGraphModal = (index: 'all' | number) => {
    setGraphChainIndex(index);
    setIsGraphVisible(true);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp * 1000);
    return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}.${String(date.getMilliseconds()).padStart(3, '0')}`;
  };

  const getFunctionName = (id) => funcTable[id]?.name || `Unknown_${id}`;
  const getCallType = (isReturn) => (isReturn ? 'RETURN' : 'CALL');

  // 当前显示的数据
  const currentData = chainData[currentChainType];

  const processedData = useMemo(() => {
    if (!currentData) return [];
    if (currentData && !currentData.length) return [];

    return currentData.map((chain, chainIndex) => {
      let depth = 0;
      return chain.map((call, callIndex) => {
        const [timestamp, isReturn, funcId, threadId] = call;
        if (isReturn) depth = Math.max(0, depth - 1);
        const currentDepth = depth;
        if (!isReturn) depth++;
        return {
          timestamp,
          isReturn,
          funcId,
          threadId,
          funcName: getFunctionName(funcId),
          callType: getCallType(isReturn),
          depth: currentDepth,
          callIndex,
          chainIndex,
        };
      });
    });
  }, [currentData, funcTable]);

  const filteredData = useMemo(() => {
    console.log(JSON.stringify(processedData), 'processedData');
    return processedData
      .map((chain, chainIndex) => {
        const filteredCalls = chain.filter((call) => {
          // 函数名过滤
          if (
            filterText &&
            !call.funcName.toLowerCase().includes(filterText.toLowerCase()) &&
            !call.funcId.toString().includes(filterText)
          ) {
            return false;
          }
          // 调用类型过滤
          if (callTypeFilter !== 'all' && call.callType.toLowerCase() !== callTypeFilter) {
            return false;
          }
          // 线程过滤
          if (threadFilter !== 'all' && call.threadId.toString() !== threadFilter) {
            return false;
          }
          return true;
        });
        return { chainIndex, calls: filteredCalls, originalLength: chain.length };
      })
      .filter((chain) => chain.calls.length > 0);
  }, [processedData, filterText, callTypeFilter, threadFilter]);

  const allThreadIds = useMemo(() => {
    const threads = new Set();
    processedData.forEach((chain) => {
      chain.forEach((call) => threads.add(call.threadId));
    });
    return Array.from(threads).sort();
  }, [processedData]);

  // 构建Tree数据结构
  const treeData = useMemo(() => {
    return filteredData.map(({ chainIndex, calls, originalLength }) => {
      const stack = [];
      const treeNodes = [];
      let nodeId = 0;

      calls.forEach((call, index) => {
        const currentNodeId = `${chainIndex}-${nodeId++}`;

        const nodeData = {
          key: currentNodeId,
          title: (
            <div
              onClick={() => setSelectedCall({ chainIndex: call.chainIndex, callIndex: call.callIndex })}
              className={`flex items-center gap-3 py-0 px-2 rounded cursor-pointer transition-colors w-full ${
                selectedCall?.chainIndex === call.chainIndex && selectedCall?.callIndex === call.callIndex
                  ? 'bg-blue-100 border-l-2 border-blue-500'
                  : 'hover:bg-gray-100 border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-center gap-3">
                {call.isReturn ? <ArrowLeft size={16} className="text-red-500" /> : <Play size={16} className="text-green-500" />}
                <span className={`text-xs font-medium ${call.isReturn ? 'text-red-600' : 'text-green-600'}`}>{call.callType}</span>
                <code className="text-blue-700 bg-blue-50 px-2 py-1 rounded text-sm font-medium">{call.funcName}</code>
              </div>
              <div className="ml-auto flex items-center gap-6 text-xs text-slate-500">
                <span className="flex items-center gap-1">
                  <Clock size={12} />
                  {formatTime(call.timestamp)}
                </span>
                <span className="flex items-center gap-1">
                  <Hash size={12} />
                  {call.funcId}
                </span>
              </div>
            </div>
          ),
          children: [],
          callData: call,
        };

        if (!call.isReturn) {
          // 函数调用 - 推入栈并添加到当前层级
          if (stack.length === 0) {
            treeNodes.push(nodeData);
          } else {
            stack[stack.length - 1].children.push(nodeData);
          }
          stack.push(nodeData);
        } else {
          // 函数返回 - 添加到当前函数下并弹出栈
          if (stack.length > 0) {
            stack[stack.length - 1].children.push(nodeData);
            stack.pop();
          } else {
            // 栈为空时，直接添加到根级别
            treeNodes.push(nodeData);
          }
        }
      });

      return {
        key: `chain-${chainIndex}`,
        title: (
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-blue-700 font-semibold mr-4">
              <span className="text-sm">调用链 #{chainIndex + 1}</span>
              <span className="text-amber-700 text-xs font-normal">(Thread {calls[0]?.threadId})</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs text-slate-500 bg-blue-50 px-2 py-0.5 rounded">
                {calls.length} / {originalLength} 次调用
              </div>
              <Button
                className="text-xs"
                size="small"
                type="text"
                icon={<BarChart2 size={14} />}
                onClick={(e) => {
                  e.stopPropagation(); // 防止触发展开/折叠
                  openGraphModal(chainIndex);
                }}
                title={`查看调用链 #${chainIndex + 1} 的图表`}
              >
                查看图表
              </Button>
            </div>
          </div>
        ),
        children: treeNodes,
        selectable: false,
      };
    });
  }, [filteredData, selectedCall]);

  const onSelect = (selectedKeys, info) => {
    if (info.node.callData) {
      const call = info.node.callData;
      setSelectedCall({ chainIndex: call.chainIndex, callIndex: call.callIndex });
    }
  };

  const onExpand = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
  };

  // 错误状态显示
  if (error) {
    return (
      <div className="h-full w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-semibold text-slate-700 mb-2">加载失败</div>
          <div className="text-sm text-slate-500 mb-4">{error}</div>
          <Button onClick={() => fetchChainData(currentChainType)}>重试</Button>
        </div>
      </div>
    );
  }

  // 没有查询参数时的提示
  if (!queryParams) {
    return (
      <div className="h-full w-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Cpu className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <div className="text-lg font-semibold text-slate-500 mb-2">函数调用链分析器</div>
          <div className="text-sm text-slate-400">请从数据表中选择 sockect 连接开始分析</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-gray-50 text-slate-800 flex flex-col font-mono text-sm min-w-[800px]">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center gap-3">
        <Cpu className=" text-blue-600" size={20} />
        <span className="font-semibold text-base text-slate-900">函数调用链分析器</span>
        <Segmented size="small" options={['接收函数链', '发送函数链']} value={currentChainType} onChange={handleChainTypeChange} />
        {currentData && processedData && (
          <div className="text-xs text-slate-500 ml-2 flex items-center">
            {currentData.length} 个调用链 | {currentData.reduce((acc, chain) => acc + chain.length, 0)} 个函数调用
            {/* |{' '}{processedData.reduce((acc, chain) => acc + chain.filter((call) => !call.isReturn).length, 0)} 个调用 |{' '}
            {processedData.reduce((acc, chain) => acc + chain.filter((call) => call.isReturn).length, 0)} 个返回  */}
            <Button
              disabled={isClickedAllChains}
              size="small"
              className="ml-2"
              onClick={() => {
                setIsClickedAllChains(true);
                fetchChainData({ ...queryParams, count: 20000 });
              }}
            >
              {/* <PackageSearch size={14} className="mr-1" /> */}
              查看所有链
            </Button>
          </div>
        )}
        {/* {loading && <Spin size="small" />} */}
      </div>

      {/* 过滤工具栏 */}
      <div className="bg-white w-full border-b border-gray-200 px-4 py-2">
        <div className="flex items-center gap-3 flex-wrap scale-90 origin-left">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-xs font-medium text-slate-700">过滤:</span>
          </div>

          {/* 搜索框 */}
          <div className="relative">
            <Input
              placeholder="搜索函数名或ID..."
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
              prefix={<Search className="w-3.5 h-3.5 text-slate-400" />}
              size="small"
              style={{ width: 160, fontSize: '12px' }}
            />
          </div>

          {/* 调用类型过滤 */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-600">类型:</label>
            <Select value={callTypeFilter} onChange={setCallTypeFilter} size="small" style={{ width: 70, fontSize: '12px' }}>
              <Option value="all">全部</Option>
              <Option value="call">调用</Option>
              <Option value="return">返回</Option>
            </Select>
          </div>

          {/* 线程过滤 */}
          <div className="flex items-center gap-1.5">
            <label className="text-xs text-slate-600">线程:</label>
            <Select value={threadFilter} onChange={setThreadFilter} size="small" style={{ width: 80, fontSize: '12px' }}>
              <Option value="all">全部</Option>
              {allThreadIds.map((threadId) => (
                <Option key={threadId} value={threadId.toString()}>
                  {threadId}
                </Option>
              ))}
            </Select>
          </div>

          {/* 重置按钮 */}
          <Button onClick={resetFilters} size="small" icon={<RotateCcw className="w-3 h-3" />} className="flex items-center gap-1 text-xs">
            重置
          </Button>
          <Button size="small" onClick={() => openGraphModal('all')}>
            查看聚合图
          </Button>
          {/* 过滤结果统计 */}
          {(filterText || callTypeFilter !== 'all' || threadFilter !== 'all') && (
            <div className="text-xs text-slate-500 bg-blue-50 px-1.5 py-0.5 rounded ml-auto">
              显示 {filteredData.reduce((acc, chain) => acc + chain.calls.length, 0)} /{' '}
              {currentData.reduce((acc, chain) => acc + chain.length, 0)} 个调用
            </div>
          )}
        </div>
      </div>

      {/* 主内容区域 */}
      <div className="flex h-full overflow-hidden min-w-0">
        <div className={`flex-1 flex flex-col min-w-[500px] ${selectedCall ? 'w-3/4' : 'w-full'}`}>
          {/* 调用链列表 */}
          <div className="flex-1 overflow-auto px-4 py-4 min-w-0">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <Spin />
                <span className="ml-2 text-slate-500">加载{currentChainType}数据中...</span>
              </div>
            ) : !currentData || currentData.length === 0 ? (
              <div className="flex items-center justify-center h-full text-slate-500">暂无{currentChainType}数据</div>
            ) : (
              <div className="min-w-[600px]">
                <ConfigProvider
                  theme={{
                    components: {
                      Tree: {
                        nodeHoverBg: 'transparent',
                        nodeSelectedBg: 'transparent',
                      },
                    },
                  }}
                >
                  <Tree
                    treeData={treeData}
                    expandedKeys={expandedKeys}
                    onExpand={onExpand}
                    onSelect={onSelect}
                    showLine={{ showLeafIcon: false }}
                    className="bg-white border border-gray-200 rounded-md p-4"
                  />
                </ConfigProvider>
              </div>
            )}
          </div>
        </div>

        {/* 右侧函数详情面板 */}
        {selectedCall &&
          processedData.length > 0 &&
          (() => {
            const call = processedData[selectedCall.chainIndex][selectedCall.callIndex];
            const funcInfo = funcTable[call.funcId];
            return (
              <div className="w-1/4 min-w-[280px] bg-white border-l border-gray-200 flex flex-col">
                {/* 详情面板标题 */}
                <div className="px-2 py-1 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">函数详情</div>
                  <Button type="text" size="small" icon={<X className="w-4 h-4 text-slate-500" />} onClick={() => setSelectedCall(null)} />
                </div>

                {/* 详情内容 */}
                <div className="flex-1 p-4 overflow-auto">
                  <div className="space-y-4">
                    {/* 基本信息 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                        <div className="w-1 h-4 bg-gradient-to-b from-blue-500 to-blue-600 rounded-full"></div>
                        <div className="text-sm font-bold text-slate-800 uppercase tracking-wide">基本信息</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">函数名</div>
                          <code className="text-blue-700 bg-blue-50 px-2 py-1 rounded text-sm font-medium block break-all">
                            {call.funcName}
                          </code>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">调用类型</div>
                          <span
                            className={`text-sm font-medium px-2 py-1 rounded ${call.isReturn ? 'text-red-600 bg-red-50' : 'text-green-600 bg-green-50'}`}
                          >
                            {call.callType}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 执行信息 */}
                    <div>
                      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                        <div className="w-1 h-4 bg-gradient-to-b from-green-500 to-green-600 rounded-full"></div>
                        <div className="text-sm font-bold text-slate-800 uppercase tracking-wide">执行信息</div>
                      </div>
                      <div className="space-y-3">
                        <div>
                          <div className="text-xs text-slate-500 mb-1">时间戳</div>
                          <div className="text-sm text-slate-700 font-mono break-all">{formatTime(call.timestamp)}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">函数 ID</div>
                          <div className="text-sm text-slate-700 font-mono">{call.funcId}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">线程 ID</div>
                          <div className="text-sm text-slate-700 font-mono">{call.threadId}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500 mb-1">调用深度</div>
                          <div className="text-sm text-slate-700">{call.depth}</div>
                        </div>
                      </div>
                    </div>

                    {/* 元数据 */}
                    {funcInfo && (
                      <div>
                        <div className="flex items-center gap-2 mb-3 pb-2 border-b border-gray-100">
                          <div className="w-1 h-4 bg-gradient-to-b from-purple-500 to-purple-600 rounded-full"></div>
                          <div className="text-sm font-bold text-slate-800 uppercase tracking-wide">元数据</div>
                        </div>
                        <div className="bg-gray-50 rounded p-3 space-y-2">
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500">Kind:</span>
                            <span className="text-xs text-slate-700 font-mono">{funcInfo.kind}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500">Type ID:</span>
                            <span className="text-xs text-slate-700 font-mono">{funcInfo.type_id}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-xs text-slate-500">Linkage:</span>
                            <span className="text-xs text-slate-700 font-mono">{funcInfo.linkage}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}
      </div>
      <Modal
        title={graphChainIndex === 'all' ? '函数调用链关系图 (聚合)' : `函数调用链 #${graphChainIndex + 1} 关系图`}
        open={isGraphVisible}
        onCancel={() => setIsGraphVisible(false)}
        footer={null}
        width="95vw"
        style={{
          top: 50,
          padding: 0,
        }}
        destroyOnHidden
        afterOpenChange={(open) => {
          if (open && chartRef.current) {
            // 延迟初始化以确保容器尺寸正确
            setTimeout(() => {
              if (chartInstanceRef.current) {
                chartInstanceRef.current.dispose();
              }
              chartInstanceRef.current = echarts.init(chartRef.current);
              // 关键改动：传入当前选择的链索引
              chartInstanceRef.current.setOption(getGraphOption(chainData, graphChainIndex));

              // 自适应容器大小
              const resizeChart = () => {
                if (chartInstanceRef.current) {
                  chartInstanceRef.current.resize();
                }
              };

              window.addEventListener('resize', resizeChart);

              // 清理函数
              return () => {
                window.removeEventListener('resize', resizeChart);
                if (chartInstanceRef.current) {
                  chartInstanceRef.current.dispose();
                  chartInstanceRef.current = null;
                }
              };
            }, 100);
          }
        }}
      >
        <div
          ref={chartRef}
          style={{
            width: '100%',
            height: '85vh',
            minHeight: '600px',
          }}
        />
      </Modal>
    </div>
  );
};

export default FunctionCallChainViewer;
