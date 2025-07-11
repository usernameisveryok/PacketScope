import React from 'react';
import { Alert, Typography, Progress, Badge } from 'antd';
import {
  SyncOutlined,
  SecurityScanOutlined,
  WarningOutlined,
  ExclamationCircleOutlined,
  CheckCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

// 风险评分颜色
const getRiskColor = (score) => {
  if (score >= 70) return '#ff4d4f';
  if (score >= 40) return '#faad14';
  return '#52c41a';
};

// 风险状态文字 + Badge 状态
const getRiskStatus = (score) => {
  if (score >= 70) return { text: '高风险', status: 'error' };
  if (score >= 40) return { text: '中风险', status: 'warning' };
  return { text: '低风险', status: 'success' };
};

// 异常类型图标
const getAnomalyIcon = (type) => {
  switch (type) {
    case 'PathDeviation':
      return <ExclamationCircleOutlined className="text-orange-500 mt-1" />;
    case 'HighLatency':
      return <WarningOutlined className="text-yellow-500 mt-1" />;
    case 'MaliciousIP':
      return <SecurityScanOutlined className="text-red-500 mt-1" />;
    case 'PacketLoss':
      return <InfoCircleOutlined className="text-blue-500 mt-1" />;
    default:
      return <InfoCircleOutlined className="text-gray-400 mt-1" />;
  }
};

const RiskAnalysisPanel = ({ riskData, loading }) => {
  const isEmpty = !riskData;
  const { riskScore = 0, anomalies = [], alerts = [] } = riskData || {};
  const riskStatus = getRiskStatus(riskScore);
  const riskColor = getRiskColor(riskScore);

  return (
    <div className="mb-6 mt-10">
      <div className="mb-4">
        {/* 标题始终展示 */}
        <Title level={4} className="mb-4">
          <SecurityScanOutlined className="mr-2" />
          路由风险分析
        </Title>

        {/* 内容区统一样式容器 */}
        <div className="bg-white rounded-lg shadow px-7 py-6">
          {/* 加载中状态 */}
          {loading ? (
            <div className="text-center">
              <SyncOutlined spin className="mr-2" />
              <Text>正在分析路由风险...</Text>
            </div>
          ) : isEmpty ? (
            // 无数据状态
            <div className="text-center text-gray-500">
              <SecurityScanOutlined className="text-2xl mb-2" />
              <div>暂无风险分析数据</div>
            </div>
          ) : (
            <>
              {/* 风险评分 */}
              <div className="mb-6">
                <div className="flex items-center justify-between mb-4">
                  <Text strong>综合风险评分</Text>
                  <Badge status={riskStatus.status} text={riskStatus.text} className="font-medium" />
                </div>
                <Progress
                  percent={riskScore}
                  strokeColor={riskColor}
                  trailColor="#f0f0f0"
                  strokeWidth={12}
                  format={(percent) => `${percent}/100`}
                />
                <div className="mt-2 text-sm text-gray-600">基于路由异常、延迟、安全威胁等多维度分析</div>
              </div>

              {/* 异常检测 */}
              {anomalies.length > 0 && (
                <div className="mb-6">
                  <Text strong className="block mb-2">
                    检测到的异常
                  </Text>
                  <div className="space-y-2">
                    {anomalies.map((anomaly, index) => (
                      <div key={index} className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
                        {getAnomalyIcon(anomaly.type)}
                        <div className="flex-1">
                          <div className="font-medium text-orange-800">
                            {anomaly.type === 'PathDeviation' && '路径偏离'}
                            {anomaly.type === 'HighLatency' && '高延迟'}
                            {anomaly.type === 'MaliciousIP' && '恶意IP'}
                            {anomaly.type === 'PacketLoss' && '丢包异常'}
                          </div>
                          <div className="text-orange-700 text-sm mt-1">{anomaly.detail}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 安全警报 */}
              {alerts.length > 0 && (
                <div className="mb-6">
                  <Text strong className="block mb-2">
                    安全警报
                  </Text>
                  <div className="space-y-2">
                    {alerts.map((alert, index) => (
                      <Alert key={index} type="warning" showIcon message={alert} className="text-sm" />
                    ))}
                  </div>
                </div>
              )}

              {/* 正常状态 */}
              {anomalies.length === 0 && alerts.length === 0 && riskScore < 40 && (
                <div className="text-center">
                  <CheckCircleOutlined className="text-green-500 text-3xl mb-2" />
                  <div className="text-green-600 font-medium">路由状态正常</div>
                  <div className="text-gray-500 text-sm mt-1">未检测到异常或安全威胁</div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskAnalysisPanel;
