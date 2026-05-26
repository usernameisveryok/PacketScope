"""
TC-GD-016 ~ TC-GD-030: Guarder 模块 Go 源码静态分析测试

通过解析 Go 源文件验证关键函数、结构体、API 端点的完整性。
"""
import pytest
import os
import re

GUARDER_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "modules", "Guarder"
)
CMD_DIR = os.path.join(GUARDER_DIR, "cmd", "conn-tracker")
PKG_DIR = os.path.join(GUARDER_DIR, "pkg", "bpf")


def read_go_file(relative_path: str) -> str:
    path = os.path.join(CMD_DIR, relative_path)
    with open(path, "r") as f:
        return f.read()


def read_pkg_file(relative_path: str) -> str:
    path = os.path.join(PKG_DIR, relative_path)
    with open(path, "r") as f:
        return f.read()


class TestAPIEndpoints:
    """TC-GD-016: API 端点注册完整性"""

    def test_connections_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/connections"' in src

    def test_icmp_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/icmp"' in src

    def test_stats_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/stats"' in src

    def test_filters_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/filters"' in src

    def test_ai_config_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ai/config"' in src

    def test_ai_status_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ai/status"' in src

    def test_ai_generate_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ai/generate"' in src

    def test_ai_analyze_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ai/analyze"' in src

    def test_pcap_analyze_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/pcap/analyze"' in src

    def test_ebpf_mode_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ebpf/mode"' in src

    def test_ebpf_generate_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ebpf/generate"' in src

    def test_ebpf_deploy_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ebpf/deploy"' in src

    def test_ebpf_programs_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ebpf/programs"' in src

    def test_ebpf_validate_endpoint(self):
        src = read_go_file("api.go")
        assert '"/api/ebpf/validate"' in src


class TestCORSHeaders:
    """TC-GD-017: CORS 响应头设置"""

    def test_allow_origin(self):
        src = read_go_file("api.go")
        assert "Access-Control-Allow-Origin" in src
        assert '"*"' in src

    def test_allow_methods(self):
        src = read_go_file("api.go")
        assert "Access-Control-Allow-Methods" in src
        assert "GET" in src
        assert "POST" in src
        assert "DELETE" in src

    def test_allow_headers(self):
        src = read_go_file("api.go")
        assert "Access-Control-Allow-Headers" in src
        assert "Content-Type" in src

    def test_options_preflight(self):
        src = read_go_file("api.go")
        assert '"OPTIONS"' in src


class TestFilterRuleStruct:
    """TC-GD-018: FilterRule 结构体定义"""

    def test_required_fields(self):
        src = read_go_file("filter.go")
        fields = ["SrcIP", "DstIP", "SrcPort", "DstPort", "Protocol",
                   "Action", "Enabled", "RuleType", "Comment"]
        for field in fields:
            assert field in src, f"FilterRule missing field: {field}"

    def test_icmp_fields(self):
        src = read_go_file("filter.go")
        assert "ICMPType" in src
        assert "ICMPCode" in src

    def test_tcp_fields(self):
        src = read_go_file("filter.go")
        assert "TCPFlags" in src
        assert "TCPFlagsMask" in src

    def test_inner_packet_fields(self):
        src = read_go_file("filter.go")
        assert "InnerSrcIP" in src
        assert "InnerDstIP" in src
        assert "InnerProtocol" in src


class TestTCPFlagConstants:
    """TC-GD-019: TCP 标志位常量定义"""

    def test_flag_values(self):
        src = read_go_file("filter.go")
        assert "TCPFlagFIN = 0x01" in src
        assert "TCPFlagSYN = 0x02" in src
        assert "TCPFlagRST = 0x04" in src
        assert "TCPFlagPSH = 0x08" in src
        assert "TCPFlagACK = 0x10" in src
        assert "TCPFlagURG = 0x20" in src


class TestParseTCPFlags:
    """TC-GD-020: parseTCPFlags 函数逻辑验证"""

    def test_function_exists(self):
        src = read_go_file("filter.go")
        assert "func parseTCPFlags" in src

    def test_handles_empty_string(self):
        src = read_go_file("filter.go")
        assert '"any"' in src or 'flagStr == ""' in src

    def test_handles_all_flags(self):
        src = read_go_file("filter.go")
        for flag in ["FIN", "SYN", "RST", "PSH", "ACK", "URG"]:
            assert f'"{flag}"' in src


class TestFilterManager:
    """TC-GD-021: FilterManager CRUD 操作"""

    def test_add_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) AddRule" in src

    def test_remove_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) RemoveRule" in src

    def test_update_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) UpdateRule" in src

    def test_get_rules(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) GetRules" in src

    def test_get_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) GetRule" in src

    def test_enable_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) EnableRule" in src

    def test_disable_rule(self):
        src = read_go_file("filter.go")
        assert "func (fm *FilterManager) DisableRule" in src

    def test_max_filter_rules(self):
        src = read_go_file("filter.go")
        assert "MaxFilterRules = 32" in src


class TestConvertToBPFRule:
    """TC-GD-022: convertToBPFRule IP/协议转换逻辑"""

    def test_protocol_mapping(self):
        src = read_go_file("filter.go")
        assert "bpfRule.Protocol = 6" in src   # TCP
        assert "bpfRule.Protocol = 17" in src  # UDP
        assert "bpfRule.Protocol = 1" in src   # ICMP

    def test_action_mapping(self):
        src = read_go_file("filter.go")
        assert "bpfRule.Action = 0" in src  # allow
        assert "bpfRule.Action = 1" in src  # drop

    def test_ip_validation(self):
        src = read_go_file("filter.go")
        assert "net.ParseIP" in src

    def test_ipv6_not_supported(self):
        src = read_go_file("filter.go")
        assert "IPv6 not supported" in src


class TestConnectionFormatting:
    """TC-GD-023: 连接信息格式化函数"""

    def test_format_conn_key(self):
        src = read_go_file("common.go")
        assert "func formatConnKey" in src

    def test_format_conn_info(self):
        src = read_go_file("common.go")
        assert "func formatConnInfo" in src

    def test_format_icmp_key(self):
        src = read_go_file("common.go")
        assert "func formatICMPKey" in src

    def test_format_icmp_info(self):
        src = read_go_file("common.go")
        assert "func formatICMPInfo" in src

    def test_get_connections(self):
        src = read_go_file("common.go")
        assert "func GetConnections" in src

    def test_get_icmp_entries(self):
        src = read_go_file("common.go")
        assert "func GetICMPEntries" in src


class TestBPFPackage:
    """TC-GD-024: pkg/bpf 包结构体定义"""

    def test_conn_key_struct(self):
        src = read_pkg_file("bpf.go")
        assert "type ConnKey struct" in src
        for field in ["SrcIP", "DstIP", "SrcPort", "DstPort", "Protocol"]:
            assert field in src

    def test_conn_info_struct(self):
        src = read_pkg_file("bpf.go")
        assert "type ConnInfo struct" in src
        for field in ["Packets", "Bytes", "TCPFlags", "Seq", "AckSeq", "Window"]:
            assert field in src

    def test_icmp_key_struct(self):
        src = read_pkg_file("bpf.go")
        assert "type ICMPKey struct" in src

    def test_icmp_info_struct(self):
        src = read_pkg_file("bpf.go")
        assert "type ICMPInfo struct" in src
        for field in ["InnerSrcIP", "InnerDstIP", "InnerProtocol"]:
            assert field in src

    def test_perf_stats_struct(self):
        src = read_pkg_file("bpf.go")
        assert "type PerfStats struct" in src
        for field in ["TotalPackets", "TotalBytes", "DroppedPackets",
                       "TCPRetrans", "TCPDuplicateAck"]:
            assert field in src

    def test_format_functions(self):
        src = read_pkg_file("bpf.go")
        assert "func FormatConnKey" in src
        assert "func FormatICMPKey" in src
        assert "func FormatConnInfo" in src
        assert "func FormatICMPInfo" in src

    def test_size_functions(self):
        src = read_pkg_file("bpf.go")
        assert "func ConnKeySize" in src
        assert "func ICMPKeySize" in src


class TestAIFilterConfig:
    """TC-GD-025: AI 过滤器配置"""

    def test_provider_constants(self):
        src = read_go_file("ai_filter.go")
        assert 'AIProviderOpenAI' in src
        assert 'AIProviderAnthropic' in src

    def test_config_struct(self):
        src = read_go_file("ai_filter.go")
        assert "type AIFilterConfig struct" in src
        for field in ["Provider", "OpenAIEndpoint", "APIKey", "Model", "Temperature"]:
            assert field in src

    def test_validate_config(self):
        src = read_go_file("ai_filter.go")
        assert "ValidateConfig" in src

    def test_is_configured(self):
        src = read_go_file("ai_filter.go")
        assert "IsConfigured" in src


class TestMainEntryPoint:
    """TC-GD-026: main.go 入口配置"""

    def test_cli_flags(self):
        src = read_go_file("main.go")
        assert "iface" in src
        assert "interval" in src
        assert "api" in src
        assert "debug" in src

    def test_rlimit_removal(self):
        src = read_go_file("main.go")
        assert "rlimit.RemoveMemlock" in src

    def test_xdp_attach(self):
        src = read_go_file("main.go")
        assert "link.AttachXDP" in src

    def test_graceful_shutdown(self):
        src = read_go_file("main.go")
        assert "SIGINT" in src
        assert "SIGTERM" in src

    def test_include_path_env(self):
        src = read_go_file("main.go")
        assert "EBPF_INCLUDE_PATH" in src
