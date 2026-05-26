"""
TC-GD-031 ~ TC-GD-040: Guarder 模块 BPF C 源码静态分析测试

验证 eBPF C 程序 (conn_tracker.c) 的结构完整性和关键功能。
"""
import pytest
import os
import re

BPF_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "modules", "Guarder", "bpf"
)


def read_bpf_source() -> str:
    path = os.path.join(BPF_DIR, "conn_tracker.c")
    with open(path, "r") as f:
        return f.read()


class TestBPFMaps:
    """TC-GD-031: BPF Map 定义"""

    def test_conn_map(self):
        src = read_bpf_source()
        assert "conn_map" in src

    def test_icmp_map(self):
        src = read_bpf_source()
        assert "icmp_map" in src

    def test_filter_map(self):
        src = read_bpf_source()
        assert "filter_map" in src

    def test_perf_stats_map(self):
        src = read_bpf_source()
        assert "perf_stats_map" in src

    def test_pkt_ctx_map(self):
        src = read_bpf_source()
        assert "pkt_ctx_map" in src

    def test_prog_filter_map(self):
        src = read_bpf_source()
        assert "prog_filter_map" in src

    def test_filter_mode_map(self):
        src = read_bpf_source()
        assert "filter_mode_map" in src


class TestBPFStructs:
    """TC-GD-032: BPF 结构体定义"""

    def test_conn_key(self):
        src = read_bpf_source()
        assert "struct conn_key" in src

    def test_conn_info(self):
        src = read_bpf_source()
        assert "struct conn_info" in src

    def test_icmp_key(self):
        src = read_bpf_source()
        assert "struct icmp_key" in src

    def test_icmp_info(self):
        src = read_bpf_source()
        assert "struct icmp_info" in src

    def test_pkt_context(self):
        src = read_bpf_source()
        assert "struct pkt_context" in src


class TestXDPProgram:
    """TC-GD-033: XDP 主程序入口"""

    def test_sec_xdp(self):
        src = read_bpf_source()
        assert 'SEC("xdp")' in src

    def test_conn_tracker_function(self):
        src = read_bpf_source()
        assert "conn_tracker" in src

    def test_xdp_pass(self):
        src = read_bpf_source()
        assert "XDP_PASS" in src

    def test_xdp_drop(self):
        src = read_bpf_source()
        assert "XDP_DROP" in src

    def test_gpl_license(self):
        src = read_bpf_source()
        assert '"GPL"' in src


class TestFilterModeSwitch:
    """TC-GD-034: 过滤模式切换（传统/可编程）"""

    def test_filter_mode_lookup(self):
        src = read_bpf_source()
        assert "filter_mode_map" in src
        assert "bpf_map_lookup_elem" in src

    def test_tail_call_dispatch(self):
        src = read_bpf_source()
        assert "bpf_tail_call" in src
        assert "prog_filter_map" in src

    def test_pkt_context_population(self):
        src = read_bpf_source()
        assert "pkt_ctx" in src
        assert "src_ip" in src
        assert "dst_ip" in src


class TestPacketParsing:
    """TC-GD-035: 数据包解析逻辑"""

    def test_ethernet_header(self):
        src = read_bpf_source()
        assert "ethhdr" in src

    def test_ip_header(self):
        src = read_bpf_source()
        assert "iphdr" in src

    def test_tcp_header(self):
        src = read_bpf_source()
        assert "tcphdr" in src

    def test_udp_header(self):
        src = read_bpf_source()
        assert "udphdr" in src

    def test_icmp_header(self):
        src = read_bpf_source()
        assert "icmphdr" in src

    def test_bounds_check(self):
        src = read_bpf_source()
        assert "data_end" in src
        assert "data" in src


class TestFilterTemplate:
    """TC-GD-036: filter_template.h 头文件"""

    def test_template_exists(self):
        path = os.path.join(BPF_DIR, "filter_template.h")
        assert os.path.exists(path)

    def test_template_contains_pkt_context(self):
        path = os.path.join(BPF_DIR, "filter_template.h")
        with open(path, "r") as f:
            src = f.read()
        assert "struct pkt_context" in src

    def test_template_contains_macros(self):
        path = os.path.join(BPF_DIR, "filter_template.h")
        with open(path, "r") as f:
            src = f.read()
        assert "IP_MATCH" in src
        assert "CHAIN_NEXT" in src

    def test_template_contains_bloom_filter(self):
        path = os.path.join(BPF_DIR, "filter_template.h")
        with open(path, "r") as f:
            src = f.read()
        assert "bloom" in src.lower()
