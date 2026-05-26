"""
TC-TR-001 ~ TC-TR-012: Tracer 模块 tracer_service 单元测试
"""
import pytest
import os
import sys
import json
import tempfile
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "modules", "Tracer"))


class TestSanitizeFilename:
    """TC-TR-001: sanitize_filename 文件名安全过滤"""

    def test_normal_string(self):
        from app.services.tracer_service import sanitize_filename
        assert sanitize_filename("hello-world_123") == "hello-world_123"

    def test_special_characters(self):
        from app.services.tracer_service import sanitize_filename
        result = sanitize_filename("test/path:with*special?chars")
        assert "/" not in result
        assert ":" not in result
        assert "*" not in result
        assert "?" not in result

    def test_dots_replaced(self):
        from app.services.tracer_service import sanitize_filename
        result = sanitize_filename("192.168.1.1")
        assert re.match(r"^[0-9a-zA-Z_-]+$", result)

    def test_empty_string(self):
        from app.services.tracer_service import sanitize_filename
        result = sanitize_filename("")
        assert result == ""

    def test_unicode_characters(self):
        from app.services.tracer_service import sanitize_filename
        result = sanitize_filename("中文测试")
        assert re.match(r"^[0-9a-zA-Z_-]+$", result)

    def test_path_traversal(self):
        from app.services.tracer_service import sanitize_filename
        result = sanitize_filename("../../etc/passwd")
        assert ".." not in result.split("_")


class TestGetTimestamp:
    """TC-TR-002: get_timestamp 时间戳格式"""

    def test_format(self):
        from app.services.tracer_service import get_timestamp
        ts = get_timestamp()
        assert re.match(r"^\d{8}-\d{6}$", ts)

    def test_length(self):
        from app.services.tracer_service import get_timestamp
        ts = get_timestamp()
        assert len(ts) == 15


class TestGetIpFromUrl:
    """TC-TR-003: get_ip_from_url DNS 解析"""

    def test_localhost(self):
        from app.services.tracer_service import get_ip_from_url
        result = get_ip_from_url("localhost")
        assert result == "127.0.0.1"

    def test_invalid_domain(self):
        from app.services.tracer_service import get_ip_from_url
        result = get_ip_from_url("this-domain-does-not-exist-at-all-12345.invalid")
        assert result is None

    def test_ip_passthrough(self):
        from app.services.tracer_service import get_ip_from_url
        result = get_ip_from_url("8.8.8.8")
        assert result == "8.8.8.8"


class TestAnalyzeAnomalies:
    """TC-TR-004: analyze_anomalies 路由异常检测"""

    def test_no_anomalies(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "1.1.1.1", "latency": 10}]
        history = [[{"ip": "1.1.1.1", "latency": 10}]]
        anomalies = analyze_anomalies(current, history)
        assert len(anomalies) == 0

    def test_new_ip_detected(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "2.2.2.2", "latency": 10}]
        history = [[{"ip": "1.1.1.1", "latency": 10}]]
        anomalies = analyze_anomalies(current, history)
        path_deviations = [a for a in anomalies if a["type"] == "PathDeviation"]
        assert len(path_deviations) >= 1

    def test_high_latency(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "1.1.1.1", "latency": 500}]
        history = [[{"ip": "1.1.1.1", "latency": 10}]]
        anomalies = analyze_anomalies(current, history)
        high_latency = [a for a in anomalies if a["type"] == "HighLatency"]
        assert len(high_latency) >= 1

    def test_empty_history(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "1.1.1.1", "latency": 10}]
        anomalies = analyze_anomalies(current, [])
        path_deviations = [a for a in anomalies if a["type"] == "PathDeviation"]
        assert len(path_deviations) >= 1

    def test_latency_threshold_boundary(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "1.1.1.1", "latency": 200}]
        history = [[{"ip": "1.1.1.1"}]]
        anomalies = analyze_anomalies(current, history)
        high_latency = [a for a in anomalies if a["type"] == "HighLatency"]
        assert len(high_latency) == 0

    def test_latency_above_threshold(self):
        from app.services.tracer_service import analyze_anomalies
        current = [{"ip": "1.1.1.1", "latency": 201}]
        history = [[{"ip": "1.1.1.1"}]]
        anomalies = analyze_anomalies(current, history)
        high_latency = [a for a in anomalies if a["type"] == "HighLatency"]
        assert len(high_latency) >= 1


class TestGuarderRiskScore:
    """TC-TR-005: guarder_risk_score 风险评分"""

    def test_no_risky_ips(self):
        from app.services.tracer_service import guarder_risk_score
        hops = [{"ip": "8.8.8.8"}, {"ip": "1.1.1.1"}]
        score, alerts = guarder_risk_score(hops)
        assert score == 0
        assert len(alerts) == 0

    def test_empty_hops(self):
        from app.services.tracer_service import guarder_risk_score
        score, alerts = guarder_risk_score([])
        assert score == 0
        assert len(alerts) == 0

    def test_none_ip(self):
        from app.services.tracer_service import guarder_risk_score
        hops = [{"ip": None}]
        score, alerts = guarder_risk_score(hops)
        assert score == 0


class TestRunTracerouteValidation:
    """TC-TR-006: run_traceroute 参数校验"""

    def test_invalid_protocol(self):
        from app.services.tracer_service import run_traceroute
        with pytest.raises(ValueError, match="Invalid protocol"):
            list(run_traceroute("example.com", "1.2.3.4", protocol="invalid"))

    def test_tcp_without_port(self):
        from app.services.tracer_service import run_traceroute
        with pytest.raises(ValueError, match="Missing port"):
            list(run_traceroute("example.com", "1.2.3.4", protocol="tcp"))

    def test_tcp_invalid_port_string(self):
        from app.services.tracer_service import run_traceroute
        with pytest.raises(ValueError, match="Invalid port"):
            list(run_traceroute("example.com", "1.2.3.4", protocol="tcp", port="abc"))

    def test_tcp_port_out_of_range(self):
        from app.services.tracer_service import run_traceroute
        with pytest.raises(ValueError, match="Invalid port"):
            list(run_traceroute("example.com", "1.2.3.4", protocol="tcp", port=0))

    def test_tcp_port_too_high(self):
        from app.services.tracer_service import run_traceroute
        with pytest.raises(ValueError, match="Invalid port"):
            list(run_traceroute("example.com", "1.2.3.4", protocol="tcp", port=70000))


class TestFinalizeHop:
    """TC-TR-007: finalize_hop 跳点数据处理"""

    def test_basic_hop(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 1, "ip": "127.0.0.1", "rtts": [1.0, 2.0, 3.0]}
        result = finalize_hop(hop)
        assert result["hop"] == 1
        assert result["ip"] == "127.0.0.1"
        assert result["latency"] == 2.0
        assert result["packet_loss"] == "0.0%"

    def test_hop_with_star(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 2, "ip": "1.1.1.1", "rtts": [1.0, "*", 3.0]}
        result = finalize_hop(hop)
        assert "33.3%" in result["packet_loss"]

    def test_all_star_rtt(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 3, "ip": "2.2.2.2", "rtts": ["*", "*", "*"]}
        result = finalize_hop(hop)
        assert result["latency"] is None
        assert result["packet_loss"] == "100.0%"

    def test_empty_rtts(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 1, "ip": "3.3.3.3", "rtts": []}
        result = finalize_hop(hop)
        assert result["latency"] is None
        assert result["packet_loss"] == "100%"

    def test_jitter_calculation(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 1, "ip": "127.0.0.1", "rtts": [10.0, 20.0, 30.0]}
        result = finalize_hop(hop)
        assert result["jitter"] is not None
        assert result["jitter"] > 0

    def test_bandwidth_estimation(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 1, "ip": "127.0.0.1", "rtts": [10.0]}
        result = finalize_hop(hop)
        assert result["bandwidth_mbps"] is not None
        assert result["bandwidth_mbps"] > 0

    def test_no_ip_hop(self):
        from app.services.tracer_service import finalize_hop
        hop = {"hop": 1, "ip": None, "rtts": [1.0]}
        result = finalize_hop(hop)
        assert result["location"] == "Unknown"


class TestListHistory:
    """TC-TR-008: list_history 历史记录列表"""

    def test_returns_dict(self):
        from app.services.tracer_service import list_history
        result = list_history()
        assert isinstance(result, dict)


class TestLoadRecentHistory:
    """TC-TR-009: load_recent_history 历史加载"""

    def test_nonexistent_ip(self):
        from app.services.tracer_service import load_recent_history
        result = load_recent_history("999.999.999.999")
        assert result == []

    def test_returns_list(self):
        from app.services.tracer_service import load_recent_history
        result = load_recent_history("127.0.0.1")
        assert isinstance(result, list)
