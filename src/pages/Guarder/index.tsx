import React, { useState, useEffect } from 'react';
import {
  Layout,
  Menu,
  Button,
  Space,
  Steps,
  Progress,
  Spin,
  Radio,
  Alert,
  Table,
  Tabs,
  Modal,
  Card,
  Row,
  Col,
  Tag,
  Typography,
  Form,
  Input,
  Switch,
  List,
  App,
} from 'antd';
import {
  GlobalOutlined,
  FilterOutlined,
  RobotOutlined,
  ThunderboltOutlined,
  SecurityScanOutlined,
  ApiOutlined,
  BulbOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import Connections from './Connections';
import Filters from './Filters';
import AiCenter from './AiCenter';
import { useModals } from '@/stores/useStore';
import { useAIStore } from '@/stores/useAIStore'; // 引入 AI Store
import { useFilters } from '@/stores/useFilters';

const { Header, Sider, Content } = Layout;
const { Step } = Steps;
const { TabPane } = Tabs;
const { Paragraph, Text } = Typography;
const { TextArea } = Input;

const DataSwitch = ({ name, label }: { name: string; label: string }) => (
  <Form.Item name={name} valuePropName="checked" noStyle>
    <label className="inline-flex items-center cursor-pointer gap-3 py-1">
      <Switch size="small" />
      <span>{label}</span>
    </label>
  </Form.Item>
);

const Guarder: React.FC = () => {
  const [selectedMenu, setSelectedMenu] = useState('filters');
  const [selectedFilters, setSelectedFilters] = useState<number[]>([]);
  const { notification } = App.useApp();
  // 使用各种 Store
  const { filters, addFilter, initFilters } = useFilters();
  const { aiGenerateModalVisible, setAiGenerateModalVisible } = useModals();
  // 每次刷新都添加一下bug？
  useEffect(() => {
    initFilters();
  }, []);
  // 使用 AI Store
  const {
    config,
    isLoading,
    error,
    lastAnalysisResult,
    lastGenerationResult,
    getConfig,
    generateFilters,
    analyzeOnly,
    clearError,
    isAiConfigValid,
    reset,
  } = useAIStore();

  const [form] = Form.useForm();
  const [analysisStep, setAnalysisStep] = useState(0);

  // 检查 AI 配置
  useEffect(() => {
    getConfig();
  }, [getConfig]);

  const menuItems = [
    {
      key: 'connections',
      icon: <GlobalOutlined />,
      label: '连接监控',
    },
    {
      key: 'filters',
      icon: <FilterOutlined />,
      label: '过滤器管理',
    },
    {
      key: 'ai-center',
      icon: <RobotOutlined />,
      label: 'AI智能中心',
    },
  ];

  // 使用 AI Store 的生成过滤器功能
  const handleGenerateAiFilters = async (values: any) => {
    if (!isAiConfigValid()) {
      notification.error({
        message: 'AI配置无效',
        description: '请先在AI中心配置API密钥和模型参数',
      });
      return;
    }

    try {
      setAnalysisStep(0);
      clearError();

      // 准备分析参数
      const analysisParams = {
        analysis_type: values.analyze_type,
        custom_prompt: values.custom_prompt,
        include_data: {
          tcp: values.include_tcp,
          udp: values.include_udp,
          icmp: values.include_icmp,
          stats: values.include_stats,
        },
      };

      // 分步骤进行分析
      setAnalysisStep(1);
      const result = await generateFilters(analysisParams);

      setAnalysisStep(2);

      // 检查结果是否成功
      if (result && result.success) {
        // 初始化选中的过滤器
        if (result.filters && result.filters.length > 0) {
          // 为每个filter添加临时id用于选择
          const filtersWithIds = result.filters.map((f: any, index: number) => ({
            ...f,
            id: index + 1,
          }));
          setSelectedFilters(filtersWithIds.map((f: any) => f.id));
        }

        notification.success({
          message: 'AI分析完成',
          description: `已成功生成 ${result.filters?.length || 0} 个智能过滤规则`,
        });
      } else {
        // 处理API返回的错误
        const errorMessage = result?.error || '未知错误';
        throw new Error(errorMessage);
      }
    } catch (err: any) {
      const errorMsg = err.message || error || '请检查网络连接和AI配置';

      notification.error({
        message: 'AI分析失败',
        description: errorMsg.length > 100 ? `${errorMsg.substring(0, 100)}...` : errorMsg,
      });
      setAnalysisStep(0);
    }
  };

  // 应用生成的过滤器
  const applyAiFilters = () => {
    if (!lastGenerationResult?.success || !lastGenerationResult?.filters) return;

    // 为filters添加临时id
    const filtersWithIds = lastGenerationResult.filters.map((f: any, index: number) => ({
      ...f,
      id: index + 1,
    }));

    const selectedFilterObjects = filtersWithIds.filter((f: any) => selectedFilters.includes(f.id));

    selectedFilterObjects.forEach((filterData: any) => {
      const filter: Filter = {
        // id: Date.now() + Math.random(), // 生成真实的唯一ID
        // name: filterData.comment || `AI生成规则-${filterData.rule_type}`,
        rule_type: filterData.rule_type,
        protocol: filterData.protocol,
        src_ip: filterData.src_ip,
        dst_ip: filterData.dst_ip,
        src_port: filterData.src_port,
        dst_port: filterData.dst_port,
        tcp_flags: filterData.tcp_flags,
        tcp_flags_mask: filterData.tcp_flags_mask,
        // action: filterData.action,
        action: 'allow',
        // enabled: filterData.enabled ?? true,
        enabled: false,
        comment: `[AI生成规则] ${filterData.comment}`,
        ai_generated: true,
        // created_at: new Date().toISOString(),
      };
      addFilter(filter);
    });

    notification.success({
      message: '规则应用成功',
      description: `已应用 ${selectedFilterObjects.length} 个AI生成的过滤规则`,
    });

    setAiGenerateModalVisible(false);
    setAnalysisStep(0);
    setSelectedFilters([]);
  };

  // 处理模态框关闭
  const handleModalClose = () => {
    setAiGenerateModalVisible(false);
    setAnalysisStep(0);
    setSelectedFilters([]);
    clearError();
    reset();
  };

  // 渲染分析步骤
  const renderAnalysisSteps = () => (
    <Steps current={analysisStep} style={{ marginBottom: 24 }}>
      <Step title="准备数据" description="收集网络连接和流量数据" />
      <Step title="AI分析" description="使用大语言模型分析并生成规则" />
      <Step title="完成" description="分析完成，规则已生成" />
    </Steps>
  );

  // 渲染分析结果
  const renderAnalysisResults = () => {
    if (!lastGenerationResult?.success || !lastGenerationResult.analysis) return null;

    return (
      <Card
        title={
          <>
            <InfoCircleOutlined className="mr-2" />
            AI分析报告
          </>
        }
        style={{ marginBottom: 16 }}
      >
        <Paragraph>{lastGenerationResult.analysis}</Paragraph>

        {lastGenerationResult.suggestions && lastGenerationResult.suggestions.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Text strong>安全建议：</Text>
            <List
              size="small"
              dataSource={lastGenerationResult.suggestions}
              renderItem={(item: string) => (
                <List.Item>
                  <Text>• {item}</Text>
                </List.Item>
              )}
              style={{ marginTop: 8 }}
            />
          </div>
        )}

        {lastGenerationResult.tokens_used && (
          <div style={{ marginTop: 16, color: '#666' }}>
            <Text type="secondary">Token使用量: {lastGenerationResult.tokens_used}</Text>
          </div>
        )}
      </Card>
    );
  };

  // 渲染生成的过滤器表格
  const renderFilterTable = () => {
    if (!lastGenerationResult?.success || !lastGenerationResult?.filters) return null;

    // 为每个filter添加临时id用于表格
    const filtersWithIds = lastGenerationResult.filters.map((f: any, index: number) => ({
      ...f,
      id: index + 1,
    }));

    return (
      <Table
        rowSelection={{
          type: 'checkbox',
          selectedRowKeys: selectedFilters,
          onChange: (selectedRowKeys) => {
            setSelectedFilters(selectedRowKeys as number[]);
          },
        }}
        columns={[
          {
            title: '规则类型',
            dataIndex: 'rule_type',
            render: (type: string) => <Tag color="purple">{type?.toUpperCase()}</Tag>,
          },
          {
            title: '协议',
            dataIndex: 'protocol',
            render: (protocol: string) => protocol?.toUpperCase() || '-',
          },
          {
            title: '源IP',
            dataIndex: 'src_ip',
            render: (ip: string) => ip || '-',
          },
          {
            title: '目标IP',
            dataIndex: 'dst_ip',
            render: (ip: string) => ip || '-',
          },
          {
            title: '端口',
            dataIndex: 'dst_port',
            render: (port: number) => port || '-',
          },
          {
            title: 'TCP标志',
            dataIndex: 'tcp_flags',
            render: (flags: number) => (flags ? `0x${flags.toString(16)}` : '-'),
          },
          {
            title: '动作',
            dataIndex: 'action',
            render: (action: string) => <Tag color={action === 'drop' ? 'red' : 'green'}>{action === 'drop' ? '阻断' : '允许'}</Tag>,
          },
          {
            title: '说明',
            dataIndex: 'comment',
            ellipsis: true,
          },
        ]}
        dataSource={filtersWithIds}
        pagination={false}
        size="small"
        rowKey="id"
      />
    );
  };

  const renderContent = () => {
    switch (selectedMenu) {
      case 'connections':
        return <Connections />;
      case 'filters':
        return <Filters />;
      case 'ai-center':
        return <AiCenter />;
      default:
        return <Connections />;
    }
  };

  // 检查是否有有效的生成结果
  const hasValidResult = lastGenerationResult && lastGenerationResult.success;
  const hasFilters = hasValidResult && lastGenerationResult.filters && lastGenerationResult.filters.length > 0;

  return (
    <Layout className="min-h-screen ">
      <Layout>
        <Sider width={250} className="bg-white shadow-sm">
          <Menu
            mode="inline"
            selectedKeys={[selectedMenu]}
            onClick={({ key }) => setSelectedMenu(key)}
            items={menuItems}
            className="border-r-0 pt-4"
          />
        </Sider>

        <Content className="p-12 pt-8 bg-gradient-to-br from-slate-50 to-blue-50">{renderContent()}</Content>
      </Layout>

      {/* AI生成过滤器模态框 */}
      <Modal
        title={
          <div>
            <RobotOutlined className="mr-2" />
            AI智能生成过滤器
          </div>
        }
        open={aiGenerateModalVisible}
        onCancel={handleModalClose}
        width={900}
        footer={null}
        forceRender
      >
        {error && (
          <Alert
            message="AI分析错误"
            description={error}
            type="error"
            showIcon
            closable
            onClose={clearError}
            style={{ marginBottom: 16 }}
          />
        )}

        {!isAiConfigValid() && (
          <Alert
            message="AI配置未完成"
            description="请先在AI中心配置API密钥和模型参数后再使用此功能"
            type="warning"
            showIcon
            icon={<ExclamationCircleOutlined />}
            style={{ marginBottom: 16 }}
          />
        )}

        {!hasValidResult ? (
          <div>
            {renderAnalysisSteps()}

            {isLoading ? (
              <div className="text-center py-8">
                <Spin size="large" indicator={<LoadingOutlined style={{ fontSize: 48 }} spin />} />
                <div className="mt-4 text-lg">AI 正在分析网络数据...</div>
                <Progress percent={(analysisStep + 1) * 33.33} status="active" strokeColor="#722ed1" style={{ marginTop: 16 }} />
              </div>
            ) : (
              <Form
                form={form}
                layout="vertical"
                onFinish={handleGenerateAiFilters}
                initialValues={{
                  analyze_type: 'security',
                  include_tcp: true,
                  include_udp: true,
                  include_icmp: false,
                  include_stats: true,
                }}
              >
                <Alert
                  message="AI分析配置"
                  description="选择分析类型和数据范围，AI将基于当前网络状态生成智能过滤规则。"
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                />

                <Form.Item label="分析策略" name="analyze_type" rules={[{ required: true, message: '请选择分析策略' }]}>
                  <Radio.Group>
                    <Radio.Button value="security">
                      <SecurityScanOutlined className="mr-2" />
                      安全导向
                    </Radio.Button>
                    <Radio.Button value="performance">
                      <ThunderboltOutlined className="mr-2" />
                      性能导向
                    </Radio.Button>
                    <Radio.Button value="custom">
                      <BulbOutlined className="mr-2" />
                      自定义
                    </Radio.Button>
                  </Radio.Group>
                </Form.Item>

                <Form.Item noStyle shouldUpdate={(prevValues, currentValues) => prevValues.analyze_type !== currentValues.analyze_type}>
                  {({ getFieldValue }) =>
                    getFieldValue('analyze_type') === 'custom' ? (
                      <Form.Item label="自定义分析提示" name="custom_prompt" rules={[{ required: true, message: '请输入自定义分析提示' }]}>
                        <TextArea rows={4} placeholder="例: 重点关注SSH和HTTP服务安全，识别暴力破解攻击..." />
                      </Form.Item>
                    ) : null
                  }
                </Form.Item>

                <Form.Item label="包含数据类型">
                  <Space direction="vertical">
                    <DataSwitch name="include_tcp" label="TCP连接数据" />
                    <DataSwitch name="include_udp" label="UDP连接数据" />
                    <DataSwitch name="include_icmp" label="ICMP流量数据" />
                    <DataSwitch name="include_stats" label="性能统计数据" />
                  </Space>
                </Form.Item>

                <div className="text-center">
                  <Button
                    type="primary"
                    htmlType="submit"
                    icon={<RobotOutlined />}
                    size="large"
                    disabled={!isAiConfigValid()}
                    style={{ background: '#722ed1', borderColor: '#722ed1' }}
                  >
                    开始AI分析
                  </Button>
                </div>
              </Form>
            )}
          </div>
        ) : (
          <div>
            <Alert
              message="AI分析完成"
              description={`AI已完成网络数据分析${hasFilters ? `，生成了 ${lastGenerationResult.filters.length} 个智能过滤规则` : '，但未生成任何过滤规则'}。`}
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />

            <Tabs defaultActiveKey="analysis">
              <TabPane tab="分析结果" key="analysis">
                {renderAnalysisResults()}
              </TabPane>

              {hasFilters && (
                <TabPane tab={`生成的规则 (${lastGenerationResult.filters.length})`} key="rules">
                  <div style={{ marginBottom: 16 }}>
                    <Text>AI已生成 {lastGenerationResult.filters.length} 个智能过滤规则，请选择要应用的规则：</Text>
                  </div>

                  {renderFilterTable()}

                  <div className="text-center mt-4">
                    <Space>
                      <Button onClick={handleModalClose}>取消</Button>
                      <Button
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={applyAiFilters}
                        disabled={selectedFilters.length === 0}
                      >
                        应用选中规则 ({selectedFilters.length})
                      </Button>
                    </Space>
                  </div>
                </TabPane>
              )}
            </Tabs>
          </div>
        )}
      </Modal>
    </Layout>
  );
};

export default Guarder;
