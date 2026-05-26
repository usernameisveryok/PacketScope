"""
TC-AN-001 ~ TC-AN-010: Analyzer 模块 PSUtil 工具函数单元测试
"""
import pytest
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "modules", "Analyzer", "Monitor"))

import PSUtil


class TestU32ToIpv4:
    """TC-AN-001: U32ToIpv4 IPv4 地址转换"""

    def test_localhost(self):
        # 127.0.0.1 in network byte order (little-endian): 0x0100007F
        result = PSUtil.U32ToIpv4(0x0100007F)
        assert result == "127.0.0.1"

    def test_all_zeros(self):
        result = PSUtil.U32ToIpv4(0x00000000)
        assert result == "0.0.0.0"

    def test_all_ones(self):
        result = PSUtil.U32ToIpv4(0xFFFFFFFF)
        assert result == "255.255.255.255"

    def test_private_network(self):
        # 192.168.1.1 -> 0x0101A8C0
        result = PSUtil.U32ToIpv4(0x0101A8C0)
        assert result == "192.168.1.1"

    def test_class_a(self):
        # 10.0.0.1 -> 0x0100000A
        result = PSUtil.U32ToIpv4(0x0100000A)
        assert result == "10.0.0.1"

    def test_asymmetric_bytes(self):
        # 1.2.3.4 -> 0x04030201
        result = PSUtil.U32ToIpv4(0x04030201)
        assert result == "1.2.3.4"


class TestArrayToIpv4:
    """TC-AN-002: ArrayToIpv4 数组转 IPv4"""

    def test_localhost(self):
        result = PSUtil.ArrayToIpv4([127, 0, 0, 1])
        assert result == "127.0.0.1"

    def test_all_zeros(self):
        result = PSUtil.ArrayToIpv4([0, 0, 0, 0])
        assert result == "0.0.0.0"

    def test_all_ones(self):
        result = PSUtil.ArrayToIpv4([255, 255, 255, 255])
        assert result == "255.255.255.255"

    def test_private_network(self):
        result = PSUtil.ArrayToIpv4([192, 168, 1, 1])
        assert result == "192.168.1.1"


class TestArrayToIpv6:
    """TC-AN-003: ArrayToIpv6 数组转 IPv6"""

    def test_loopback(self):
        arr = [0]*15 + [1]
        result = PSUtil.ArrayToIpv6(arr)
        assert result == "0000:0000:0000:0000:0000:0000:0000:0001"

    def test_all_zeros(self):
        arr = [0]*16
        result = PSUtil.ArrayToIpv6(arr)
        assert result == "0000:0000:0000:0000:0000:0000:0000:0000"

    def test_all_ff(self):
        arr = [0xFF]*16
        result = PSUtil.ArrayToIpv6(arr)
        assert result == "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"

    def test_mixed_values(self):
        arr = [0xfe, 0x80, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1]
        result = PSUtil.ArrayToIpv6(arr)
        assert result == "fe80:0000:0000:0000:0000:0000:0000:0001"

    def test_single_digit_hex_padded(self):
        arr = [0x0a, 0x0b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        result = PSUtil.ArrayToIpv6(arr)
        assert result.startswith("0a0b:")


class TestGetInfoTypeName:
    """TC-AN-004: getInfoTypeName 信息类型映射"""

    def test_type_0(self):
        assert PSUtil.getInfoTypeName(0) == "netif_receive_skb_entry"

    def test_type_1(self):
        assert PSUtil.getInfoTypeName(1) == "netif_receive_skb_exit"

    def test_type_2(self):
        assert PSUtil.getInfoTypeName(2) == "netif_rx_entry"

    def test_type_3(self):
        assert PSUtil.getInfoTypeName(3) == "netif_rx_exit"

    def test_invalid_type(self):
        assert PSUtil.getInfoTypeName(99) == "Illegal Code, Check Dev"

    def test_negative_type(self):
        assert PSUtil.getInfoTypeName(-1) == "Illegal Code, Check Dev"
