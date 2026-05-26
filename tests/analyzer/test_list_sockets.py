"""
TC-AN-005 ~ TC-AN-012: Analyzer 模块 ListSockets 函数单元测试
"""
import pytest
import json
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "modules", "Analyzer", "Monitor"))

import ListSockets


class TestTranV4intoP:
    """TC-AN-005: TranV4intoP IPv4 十六进制地址解析"""

    def test_localhost_http(self):
        # 0100007F => bytes [6:8]=7F=127, [4:6]=00=0, [2:4]=00=0, [0:2]=01=1
        result = ListSockets.TranV4intoP("0100007F:0050")
        assert result == "127.0.0.1:80"

    def test_any_addr(self):
        # 0.0.0.0:22 => 00000000:0016
        result = ListSockets.TranV4intoP("00000000:0016")
        assert result == "0.0.0.0:22"

    def test_high_port(self):
        # 192.168.1.1:65535 => C0A80101:FFFF
        result = ListSockets.TranV4intoP("C0A80101:FFFF")
        assert ":65535" in result

    def test_port_zero(self):
        result = ListSockets.TranV4intoP("0100007F:0000")
        assert result.endswith(":0")


class TestTranV6intoP:
    """TC-AN-006: TranV6intoP IPv6 十六进制地址解析"""

    def test_loopback(self):
        result = ListSockets.TranV6intoP("00000000000000000000000001000000:0050")
        assert ":80" in result

    def test_format_lowercase(self):
        result = ListSockets.TranV6intoP("0000000000000000FFFF00000100007F:0050")
        assert "ffff" in result


class TestTranStateintoSTR:
    """TC-AN-007: TranStateintoSTR TCP 状态转换"""

    def test_established(self):
        result = ListSockets.TranStateintoSTR(1)
        assert "ESTABLISHED" in result

    def test_syn_sent(self):
        result = ListSockets.TranStateintoSTR(2)
        assert "SYN_SENT" in result

    def test_syn_recv(self):
        result = ListSockets.TranStateintoSTR(3)
        assert "SYN_RECV" in result

    def test_fin_wait1(self):
        result = ListSockets.TranStateintoSTR(4)
        assert "FIN_WAIT1" in result

    def test_fin_wait2(self):
        result = ListSockets.TranStateintoSTR(5)
        assert "FIN_WAIT2" in result

    def test_time_wait(self):
        result = ListSockets.TranStateintoSTR(6)
        assert "TIME_WAIT" in result

    def test_close(self):
        result = ListSockets.TranStateintoSTR(7)
        assert "CLOSE" in result

    def test_close_wait(self):
        result = ListSockets.TranStateintoSTR(8)
        assert "CLOSE_WAIT" in result

    def test_last_ack(self):
        result = ListSockets.TranStateintoSTR(9)
        assert "LAST_ACK" in result

    def test_listen(self):
        result = ListSockets.TranStateintoSTR(10)
        assert "LISTEN" in result

    def test_closing(self):
        result = ListSockets.TranStateintoSTR(11)
        assert "CLOSING" in result

    def test_undefined(self):
        result = ListSockets.TranStateintoSTR(99)
        assert "UNDEFINED" in result


class TestListAll:
    """TC-AN-008: ListAll 系统 Socket 枚举"""

    def test_returns_valid_json(self):
        result = ListSockets.ListAll()
        data = json.loads(result)
        assert isinstance(data, dict)

    def test_contains_tcp_keys(self):
        data = json.loads(ListSockets.ListAll())
        assert "tcpipv4" in data
        assert "tcpipv6" in data

    def test_contains_udp_keys(self):
        data = json.loads(ListSockets.ListAll())
        assert "udpipv4" in data
        assert "udpipv6" in data

    def test_contains_dev_key(self):
        data = json.loads(ListSockets.ListAll())
        assert "dev" in data

    def test_contains_icmp_keys(self):
        data = json.loads(ListSockets.ListAll())
        assert "icmpipv4" in data
        assert "icmpipv6" in data

    def test_contains_raw_keys(self):
        data = json.loads(ListSockets.ListAll())
        assert "rawipv4" in data
        assert "rawipv6" in data

    def test_tcp_entries_are_tuples(self):
        data = json.loads(ListSockets.ListAll())
        for entry in data["tcpipv4"]:
            assert isinstance(entry, list)
            assert len(entry) == 5

    def test_dev_entries_exist(self):
        data = json.loads(ListSockets.ListAll())
        assert len(data["dev"]) > 0
