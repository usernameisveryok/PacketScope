"""
TC-GD-001 ~ TC-GD-018: Guarder 模块 eBPF Sandbox 静态分析测试

通过 Python 重新实现 Go 的 EBPFSandbox 逻辑来验证沙箱规则的正确性。
"""
import pytest
import re


MAX_LINES = 200
MAX_CODE_BYTES = 16384

BANNED_HELPERS = [
    "bpf_probe_read", "bpf_probe_read_user", "bpf_probe_read_kernel",
    "bpf_probe_read_str", "bpf_send_signal", "bpf_send_signal_thread",
    "bpf_override_return", "bpf_sys_bpf", "bpf_sys_close",
    "bpf_timer_init", "bpf_timer_set_callback", "bpf_timer_start",
    "bpf_timer_cancel", "bpf_task_pt_regs", "bpf_d_path",
    "bpf_snprintf", "bpf_ringbuf_reserve", "bpf_ringbuf_submit",
    "bpf_ringbuf_output", "bpf_map_update_elem", "bpf_map_delete_elem",
    "bpf_redirect", "bpf_redirect_map", "bpf_clone_redirect",
    "bpf_skb_store_bytes", "bpf_xdp_adjust_head", "bpf_xdp_adjust_tail",
    "bpf_xdp_adjust_meta", "bpf_fib_lookup",
]

BANNED_KEYWORDS = [
    "#include", "SEC(", "__attribute__", "asm(", "__asm__",
    "volatile", "register", "extern", "static", "struct {",
    "} __attribute__", "BPF_MAP_TYPE_", ".maps",
]


def validate_sandbox(code: str) -> list[str]:
    violations = []

    if len(code) > MAX_CODE_BYTES:
        violations.append(f"code exceeds maximum size: {len(code)} > {MAX_CODE_BYTES} bytes")

    lines = code.split("\n")
    if len(lines) > MAX_LINES:
        violations.append(f"code exceeds maximum lines: {len(lines)} > {MAX_LINES}")

    for helper in BANNED_HELPERS:
        if helper in code:
            violations.append(f"banned BPF helper used: {helper}")

    for keyword in BANNED_KEYWORDS:
        if keyword in code:
            violations.append(f"banned keyword found: {keyword}")

    if re.search(r"#\s*include", code):
        violations.append("preprocessor #include directives are not allowed")

    if re.search(r"\(\s*void\s*\*\s*\)\s*\d", code):
        violations.append("unsafe pointer cast from integer literal detected")

    if re.search(r"\bwhile\s*\(", code):
        violations.append("while loops are not allowed in eBPF; use bounded for loops or #pragma unroll")

    if re.search(r"\bgoto\s+(?!chain_next\b)\w+", code):
        violations.append("goto statements (except 'goto chain_next') are not allowed")

    return violations


class TestSandboxSafeCode:
    """TC-GD-001: 安全代码应通过沙箱验证"""

    def test_simple_ip_check(self):
        code = """
    if (IP_MATCH(pkt->src_ip, 192, 168, 1, 100)) {
        state->match_count++;
        return XDP_DROP;
    }
"""
        violations = validate_sandbox(code)
        assert len(violations) == 0

    def test_port_range_check(self):
        code = """
    if (pkt->protocol == PKT_PROTO_TCP &&
        pkt->dst_port >= 1 && pkt->dst_port <= 1024) {
        state->drop_count++;
        return XDP_DROP;
    }
"""
        violations = validate_sandbox(code)
        assert len(violations) == 0

    def test_bloom_filter_logic(self):
        code = """
    __u32 hash = ip_hash8(pkt->src_ip);
    __u32 idx = hash / 32;
    __u32 bit = 1u << (hash % 32);
    if (idx < 8 && (state->bloom_bits[idx] & bit)) {
        return XDP_DROP;
    }
"""
        violations = validate_sandbox(code)
        assert len(violations) == 0

    def test_goto_chain_next_allowed(self):
        code = """
    if (pkt->protocol != PKT_PROTO_TCP) {
        goto chain_next;
    }
"""
        violations = validate_sandbox(code)
        assert len(violations) == 0

    def test_counter_increment(self):
        code = """
    state->counters[0]++;
    state->pass_count++;
    goto chain_next;
"""
        violations = validate_sandbox(code)
        assert len(violations) == 0


class TestSandboxBannedHelpers:
    """TC-GD-002: 禁止使用危险 BPF Helper"""

    @pytest.mark.parametrize("helper", BANNED_HELPERS)
    def test_banned_helper(self, helper):
        code = f"    {helper}(ctx);\n"
        violations = validate_sandbox(code)
        assert any(helper in v for v in violations)


class TestSandboxBannedKeywords:
    """TC-GD-003: 禁止使用受限关键字"""

    def test_include_directive(self):
        code = '#include <linux/bpf.h>\n'
        violations = validate_sandbox(code)
        assert len(violations) >= 1

    def test_sec_macro(self):
        code = 'SEC("xdp") int my_prog(struct xdp_md *ctx) {}\n'
        violations = validate_sandbox(code)
        assert any("SEC(" in v for v in violations)

    def test_attribute(self):
        code = 'int x __attribute__((unused));\n'
        violations = validate_sandbox(code)
        assert any("__attribute__" in v for v in violations)

    def test_asm(self):
        code = '    asm("nop");\n'
        violations = validate_sandbox(code)
        assert any("asm(" in v for v in violations)

    def test_volatile(self):
        code = "    volatile int x = 0;\n"
        violations = validate_sandbox(code)
        assert any("volatile" in v for v in violations)

    def test_extern(self):
        code = "    extern int y;\n"
        violations = validate_sandbox(code)
        assert any("extern" in v for v in violations)

    def test_static(self):
        code = "    static int z = 1;\n"
        violations = validate_sandbox(code)
        assert any("static" in v for v in violations)

    def test_map_type(self):
        code = "    BPF_MAP_TYPE_HASH;\n"
        violations = validate_sandbox(code)
        assert any("BPF_MAP_TYPE_" in v for v in violations)

    def test_maps_section(self):
        code = '    } .maps;\n'
        violations = validate_sandbox(code)
        assert any(".maps" in v for v in violations)

    def test_struct_definition(self):
        code = "    struct { int x; } my_struct;\n"
        violations = validate_sandbox(code)
        assert any("struct {" in v for v in violations)


class TestSandboxSizeLimits:
    """TC-GD-004: 代码大小限制"""

    def test_within_line_limit(self):
        code = "\n".join(["    // line"] * 199)
        violations = validate_sandbox(code)
        line_violations = [v for v in violations if "maximum lines" in v]
        assert len(line_violations) == 0

    def test_exceeds_line_limit(self):
        code = "\n".join(["    // line"] * 201)
        violations = validate_sandbox(code)
        line_violations = [v for v in violations if "maximum lines" in v]
        assert len(line_violations) == 1

    def test_within_byte_limit(self):
        code = "x" * (MAX_CODE_BYTES - 1)
        violations = validate_sandbox(code)
        size_violations = [v for v in violations if "maximum size" in v]
        assert len(size_violations) == 0

    def test_exceeds_byte_limit(self):
        code = "x" * (MAX_CODE_BYTES + 1)
        violations = validate_sandbox(code)
        size_violations = [v for v in violations if "maximum size" in v]
        assert len(size_violations) == 1


class TestSandboxLoopDetection:
    """TC-GD-005: 无界循环检测"""

    def test_while_loop_rejected(self):
        code = "    while (1) { }\n"
        violations = validate_sandbox(code)
        assert any("while" in v.lower() for v in violations)

    def test_while_with_condition(self):
        code = "    while (x > 0) { x--; }\n"
        violations = validate_sandbox(code)
        assert any("while" in v.lower() for v in violations)

    def test_goto_non_chain_rejected(self):
        code = "    goto some_label;\n"
        violations = validate_sandbox(code)
        assert any("goto" in v for v in violations)

    def test_goto_chain_next_allowed(self):
        code = "    goto chain_next;\n"
        violations = validate_sandbox(code)
        goto_violations = [v for v in violations if "goto" in v]
        assert len(goto_violations) == 0


class TestSandboxUnsafePointers:
    """TC-GD-006: 不安全指针转换检测"""

    def test_void_ptr_from_literal(self):
        code = "    void *p = (void *)0xdeadbeef;\n"
        violations = validate_sandbox(code)
        assert any("unsafe pointer" in v for v in violations)

    def test_void_ptr_from_zero(self):
        code = "    void *p = (void *)0;\n"
        violations = validate_sandbox(code)
        assert any("unsafe pointer" in v for v in violations)

    def test_safe_ptr_usage(self):
        code = "    struct pkt_context *pkt = bpf_map_lookup_elem(&pkt_ctx_map, &key);\n"
        violations = validate_sandbox(code)
        ptr_violations = [v for v in violations if "unsafe pointer" in v]
        assert len(ptr_violations) == 0


class TestSandboxReport:
    """TC-GD-007: SandboxReport 结构完整性"""

    def test_safe_report(self):
        code = "    state->match_count++;\n"
        violations = validate_sandbox(code)
        report = {
            "safe": len(violations) == 0,
            "violations": violations,
            "code_lines": len(code.split("\n")),
            "code_bytes": len(code),
        }
        assert report["safe"] is True
        assert report["code_lines"] >= 1
        assert report["code_bytes"] > 0

    def test_unsafe_report(self):
        code = "    bpf_probe_read(dst, sz, src);\n"
        violations = validate_sandbox(code)
        report = {
            "safe": len(violations) == 0,
            "violations": violations,
            "code_lines": len(code.split("\n")),
            "code_bytes": len(code),
        }
        assert report["safe"] is False
        assert len(report["violations"]) >= 1
