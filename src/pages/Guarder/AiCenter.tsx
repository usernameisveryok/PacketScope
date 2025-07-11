import React, { useEffect } from 'react';
import {
  Card,
  Button,
  Space,
  Tag,
  Row,
  Col,
  Typography,
  Modal,
  Form,
  Input,
  Switch,
  Alert,
  Flex,
  AutoComplete,
  App,
  Radio,
  Spin,
  InputNumber,
} from 'antd';
import {
  SettingOutlined,
  SecurityScanOutlined,
  BulbOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { PackageSearch, X, Bot } from 'lucide-react';
import { useAIStore } from '@/stores/useAIStore';
import { useModals } from '@/stores/useStore';

const { Title, Paragraph, Text } = Typography;
const { TextArea } = Input;

export const DataSwitch = ({ name, label }: { name: string; label: string }) => (
  <Form.Item name={name} valuePropName="checked" noStyle>
    <label className="inline-flex items-center cursor-pointer gap-3 py-1">
      <Switch size="small" />
      <span>{label}</span>
    </label>
  </Form.Item>
);

const AiCenter: React.FC = () => {
  const { notification, modal } = App.useApp();

  // 使用 useAIStore 替换原有状态管理
  const {
    config,
    isLoading,
    error,
    lastAnalysisResult,
    lastGenerationResult,
    getConfig,
    updateConfig,
    generateFilters,
    analyzeOnly,
    clearError,
    isAiConfigValid,
  } = useAIStore();

  const {
    aiConfigModalVisible,
    setAiConfigModalVisible,
    aiAnalyzeModalVisible,
    setAiAnalyzeModalVisible,
    aiGenerateModalVisible,
    setAiGenerateModalVisible,
  } = useModals();

  const [aiConfigForm] = Form.useForm();
  const [aiAnalyzeForm] = Form.useForm();
  const [aiGenerateForm] = Form.useForm();

  // 获取当前结果（优先显示最新的）
  const currentResult = lastGenerationResult || lastAnalysisResult;

  // 显示配置提醒弹窗
  const showConfigRequired = () => {
    modal.warning({
      title: 'AI服务未配置',
      content: '请先配置AI服务参数才能使用智能分析功能。是否现在配置？',
      okText: '立即配置',
      cancelText: '稍后配置',
      onOk: () => {
        setAiConfigModalVisible(true);
      },
    });
  };

  // 保存AI配置
  const saveAiConfig = async (values: any) => {
    values.timeout = parseInt(values.timeout, 10);
    try {
      await updateConfig(values);
      notification.success({
        message: 'AI配置已保存',
        description: '配置已成功更新',
      });
      setAiConfigModalVisible(false);
    } catch (error) {
      notification.error({
        message: '保存AI配置失败',
        description: error instanceof Error ? error.message : '请检查配置信息后重试',
      });
    }
  };

  // AI网络分析
  const handleAiAnalyze = async (values: any) => {
    if (!isAiConfigValid()) {
      showConfigRequired();
      return;
    }

    try {
      await analyzeOnly(values);
      notification.success({
        message: 'AI网络分析完成',
        description: '分析结果已生成',
      });
      setAiAnalyzeModalVisible(false);
    } catch (error) {
      notification.error({
        message: 'AI网络分析失败',
        description: error instanceof Error ? error.message : '请重试',
      });
    }
  };

  // AI过滤器生成
  const handleAiGenerate = async (values: any) => {
    if (!isAiConfigValid()) {
      showConfigRequired();
      return;
    }

    try {
      await generateFilters(values);
      notification.success({
        message: 'AI过滤器生成完成',
        description: '过滤规则已生成',
      });
      setAiGenerateModalVisible(false);
    } catch (error) {
      notification.error({
        message: 'AI过滤器生成失败',
        description: error instanceof Error ? error.message : '请重试',
      });
    }
  };

  // 处理智能生成按钮点击
  const handleGenerateClick = () => {
    if (!isAiConfigValid()) {
      showConfigRequired();
      return;
    }
    setAiGenerateModalVisible(true);
  };

  // 处理网络分析按钮点击
  const handleAnalyzeClick = () => {
    if (!isAiConfigValid()) {
      showConfigRequired();
      return;
    }
    setAiAnalyzeModalVisible(true);
  };

  // 清除结果
  const clearResults = () => {
    // 这里可以添加清除结果的逻辑，或者在 store 中添加相应方法
    clearError();
  };

  // 组件加载时自动加载配置
  useEffect(() => {
    getConfig();
  }, [getConfig]);

  // 显示错误通知
  // useEffect(() => {
  //   if (error) {
  //     notification.error({
  //       message: '操作失败',
  //       description: error,
  //     });
  //   }
  // }, [error, notification]);

  const configValid = isAiConfigValid();

  return (
    <div>
      <Spin spinning={isLoading} tip="处理中...">
        <Flex vertical gap={20}>
          <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg">
                <Bot className="text-white" size={30} />
              </div>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  AI智能过滤器生成
                </h1>
                <p className="text-gray-600">利用人工智能技术自动分析网络流量并生成eBPF过滤规则</p>
              </div>
            </div>
          </header>

          {/* AI Status Alert */}
          <Alert
            message={
              <div className="flex items-center space-x-3">
                {configValid ? (
                  <CheckCircleOutlined className="text-xl text-green-600" />
                ) : (
                  <ExclamationCircleOutlined className="text-xl text-red-600" />
                )}
                <div>
                  <Text strong className={configValid ? 'text-green-800' : 'text-red-800'}>
                    {configValid ? 'AI服务已配置' : 'AI服务配置不完整'}
                  </Text>
                  <div className={`text-sm ${configValid ? 'text-green-600' : 'text-red-600'}`}>
                    {configValid
                      ? `使用模型: ${config?.model} | 端点: ${config?.openai_endpoint?.split('/')[2] || '未知'}`
                      : '请完善API密钥、端点和模型配置后才能使用AI功能'}
                  </div>
                </div>
              </div>
            }
            type={configValid ? 'success' : 'error'}
            className="rounded-xl"
            action={
              !configValid && (
                <Button size="small" type="primary" onClick={() => setAiConfigModalVisible(true)}>
                  立即配置
                </Button>
              )
            }
          />

          <Row gutter={16}>
            <Col span={8}>
              <Card
                className="min-h-[240px] hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => setAiConfigModalVisible(true)}
              >
                <div className="text-center">
                  <SettingOutlined className="text-3xl text-blue-500 mb-3" />
                  <Title level={4}>AI配置</Title>
                  <Paragraph>配置OpenAI API密钥、模型参数和请求设置</Paragraph>
                  <div className="mt-4">
                    <Tag color={configValid ? 'green' : 'red'}>{configValid ? '已配置' : '未配置'}</Tag>
                    <Tag color="blue">{config?.model || '未设置'}</Tag>
                  </div>
                </div>
              </Card>
            </Col>

            <Col span={8}>
              <Card
                className={`min-h-[240px] hover:shadow-lg transition-shadow cursor-pointer ${!configValid ? 'opacity-50' : ''}`}
                onClick={handleGenerateClick}
              >
                <div className="text-center">
                  <ThunderboltOutlined className="text-3xl text-purple-500 mb-3" />
                  <Title level={4}>智能生成</Title>
                  <Paragraph>基于当前网络数据自动生成过滤规则</Paragraph>
                  <div className="mt-4">
                    <Tag color="purple">安全导向</Tag>
                    <Tag color="orange">性能导向</Tag>
                    <Tag color="cyan">自定义</Tag>
                  </div>
                  {!configValid && (
                    <div className="mt-2">
                      <Tag color="red">需要配置AI服务</Tag>
                    </div>
                  )}
                </div>
              </Card>
            </Col>

            <Col span={8}>
              <Card
                className={`min-h-[240px] hover:shadow-lg transition-shadow cursor-pointer ${!configValid ? 'opacity-50' : ''}`}
                onClick={handleAnalyzeClick}
              >
                <div className="text-center">
                  <PackageSearch size={30} className="text-green-500 mb-3 inline-block" strokeWidth={1.75} />
                  <Title level={4}>网络分析</Title>
                  <Paragraph>分析网络流量模式，识别潜在威胁</Paragraph>
                  <div className="mt-4">
                    <Tag color="green">威胁检测</Tag>
                    <Tag color="blue">流量分析</Tag>
                  </div>
                  {!configValid && (
                    <div className="mt-2">
                      <Tag color="red">需要配置AI服务</Tag>
                    </div>
                  )}
                </div>
              </Card>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={24}>
              <Card title="核心特性" className="shadow-sm">
                <Space direction="vertical" size="small" style={{ width: '100%' }}>
                  <div>
                    <BulbOutlined className="text-yellow-500 mr-2" />
                    <Text>智能分析TCP/UDP连接和ICMP流量</Text>
                  </div>
                  <div>
                    <ApiOutlined className="text-blue-500 mr-2" />
                    <Text>支持多种分析策略和自定义提示</Text>
                  </div>
                  <div>
                    <SecurityScanOutlined className="text-green-500 mr-2" />
                    <Text>生成详细注释和安全建议</Text>
                  </div>
                  <div>
                    <SettingOutlined className="text-purple-500 mr-2" />
                    <Text>灵活的OpenAI端点和模型配置</Text>
                  </div>
                </Space>
              </Card>
            </Col>
          </Row>

          {/* 智能生成结果展示 */}
          {lastGenerationResult && (
            <Row gutter={16}>
              <Col span={24}>
                <Card
                  title={
                    <div className="flex items-center gap-2">
                      <ThunderboltOutlined className="text-purple-500" />
                      <span>AI智能生成结果</span>
                    </div>
                  }
                >
                  {lastGenerationResult.success ? (
                    <div className="space-y-4">
                      <div>
                        <Text strong>威胁分析：</Text>
                        <div className="mt-2 p-3 bg-gray-50 rounded">
                          <pre className="text-green-600 text-wrap text-justify">{lastGenerationResult.analysis}</pre>
                        </div>
                      </div>

                      <div>
                        <Text strong>安全建议：</Text>
                        <ul className="mt-2 p-3 bg-blue-50 rounded list-disc pl-5 text-blue-800">
                          {lastGenerationResult.suggestions?.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>

                      <div>
                        <Text strong>生成的规则：</Text>
                        <div className="mt-2 p-3 bg-gray-50 rounded">
                          <pre className="whitespace-pre-wrap">
                            <code>{JSON.stringify(lastGenerationResult.filters, null, 2)}</code>
                          </pre>
                        </div>
                      </div>

                      <div className="text-right text-xs text-gray-400">Token 使用量：{lastGenerationResult.tokens_used}</div>
                    </div>
                  ) : (
                    <Alert message="AI过滤器生成失败" description={lastGenerationResult.error} type="error" showIcon />
                  )}
                </Card>
              </Col>
            </Row>
          )}

          {/* 网络分析结果展示 */}
          {lastAnalysisResult?.success && (
            <Row gutter={16}>
              <Col span={24}>
                <Card
                  title={
                    <div className="flex items-center gap-2">
                      <SecurityScanOutlined className="text-green-500" />
                      <span>AI网络分析结果</span>
                    </div>
                  }
                >
                  <div className="space-y-4">
                    <div>
                      <Text strong>网络流量摘要：</Text>
                      <div className="mt-2 p-3 bg-gray-50 rounded h-[500px] bg-gray-800 overflow-scroll">
                        <pre className="text-green-600">{lastAnalysisResult.summary}</pre>
                      </div>
                    </div>
                  </div>
                </Card>
              </Col>
            </Row>
          )}
        </Flex>
      </Spin>

      {/* AI配置模态框 */}
      <Modal
        title={
          <div>
            <SettingOutlined className="mr-2" />
            AI配置设置
          </div>
        }
        open={aiConfigModalVisible}
        onOk={() => aiConfigForm.validateFields().then(saveAiConfig)}
        onCancel={() => setAiConfigModalVisible(false)}
        width={700}
        confirmLoading={isLoading}
      >
        <Form form={aiConfigForm} layout="vertical" initialValues={config}>
          <Alert
            message="配置说明"
            description="请配置您的OpenAI API密钥和相关参数。这些信息将用于AI分析和规则生成。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item label="OpenAI端点" name="openai_endpoint" rules={[{ required: true, message: '请输入OpenAI端点' }]}>
            <Input placeholder="https://api.openai.com/v1/chat/completions" />
          </Form.Item>

          <Form.Item label="API密钥" name="api_key" rules={[{ required: true, message: '请输入API密钥' }]}>
            <Input.Password placeholder="AI API 密钥" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="模型" name="model" rules={[{ required: true, message: '请选择或输入模型名称' }]}>
                <AutoComplete
                  options={[
                    { value: 'gpt-4' },
                    { value: 'gpt-4-turbo' },
                    { value: 'gpt-3.5-turbo' },
                    { value: 'deepseek-chat' },
                    { value: 'deepseek-reasoner' },
                  ]}
                  placeholder="请输入或选择模型名称"
                  filterOption={(inputValue, option) => option!.value.toLowerCase().includes(inputValue.toLowerCase())}
                />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="Temperature" name="temperature" rules={[{ required: true, message: '请输入Temperature值' }]}>
                <Input type="number" min={0} max={2} step={0.1} placeholder="0.7" />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="超时时间(秒)" name="timeout" rules={[{ required: true, message: '请输入超时时间' }]}>
                <InputNumber placeholder="120" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="debug" valuePropName="checked" className="pt-7 pb-0">
                <DataSwitch label="启用调试模式" name="debug"></DataSwitch>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* AI智能生成模态框 */}
      {/* <Modal
        title={
          <div>
            <ThunderboltOutlined className="mr-2" />
            AI智能生成过滤器
          </div>
        }
        open={aiGenerateModalVisible}
        onCancel={() => setAiGenerateModalVisible(false)}
        width={600}
        footer={[
          <Button key="cancel" onClick={() => setAiGenerateModalVisible(false)}>
            取消
          </Button>,
          <Button 
            key="generate" 
            type="primary" 
            icon={<ThunderboltOutlined />}
            onClick={() => aiGenerateForm.validateFields().then(handleAiGenerate)}
            loading={isLoading}
          >
            开始生成
          </Button>,
        ]}
      >
        <Form form={aiGenerateForm} layout="vertical" initialValues={{
          analyze_type: 'security',
          include_tcp: true,
          include_udp: true,
          include_icmp: true,
          include_stats: true
        }}>
          <Alert
            message="智能生成说明"
            description="AI将分析当前网络流量并自动生成相应的eBPF过滤规则，包含详细注释和安全建议。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item label="分析类型" name="analyze_type" rules={[{ required: true }]}>
            <Radio.Group>
              <Space direction="vertical">
                <Radio value="security">
                  <div>
                    <div><strong>安全导向</strong></div>
                    <div className="text-gray-500 text-sm">重点识别和阻止潜在威胁</div>
                  </div>
                </Radio>
                <Radio value="performance">
                  <div>
                    <div><strong>性能导向</strong></div>
                    <div className="text-gray-500 text-sm">优化网络性能，减少不必要流量</div>
                  </div>
                </Radio>
                <Radio value="custom">
                  <div>
                    <div><strong>自定义分析</strong></div>
                    <div className="text-gray-500 text-sm">根据自定义提示进行分析</div>
                  </div>
                </Radio>
              </Space>
            </Radio.Group>
          </Form.Item>

          <Form.Item 
            noStyle 
            shouldUpdate={(prevValues, currentValues) => prevValues.analyze_type !== currentValues.analyze_type}
          >
            {({ getFieldValue }) =>
              getFieldValue('analyze_type') === 'custom' ? (
                <Form.Item 
                  label="自定义分析提示" 
                  name="custom_prompt"
                  rules={[{ required: true, message: '请输入自定义分析提示' }]}
                >
                  <TextArea 
                    rows={3} 
                    placeholder="例如：重点关注SSH和HTTP服务安全，识别暴力破解攻击" 
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>

          <Form.Item label="包含数据范围">
            <Space direction="vertical">
              <DataSwitch label="包含TCP连接" name="include_tcp"></DataSwitch>
              <DataSwitch label="包含UDP连接" name="include_udp"></DataSwitch>
              <DataSwitch label="包含ICMP流量" name="include_icmp"></DataSwitch>
              <DataSwitch label="包含统计数据" name="include_stats"></DataSwitch>
            </Space>
          </Form.Item>
        </Form>
      </Modal> */}

      {/* AI网络分析模态框 */}
      <Modal
        title={
          <div>
            <SecurityScanOutlined className="mr-2" />
            AI网络分析
          </div>
        }
        open={aiAnalyzeModalVisible}
        onCancel={() => setAiAnalyzeModalVisible(false)}
        width={600}
        footer={[
          <Button key="cancel" onClick={() => setAiAnalyzeModalVisible(false)}>
            取消
          </Button>,
          <Button
            key="analyze"
            type="primary"
            icon={<SecurityScanOutlined />}
            onClick={() => aiAnalyzeForm.validateFields().then(handleAiAnalyze)}
            loading={isLoading}
          >
            开始分析
          </Button>,
        ]}
      >
        <Form
          form={aiAnalyzeForm}
          layout="vertical"
          initialValues={{
            include_tcp: true,
            include_udp: true,
            include_icmp: true,
            include_stats: true,
          }}
        >
          <Alert
            message="网络分析说明"
            description="此功能仅分析当前网络流量模式和威胁情况，不会生成过滤规则。适用于了解网络安全状况。"
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item label="分析范围">
            <Space direction="vertical">
              <DataSwitch label="分析TCP连接" name="include_tcp"></DataSwitch>
              <DataSwitch label="分析UDP连接" name="include_udp"></DataSwitch>
              <DataSwitch label="分析ICMP流量" name="include_icmp"></DataSwitch>
              <DataSwitch label="包含统计数据" name="include_stats"></DataSwitch>
            </Space>
          </Form.Item>

          <Form.Item label="自定义分析提示" name="custom_prompt">
            <TextArea rows={4} placeholder="可选：提供特定的分析指令，如'分析流量模式中的异常行为'..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default AiCenter;
