import React, { useState, useEffect, useRef } from 'react';
import { Input, Button, Alert, Flex, Checkbox } from 'antd';
import { useSearchParams } from 'react-router';
import * as echarts from 'echarts';
import { SendOutlined, StopOutlined, PlusOutlined, MinusOutlined } from '@ant-design/icons';
import worldGeoJson from '@/assets/worldGeo.json';
import { useIntl } from 'react-intl';
import RiskAnalysisPanel from './RiskAnalysisPanel';
import TraceResultsPanel from './TraceResultsPanel';
import HistoryPanel from './HistoryPanel';

const OFFSET_CENTER = 136;
const DEFAULT_CENTER = [18 - OFFSET_CENTER, 0];
// 工具函数
function getMapViewOptions(coords) {
  const defaultCenter = DEFAULT_CENTER;
  const defaultZoom = 1.2;

  if (!coords || coords.length === 0) {
    return { center: defaultCenter, zoom: defaultZoom };
  }

  let minLon = Infinity,
    maxLon = -Infinity;
  let minLat = Infinity,
    maxLat = -Infinity;

  for (const [lon, lat] of coords) {
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  const spanLon = maxLon - minLon;
  const spanLat = maxLat - minLat;
  const center = [(minLon + maxLon) / 2 - OFFSET_CENTER, (minLat + maxLat) / 2];

  const maxSpan = Math.max(spanLon, spanLat);
  let zoom = defaultZoom;
  if (maxSpan > 100) zoom = 0.8;
  else if (maxSpan > 60) zoom = 1.1;
  else if (maxSpan > 30) zoom = 1.4;
  else if (maxSpan > 15) zoom = 1.8;
  else zoom = 2.4;

  return { center, zoom };
}

function fetchTraceWithCancel(target, useCache = false, onHop) {
  let shouldStop = false;
  let reader = null;

  const promise = (async () => {
    if (!target) return [];

    const url = `http://127.0.0.1:8000/api/trace?target=${target}&cache=${useCache}`;
    const response = await fetch(url);
    const isStream = response.headers.get('Transfer-Encoding') === 'chunked';
    const results = [];

    if (!isStream) {
      const data = await response.json();
      if (onHop) {
        for (const hop of data) {
          onHop(hop);
        }
      }
      return data;
    }

    reader = response.body?.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    if (!reader) return results;

    while (true) {
      if (shouldStop) {
        await reader.cancel('User aborted stream');
        break;
      }

      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');

      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        try {
          const hop = JSON.parse(line);
          results.push(hop);
          if (onHop) onHop(hop);
        } catch (e) {
          console.warn('Failed to parse line:', line);
        }
      }

      buffer = lines[lines.length - 1];
    }

    return results;
  })();

  const cancel = () => {
    shouldStop = true;
    if (reader) {
      reader.cancel('Manually cancelled');
    }
  };

  return { promise, cancel };
}

function extractMapData(data) {
  const hopsWithGeo = data
    .map((hop) => {
      if (
        hop.geo &&
        hop.geo !== 'Unknown' &&
        typeof hop.geo === 'object' &&
        typeof hop.geo.lat === 'number' &&
        typeof hop.geo.lon === 'number'
      ) {
        return hop;
      }
      return null;
    })
    .filter((hop) => hop !== null);

  const polylineCoords = [];
  const coordSet = new Set();

  for (const hop of hopsWithGeo) {
    polylineCoords.push([hop.geo.lon, hop.geo.lat]);
    coordSet.add(`${hop.geo.lon},${hop.geo.lat},${hop.location}`);
  }

  const countries = Array.from(coordSet).map((coordStr) => {
    const [lonStr, latStr] = coordStr.split(',');
    return [parseFloat(lonStr), parseFloat(latStr)];
  });

  const countriesData = Array.from(coordSet).map((coordStr, index) => {
    const [lonStr, latStr, location] = coordStr.split(',');
    const lon = parseFloat(lonStr);
    const lat = parseFloat(latStr);
    let rippleEffectNumber = 0;
    let labelPosition = 'top';

    let color = '#13256b';
    if (index === 0) {
      color = '#91CC75';
      rippleEffectNumber = 2;
      labelPosition = 'bottom';
    } else if (index === coordSet.size - 1) {
      color = '#EE6666';
      rippleEffectNumber = 2;
      labelPosition = 'bottom';
    }

    return {
      value: [lon, lat, location],
      label: {
        show: true,
        position: labelPosition,
        formatter: () => (location === 'None' ? '' : location),
      },
      itemStyle: {
        color,
        borderWidth: 1,
        borderColor: '#fff',
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowOffsetX: 1,
        shadowOffsetY: 1,
        shadowBlur: 2,
      },
      rippleEffect: {
        number: rippleEffectNumber,
        color,
        scale: 4,
        brushType: 'stroke',
      },
    };
  });

  return { polylineCoords, countries, countriesData };
}

async function fetchRiskAnalysis(target, useCache = true) {
  const url = `http://127.0.0.1:8000/api/analyze?target=${target}&cache=${useCache}`;
  const response = (await fetch(url)).json();

  // const mockRiskData = {
  //   anomalies: [
  //     { type: 'PathDeviation', detail: '跳点 4 出现新IP 203.0.113.1' },
  //     { type: 'HighLatency', detail: '跳点 2 (101.40.0.1) 延迟过高 227.567ms' },
  //   ],
  //   alerts: ['跳点 203.0.113.1 被列为恶意IP: listed on Spamhaus DROP', '跳点 2 (101.40.0.1) 延迟过高 227.567ms'],
  //   riskScore: 70,
  // };
  // await new Promise((resolve) => setTimeout(resolve, 1000));
  return response;
}

const Locator = () => {
  const [destinationAddress, setDestinationAddress] = useState('');
  const [traceResults, setTraceResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [useCache, setUseCache] = useState(true);
  const [riskData, setRiskData] = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [historyData, setHistoryData] = useState({});
  const [isDdisabledzoomInBtn, setIsDdisabledzoomInBtn] = useState(false);
  const [isDdisabledzoomOutBtn, setIsDdisabledzoomOutBtn] = useState(true);

  const cancelRef = useRef(null);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);

  const intl = useIntl();

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('target')) {
      setDestinationAddress(searchParams.get('target'));
      handleTraceRoute(searchParams.get('target'));
    }
  }, [searchParams]);
  console.log(searchParams.get('target'));
  // 获取历史记录
  const fetchHistoryData = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/history');
      const data = await response.json();
      setHistoryData(data);
    } catch (error) {
      console.error('Failed to fetch history data:', error);
    }
  };

  // 处理历史记录项点击
  const handleHistoryItemClick = async (target) => {
    setDestinationAddress(target);
    if (!loading) {
      await handleTraceRoute(target);
    }
  };

  // 执行路由追踪
  const handleTraceRoute = async (targetOverride = null) => {
    const target = targetOverride || destinationAddress;

    if (loading) {
      if (cancelRef.current) {
        cancelRef.current();
        cancelRef.current = null;
      }
      setLoading(false);
      return;
    }

    const { promise, cancel } = fetchTraceWithCancel(target, useCache, (hop) => {
      setTraceResults((prev) => [...prev, hop]);
    });

    setTraceResults([]);
    setRiskData(null);
    setLoading(true);
    cancelRef.current = cancel;

    try {
      const results = await promise;

      if (results.length > 0) {
        setRiskLoading(true);
        try {
          const riskAnalysis = await fetchRiskAnalysis(target, true);
          setRiskData(riskAnalysis);
        } catch (error) {
          console.error('Risk analysis failed:', error);
        } finally {
          setRiskLoading(false);
        }
      }

      fetchHistoryData();
    } catch (error) {
      console.error('Trace route failed:', error);
    } finally {
      setLoading(false);
      cancelRef.current = null;
    }
  };

  // 地图缩放控制
  const setZoomBtns = (type = 'init') => {
    if (!mapRef.current) return;

    const option = mapRef.current?.getOption();
    const geo = option.geo[0];
    const scaleLimit = geo.scaleLimit;
    let zoom = geo.zoom;
    let center = geo.center;

    switch (type) {
      case 'in':
        zoom = Math.min(scaleLimit.max, geo.zoom + 0.5);
        break;
      case 'out':
        zoom = Math.max(scaleLimit.min, geo.zoom - 0.5);
        break;
      case 'restore':
        const { center: defaultCenter, zoom: defaultZoom } = getMapViewOptions(extractMapData(traceResults).countries);
        zoom = defaultZoom;
        center = defaultCenter;
        break;
    }

    setIsDdisabledzoomInBtn(zoom === scaleLimit.max);
    setIsDdisabledzoomOutBtn(zoom === scaleLimit.min);

    if (type !== 'init') {
      mapRef.current?.setOption({
        geo: { id: 'world', zoom, center },
      });
    }
  };

  // 初始化地图
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const { polylineCoords, countries, countriesData } = extractMapData(traceResults);

    if (!mapRef.current) {
      echarts.registerMap('world', worldGeoJson);
      mapRef.current = echarts.init(mapContainerRef.current);
    }

    let currentCenter = DEFAULT_CENTER;
    let currentZoom = 1.2;

    if (countries.length > 0) {
      const { center, zoom } = getMapViewOptions(countries);
      currentCenter = center;
      currentZoom = zoom;
    } else if (mapRef.current) {
      const option = mapRef.current.getOption();
      if (option && option.geo && option.geo[0]) {
        currentCenter = option.geo[0].center || currentCenter;
        currentZoom = option.geo[0].zoom || currentZoom;
      }
    }

    const mapOption = {
      geo: {
        id: 'world',
        top: '20%',
        type: 'map',
        map: 'world',
        roam: 'move',
        center: currentCenter,
        scaleLimit: { min: 0.5, max: 4 },
        zoom: currentZoom,
        label: { show: false },
        itemStyle: {
          normal: {
            borderColor: '#d6e4ff',
            borderWidth: 0.3,
            areaColor: {
              type: 'linear-gradient',
              x: 0,
              y: 1200,
              x2: 1000,
              y2: 0,
              colorStops: [
                { offset: 0.3, color: '#6b8bf4' },
                { offset: 1, color: '#85a5ff' },
              ],
              global: true,
            },
          },
        },
        emphasis: {
          disabled: true,
          itemStyle: {
            areaColor: 'rgba(35 ,152, 244, .6)',
            borderWidth: 1,
          },
        },
      },
      series: [
        {
          type: 'lines',
          coordinateSystem: 'geo',
          polyline: true,
          data: polylineCoords.length > 1 ? [{ coords: polylineCoords }] : [],
          lineStyle: {
            width: 2,
            color: '#FF9800',
            opacity: 0.8,
            curveness: 0.2,
          },
          effect: {
            show: polylineCoords.length > 1,
            period: 4,
            trailLength: 0,
            color: '#ff6b6b',
            symbolSize: 12,
            symbol: 'arrow',
          },
          z: 3,
        },
        {
          type: 'effectScatter',
          coordinateSystem: 'geo',
          symbolSize: 8,
          labelLayout: { moveOverlap: 'shiftY' },
          data: countriesData,
          z: 2,
        },
      ],
    };

    mapRef.current.setOption(mapOption, { notMerge: false });

    const handleResize = () => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [traceResults]);

  useEffect(() => {
    fetchHistoryData();
  }, []);
  return (
    <Flex vertical gap={0} className="w-full min-h-full pt-6 px-10 pb-40 bg-gradient-to-br from-slate-50 to-blue-50 ">
      <Alert className="mb-5" description={<p>{intl.formatMessage({ id: 'Locator.howto' })}</p>} type="info" showIcon />

      <Flex gap={30} className="mb-2.5">
        <div className="flex-1">
          <h2 className="text-lg font-medium mb-2">{intl.formatMessage({ id: 'Locator.destination' })}</h2>
          <Input
            placeholder={intl.formatMessage({ id: 'Locator.destinationPlaceholder' })}
            value={destinationAddress}
            onChange={(e) => setDestinationAddress(e.target.value)}
            className="w-full"
          />
        </div>
        <Flex gap={20} align="end">
          <Button
            type={loading ? 'default' : 'primary'}
            danger={loading}
            icon={loading ? <StopOutlined /> : <SendOutlined />}
            onClick={() => handleTraceRoute()}
          >
            {intl.formatMessage({ id: loading ? 'Locator.cancelBtn' : 'Locator.startBtn' })}
          </Button>
          <Checkbox checked={useCache} onChange={(e) => setUseCache(e.target.checked)} disabled={loading}>
            {intl.formatMessage({ id: 'Locator.useCache' })}
          </Checkbox>
        </Flex>
      </Flex>

      {/* Map and Overlay Container */}
      <div className="w-full h-[500px] relative">
        {/* ECharts Map will render here */}
        <div className="w-full h-full" ref={mapContainerRef}></div>

        {/* Zoom buttons - 保持原有的缩放按钮 */}
        <div className="absolute top-1/2 right-0.5 flex flex-col z-10 overflow-hidden rounded-md backdrop-blur-md opacity-50 transition-opacity duration-300 hover:opacity-100">
          <Button
            className="text-[12px] rounded-none border-none bg-[rgba(57,135,230,0.4)] hover:bg-[rgba(57,135,230,0.8)] p-0 mb-[1px] text-blue-50"
            size="small"
            onClick={() => setZoomBtns('in')}
            type="text"
            disabled={isDdisabledzoomInBtn}
            icon={<PlusOutlined />}
          />
          <Button
            className="text-[10px] rounded-none border-none bg-[rgba(57,135,230,0.4)] hover:bg-[rgba(57,135,230,0.8)] p-0 mb-[1px] [&>span]:scale-80 text-blue-50"
            size="small"
            onClick={() => setZoomBtns('restore')}
            type="text"
          >
            1 : 1
          </Button>
          <Button
            className="text-[12px] rounded-none border-none bg-[rgba(57,135,230,0.4)] hover:bg-[rgba(57,135,230,0.8)] text-blue-50"
            size="small"
            disabled={isDdisabledzoomOutBtn}
            onClick={() => setZoomBtns('out')}
            type="text"
            icon={<MinusOutlined />}
          />
        </div>
      </div>

      {/* Risk Analysis Panel (remains below the map) */}
      <RiskAnalysisPanel riskData={riskData} loading={riskLoading} />

      {/* History Panel (remains at the bottom) */}
      <HistoryPanel
        historyData={historyData}
        onHistoryItemClick={handleHistoryItemClick}
        onRefresh={fetchHistoryData}
        loading={loading}
        intl={intl}
      />

      {/* MODIFICATION: 现在 TraceResultsPanel 自带拖拽功能，直接使用 */}
      <TraceResultsPanel traceResults={traceResults} loading={loading} />
    </Flex>
  );
};

export default Locator;
