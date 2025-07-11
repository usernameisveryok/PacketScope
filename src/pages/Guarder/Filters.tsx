import React, { useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Tag,
  Switch,
  Tooltip,
  Popconfirm,
  Modal,
  Form,
  Input,
  Select,
  Row,
  Col,
  Alert,
  Statistic,
  Typography,
  InputNumber,
  Checkbox,
  App,
} from 'antd';
import type { TableProps } from 'antd';
import {
  PlusOutlined,
  RobotOutlined,
  EditOutlined,
  DeleteOutlined,
  SearchOutlined,
  FilterOutlined,
  EyeOutlined,
  EyeInvisibleOutlined,
  CheckOutlined,
  CloseOutlined,
  GlobalOutlined,
  ApiOutlined,
  AlertOutlined,
  SafetyOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { useFilters } from '@/stores/useFilters';
import { useModals } from '@/stores/useStore';
import { useEdit } from '@/stores/useStore';
import { Funnel } from 'lucide-react';
import type { Filter } from '@/stores/useFilters';

const { Text } = Typography;
const { Option } = Select;
const { TextArea } = Input;
// TCP标志位选项
const tcpFlags = [
  { label: 'FIN (连接终止)', value: 1 },
  { label: 'SYN (建立连接)', value: 2 },
  { label: 'RST (重置连接)', value: 4 },
  { label: 'PSH (推送数据)', value: 8 },
  { label: 'ACK (确认)', value: 16 },
  { label: 'URG (紧急数据)', value: 32 },
];

// ICMP类型选项
const icmpTypes = [
  { label: 'Echo Reply (0)', value: 0 },
  { label: 'Destination Unreachable (3)', value: 3 },
  { label: 'Redirect (5)', value: 5 },
  { label: 'Echo Request (8)', value: 8 },
  { label: 'Router Advertisement (9)', value: 9 },
  { label: 'Router Selection (10)', value: 10 },
  { label: 'Time Exceeded (11)', value: 11 },
  { label: 'Parameter Problem (12)', value: 12 },
  { label: 'Timestamp (13)', value: 13 },
  { label: 'Timestamp Reply (14)', value: 14 },
];
const Filters: React.FC = () => {
  const { message } = App.useApp();
  const { filters, fetchFilters, addFilter, updateFilter, deleteFilter, toggleFilter } = useFilters();
  const { filterModalVisible, setFilterModalVisible, setAiGenerateModalVisible } = useModals();
  const { editingFilter, setEditingFilter } = useEdit();
  const [formRef] = Form.useForm();
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterType, setFilterType] = React.useState('all');
  const [filterStatus, setFilterStatus] = React.useState('all');
  const [filterAction, setFilterAction] = React.useState('all');
  const [currentRuleType, setCurrentRuleType] = React.useState('basic');

  // 过滤和搜索逻辑
  const filteredFilters = React.useMemo(() => {
    return filters.filter((filter) => {
      // 搜索条件匹配
      const matchesSearch =
        searchTerm === '' ||
        (filter.src_ip && filter.src_ip.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (filter.dst_ip && filter.dst_ip.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (filter.comment && filter.comment.toLowerCase().includes(searchTerm.toLowerCase()));

      // 类型过滤
      const matchesType = filterType === 'all' || (filterType === 'ai' ? filter.ai_generated : filter.rule_type === filterType);

      // 状态过滤
      const matchesStatus =
        filterStatus === 'all' || (filterStatus === 'enabled' && filter.enabled) || (filterStatus === 'disabled' && !filter.enabled);

      // 动作过滤
      const matchesAction = filterAction === 'all' || filter.action === filterAction;

      return matchesSearch && matchesType && matchesStatus && matchesAction;
    });
  }, [filters, searchTerm, filterType, filterStatus, filterAction]);

  useEffect(() => {
    fetchFilters(message);
  }, []);

  const filterColumns: TableProps<Filter>['columns'] = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      sorter: (a, b) => b.id - a.id,
    },
    {
      title: '规则类型',
      dataIndex: 'rule_type',
      key: 'rule_type',
      // filters: [
      //   { text: '基础规则', value: 'basic' },
      //   { text: 'TCP规则', value: 'tcp' },
      //   { text: 'UDP规则', value: 'udp' },
      //   { text: 'ICMP规则', value: 'icmp' },
      // ],
      // onFilter: (value, record) => record.rule_type === value,
      render: (type: string, record: Filter) => (
        <Space>
          <Tag color={type === 'basic' ? 'blue' : type === 'tcp' ? 'green' : type === 'udp' ? 'orange' : 'purple'}>
            {type.toUpperCase()}
          </Tag>
          {record.ai_generated && (
            <Tag color="gold" icon={<RobotOutlined />}>
              AI
            </Tag>
          )}
        </Space>
      ),
    },
    {
      title: '源IP',
      dataIndex: 'src_ip',
      key: 'src_ip',
      // filterSearch: true,
      // filters: Array.from(new Set(filters.map((f) => f.src_ip).filter(Boolean))).map((ip) => ({
      //   text: ip || '',
      //   value: ip || '',
      // })),
      // onFilter: (value, record) => record.src_ip === value,
    },
    {
      title: '协议',
      dataIndex: 'protocol',
      key: 'protocol',
      // filters: [
      //   { text: 'TCP', value: 'tcp' },
      //   { text: 'UDP', value: 'udp' },
      //   { text: 'ICMP', value: 'icmp' },
      // ],
      // onFilter: (value, record) => record.protocol === value,
    },
    {
      title: '动作',
      dataIndex: 'action',
      key: 'action',
      // filters: [
      //   { text: '阻断', value: 'drop' },
      //   { text: '允许', value: 'allow' },
      // ],
      // onFilter: (value, record) => record.action === value,
      render: (action: string) => <Tag color={action === 'drop' ? 'red' : 'green'}>{action === 'drop' ? '阻断' : '允许'}</Tag>,
    },
    {
      title: '状态',
      dataIndex: 'enabled',
      key: 'enabled',
      // filters: [
      //   { text: '已启用', value: true },
      //   { text: '已禁用', value: false },
      // ],
      // onFilter: (value, record) => record.enabled === value,
      render: (enabled: boolean, record: Filter) => (
        <Switch checked={enabled} onChange={() => toggleFilter(record.id, message)} size="small" />
      ),
    },
    {
      title: '备注',
      dataIndex: 'comment',
      key: 'comment',
      render: (comment: string, record: Filter) => (
        <div>
          <div>{comment}</div>
          {record.ai_generated && record.ai_confidence && (
            <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>AI置信度: {(record.ai_confidence * 100).toFixed(1)}%</div>
          )}
        </div>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record: Filter) => (
        <Space>
          <Tooltip title="编辑">
            <Button type="text" icon={<EditOutlined className="w-4 h-4" />} onClick={() => editFilter(record)} />
          </Tooltip>
          <Popconfirm title="确定要删除这个过滤器吗？" onConfirm={() => deleteFilter(record.id, message)} okText="确定" cancelText="取消">
            <Tooltip title="删除">
              <Button type="text" danger icon={<DeleteOutlined className="w-4 h-4" />} />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const editFilter = (filter: any) => {
    setEditingFilter(filter);
    setCurrentRuleType(filter.rule_type);
    formRef.setFieldsValue(filter);
    setFilterModalVisible(true);
  };

  const addNewFilter = () => {
    setEditingFilter(null);
    setCurrentRuleType('basic');
    formRef.resetFields();
    formRef.setFieldsValue({
      rule_type: 'basic',
      action: 'allow',
      enabled: true,
      protocol: 'tcp',
    });
    setFilterModalVisible(true);
  };

  const handleModalOk = () => {
    formRef.validateFields().then((values) => {
      // 处理特殊字段
      const processedValues = {
        ...values,
        src_ip: values.src_ip || '0.0.0.0',
        dst_ip: values.dst_ip || '0.0.0.0',
        src_port: values.src_port || 0,
        dst_port: values.dst_port || 0,
        icmp_type: values.icmp_type || 255,
        icmp_code: values.icmp_code || 255,
        tcp_flags: values.tcp_flags || 0,
        tcp_flags_mask: values.tcp_flags_mask || 0,
        inner_src_ip: values.inner_src_ip || '0.0.0.0',
        inner_dst_ip: values.inner_dst_ip || '0.0.0.0',
        inner_protocol: values.inner_protocol || 0,
      };
      if (editingFilter) {
        // 更新过滤器
        updateFilter(editingFilter.id, values, message);
        // message.success('过滤器已更新');
      } else {
        // 添加新过滤器
        const newFilter = {
          id: Math.max(...filters.map((f) => f.id), 0) + 1,
          ...values,
          ai_generated: false,
        };
        addFilter(newFilter, message);
        // message.success('过滤器已添加');
      }
      setFilterModalVisible(false);
    });
  };
  const handleRuleTypeChange = (value: string) => {
    setCurrentRuleType(value);
    // 重置相关字段
    if (value === 'basic') {
      formRef.setFieldsValue({
        tcp_flags: undefined,
        tcp_flags_mask: undefined,
        icmp_type: undefined,
        icmp_code: undefined,
        inner_src_ip: undefined,
        inner_dst_ip: undefined,
        inner_protocol: undefined,
      });
    }
  };

  // 渲染基础字段
  const renderBasicFields = () => (
    <>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item label="规则类型" name="rule_type" rules={[{ required: true, message: '请选择规则类型' }]}>
            <Select placeholder="选择规则类型" onChange={handleRuleTypeChange}>
              <Option value="basic">基础规则</Option>
              <Option value="tcp">TCP规则</Option>
              <Option value="udp">UDP规则</Option>
              <Option value="icmp">ICMP规则</Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="动作" name="action" rules={[{ required: true, message: '请选择动作' }]}>
            <Select placeholder="选择动作">
              <Option value="allow">允许</Option>
              <Option value="drop">阻断</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                源IP地址
                <Tooltip title="留空表示任意IP (0.0.0.0)">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="src_ip"
          >
            <Input placeholder="例: 192.168.1.100 (留空=任意)" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                目标IP地址
                <Tooltip title="留空表示任意IP (0.0.0.0)">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="dst_ip"
          >
            <Input placeholder="例: 8.8.8.8 (留空=任意)" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={8}>
          <Form.Item
            label={
              <span>
                源端口
                <Tooltip title="0表示任意端口">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="src_port"
          >
            <InputNumber min={0} max={65535} placeholder="0=任意" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item
            label={
              <span>
                目标端口
                <Tooltip title="0表示任意端口">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="dst_port"
          >
            <InputNumber min={0} max={65535} placeholder="0=任意" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col span={8}>
          <Form.Item label="协议" name="protocol" rules={[{ required: true, message: '请选择协议' }]}>
            <Select placeholder="选择协议">
              <Option value="tcp">TCP (6)</Option>
              <Option value="udp">UDP (17)</Option>
              <Option value="icmp">ICMP (1)</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </>
  );

  // 渲染TCP特定字段
  const renderTcpFields = () => (
    <>
      <Alert message="TCP规则特定字段" description="配置TCP标志位匹配条件" type="info" showIcon style={{ marginBottom: 16 }} />
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                TCP标志位
                <Tooltip title="要匹配的TCP标志位，0表示不检查">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="tcp_flags"
          >
            <Select
              // mode="multiple"
              placeholder="选择要匹配的TCP标志位"
            >
              {tcpFlags.map((flag) => (
                <Option key={flag.value} value={flag.value}>
                  {flag.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                标志位掩码
                <Tooltip title="指定哪些标志位需要检查，0表示忽略所有标志位">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="tcp_flags_mask"
          >
            <Select
              // mode="multiple"
              placeholder="选择要检查的标志位"
            >
              {tcpFlags.map((flag) => (
                <Option key={flag.value} value={flag.value}>
                  {flag.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </>
  );

  // 渲染ICMP特定字段
  const renderIcmpFields = () => (
    <>
      <Alert
        message="ICMP规则特定字段"
        description="配置ICMP类型、代码和内部包过滤条件"
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                ICMP类型
                <Tooltip title="255表示任意类型">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="icmp_type"
          >
            <Select placeholder="选择ICMP类型" allowClear>
              {icmpTypes.map((type) => (
                <Option key={type.value} value={type.value}>
                  {type.label}
                </Option>
              ))}
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                ICMP代码
                <Tooltip title="255表示任意代码">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="icmp_code"
          >
            <InputNumber min={0} max={255} placeholder="255=任意" style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>

      <Alert
        message="内部包过滤 (用于ICMP错误消息)"
        description="过滤ICMP错误消息中包含的原始包信息"
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                内部源IP
                <Tooltip title="ICMP错误消息中原始包的源IP，0.0.0.0表示任意">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="inner_src_ip"
          >
            <Input placeholder="例: 192.168.1.100 (留空=任意)" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                内部目标IP
                <Tooltip title="ICMP错误消息中原始包的目标IP，0.0.0.0表示任意">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="inner_dst_ip"
          >
            <Input placeholder="例: 8.8.8.8 (留空=任意)" />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            label={
              <span>
                内部协议
                <Tooltip title="ICMP错误消息中原始包的协议，0表示任意">
                  <InfoCircleOutlined style={{ marginLeft: 4, color: '#1890ff' }} />
                </Tooltip>
              </span>
            }
            name="inner_protocol"
          >
            <Select placeholder="选择内部协议" allowClear>
              <Option value={'ICMP'}>ICMP (1)</Option>
              <Option value={'TCP'}>TCP (6)</Option>
              <Option value={'UDP'}>UDP (17)</Option>
            </Select>
          </Form.Item>
        </Col>
      </Row>
    </>
  );

  return (
    <div>
      <div className="mx-auto">
        {/* 头部 */}
        {/* <div className="flex items-center gap-3 mb-8">
          <div className="p-2 bg-blue-600 rounded-lg">
            <FilterOutlined className="text-3xl text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">网络过滤器管理</h1>
            <p className="text-gray-400">管理和配置网络流量过滤规则，保护网络安全</p>
          </div>
        </div> */}
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-600 rounded-lg">
              <Funnel className="text-white text-3xl" color="#fff" size={30} />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">网络过滤器管理</h1>
              <p className="text-gray-600">管理和配置网络流量过滤规则，保护网络安全</p>
            </div>
          </div>
        </header>

        {/* 统计卡片 */}
        <Row gutter={[16, 16]} className="mb-8">
          <Col xs={24} sm={12} md={6}>
            <Card className="transition-all duration-300 bg-gradient-to-br from-blue-50 via-white to-blue-50 relative overflow-hidden group shadow-sm">
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <SafetyOutlined className="text-8xl text-blue-600 transform rotate-12" />
              </div>
              <div className="relative z-10">
                <Statistic
                  title={
                    <Text strong className="text-gray-700/50">
                      总规则数
                    </Text>
                  }
                  value={filters.length}
                  valueStyle={{ color: '#1e40af', fontSize: '30px', fontWeight: 'bold' }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="transition-all duration-300 bg-gradient-to-br from-green-50 via-white to-green-50 relative overflow-hidden group shadow-sm">
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <EyeOutlined className="text-8xl text-green-600 transform rotate-12" />
              </div>
              <div className="relative z-10">
                <Statistic
                  title={
                    <Text strong className="text-gray-700/50">
                      启用规则
                    </Text>
                  }
                  value={filters.filter((f) => f.enabled).length}
                  valueStyle={{ color: '#16a34a', fontSize: '30px', fontWeight: 'bold' }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="transition-all duration-300 bg-gradient-to-br from-gray-50 via-white to-gray-50 relative overflow-hidden group shadow-sm">
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <EyeInvisibleOutlined className="text-8xl text-gray-600 transform rotate-12" />
              </div>
              <div className="relative z-10">
                <Statistic
                  title={
                    <Text strong className="text-gray-700/50">
                      禁用规则
                    </Text>
                  }
                  value={filters.filter((f) => !f.enabled).length}
                  valueStyle={{ color: '#4b5563', fontSize: '30px', fontWeight: 'bold' }}
                />
              </div>
            </Card>
          </Col>
          <Col xs={24} sm={12} md={6}>
            <Card className="transition-all duration-300 bg-gradient-to-br from-purple-50 via-white to-purple-50 relative overflow-hidden group shadow-sm">
              <div className="absolute -right-8 -bottom-8 opacity-10">
                <AlertOutlined className="text-8xl text-purple-600 transform rotate-12" />
              </div>
              <div className="relative z-10">
                <Statistic
                  title={
                    <Text strong className="text-gray-700/50">
                      AI生成规则
                    </Text>
                  }
                  value={filters.filter((f) => f.ai_generated).length}
                  valueStyle={{ color: 'purple', fontSize: '30px', fontWeight: 'bold' }}
                />
              </div>
            </Card>
          </Col>
        </Row>

        {/* 工具栏 */}
        <Card className="mb-6 shadow-sm">
          <div className="flex flex-col lg:flex-row gap-4 justify-between">
            <div className="flex flex-col sm:flex-row gap-4 flex-1">
              <Input
                prefix={<SearchOutlined className="text-gray-400" />}
                placeholder="搜索IP地址或备注..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-md"
                allowClear
              />
              <Space>
                <Select value={filterType} onChange={setFilterType} style={{ width: 120 }} placeholder="规则类型">
                  <Option value="all">所有类型</Option>
                  <Option value="ai">AI生成规则</Option>
                  <Option value="basic">基础规则</Option>
                  <Option value="tcp">TCP规则</Option>
                  <Option value="udp">UDP规则</Option>
                  <Option value="icmp">ICMP规则</Option>
                </Select>
                <Select value={filterStatus} onChange={setFilterStatus} style={{ width: 120 }} placeholder="规则状态">
                  <Option value="all">所有状态</Option>
                  <Option value="enabled">已启用</Option>
                  <Option value="disabled">已禁用</Option>
                </Select>
                <Select value={filterAction} onChange={setFilterAction} style={{ width: 120 }} placeholder="动作">
                  <Option value="all">所有动作</Option>
                  <Option value="drop">阻断</Option>
                  <Option value="allow">允许</Option>
                </Select>
              </Space>
            </div>
            <Space>
              <Button type="primary" icon={<PlusOutlined />} onClick={addNewFilter}>
                添加过滤器
              </Button>
              <Button
                type="primary"
                icon={<RobotOutlined />}
                onClick={() => setAiGenerateModalVisible(true)}
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
              >
                AI智能生成
              </Button>
            </Space>
          </div>
        </Card>

        {/* 过滤器列表 */}
        <Card className="shadow-sm">
          <Table
            columns={filterColumns}
            dataSource={filteredFilters}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条规则`,
            }}
            size="small"
            onChange={(pagination, filters, sorter) => {
              console.log('Table parameters:', { pagination, filters, sorter });
            }}
            locale={{
              emptyText: (
                <div className="text-center py-12">
                  <FilterOutlined className="text-5xl text-gray-300 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">没有找到过滤器</h3>
                  <p className="text-gray-500 mb-4">尝试调整搜索条件或创建新的过滤器</p>
                  <Button type="primary" icon={<PlusOutlined />} onClick={addNewFilter}>
                    添加过滤器
                  </Button>
                </div>
              ),
            }}
          />
        </Card>

        {/* 添加/编辑模态框 */}
        <Modal
          title={editingFilter ? '编辑过滤器' : '添加过滤器'}
          open={filterModalVisible}
          onOk={handleModalOk}
          onCancel={() => setFilterModalVisible(false)}
          width={900}
          forceRender
          destroyOnHidden
        >
          <Form form={formRef} layout="vertical">
            {/* 基础字段 */}
            {renderBasicFields()}

            {/* TCP特定字段 */}
            {currentRuleType === 'tcp' && renderTcpFields()}

            {/* ICMP特定字段 */}
            {currentRuleType === 'icmp' && renderIcmpFields()}

            {/* UDP规则说明 */}
            {currentRuleType === 'udp' && (
              <Alert
                message="UDP规则"
                description="UDP规则主要使用源端口和目标端口进行过滤，无需额外的特定字段配置。"
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
              />
            )}

            <Form.Item label="规则说明" name="comment">
              <TextArea rows={3} placeholder="输入规则说明，建议详细描述规则的用途和生效条件" showCount maxLength={200} />
            </Form.Item>

            <Form.Item name="enabled" valuePropName="checked">
              <Checkbox>启用规则</Checkbox>
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </div>
  );
};

export default Filters;
