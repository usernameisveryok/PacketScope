"""
TC-GD-008 ~ TC-GD-015: Guarder 模块 eBPF Codegen 模板与生成逻辑测试
"""
import pytest
import re
import os


GUARDER_DIR = os.path.join(
    os.path.dirname(__file__), "..", "..", "modules", "Guarder"
)
CODEGEN_FILE = os.path.join(GUARDER_DIR, "cmd", "conn-tracker", "ebpf_codegen.go")


def read_codegen_source() -> str:
    with open(CODEGEN_FILE, "r") as f:
        return f.read()


class TestCodegenConstants:
    """TC-GD-008: Codegen 常量定义"""

    def test_max_slots(self):
        src = read_codegen_source()
        assert "MaxProgrammableSlots = 16" in src

    def test_default_workdir(self):
        src = read_codegen_source()
        assert "DefaultWorkDir" in src
        assert "/tmp/packetscope_ebpf" in src


class TestTemplateWrapping:
    """TC-GD-009: wrapWithTemplate 模板生成验证"""

    def test_template_contains_vmlinux(self):
        src = read_codegen_source()
        assert '"vmlinux.h"' in src

    def test_template_contains_bpf_helpers(self):
        src = read_codegen_source()
        assert "bpf/bpf_helpers.h" in src
        assert "bpf/bpf_endian.h" in src

    def test_template_contains_pkt_context(self):
        src = read_codegen_source()
        assert "struct pkt_context {" in src
        assert "src_ip" in src
        assert "dst_ip" in src
        assert "src_port" in src
        assert "dst_port" in src
        assert "protocol" in src
        assert "tcp_flags" in src

    def test_template_contains_filter_state(self):
        src = read_codegen_source()
        assert "struct filter_state {" in src
        assert "match_count" in src
        assert "drop_count" in src
        assert "pass_count" in src
        assert "counters[13]" in src
        assert "bloom_bits[8]" in src

    def test_template_contains_maps(self):
        src = read_codegen_source()
        assert "pkt_ctx_map" in src
        assert "prog_filter_map" in src
        assert "filter_state_map" in src

    def test_template_contains_macros(self):
        src = read_codegen_source()
        assert "PKT_PROTO_ICMP" in src
        assert "PKT_PROTO_TCP" in src
        assert "PKT_PROTO_UDP" in src
        assert "PKT_TCP_SYN" in src
        assert "PKT_TCP_ACK" in src
        assert "IP_MATCH" in src
        assert "IP_IN_SUBNET24" in src

    def test_template_contains_hash_helpers(self):
        src = read_codegen_source()
        assert "ip_hash8" in src
        assert "ip_hash5" in src

    def test_template_contains_tail_call(self):
        src = read_codegen_source()
        assert "bpf_tail_call" in src
        assert "chain_next" in src

    def test_template_has_agent_code_marker(self):
        src = read_codegen_source()
        assert "AGENT-GENERATED LOGIC START" in src
        assert "AGENT-GENERATED LOGIC END" in src

    def test_template_gpl_license(self):
        src = read_codegen_source()
        assert '"GPL"' in src


class TestCodegenSystemPrompt:
    """TC-GD-010: buildCodegenSystemPrompt 系统提示词验证"""

    def test_prompt_contains_variables(self):
        src = read_codegen_source()
        assert "struct pkt_context *pkt" in src
        assert "struct filter_state *state" in src

    def test_prompt_contains_safety_rules(self):
        src = read_codegen_source()
        assert "Do NOT use bpf_probe_read" in src
        assert "Do NOT declare new maps" in src
        assert "Do NOT include any headers" in src
        assert "Maximum 200 lines" in src

    def test_prompt_specifies_json_format(self):
        src = read_codegen_source()
        assert '"analysis"' in src
        assert '"source_code"' in src
        assert '"filter_name"' in src
        assert '"suggestions"' in src


class TestCodegenResponseParsing:
    """TC-GD-011: parseCodegenResponse JSON 解析结构"""

    def test_response_struct_fields(self):
        src = read_codegen_source()
        assert "Analysis" in src
        assert "SourceCode" in src
        assert "FilterName" in src
        assert "Description" in src
        assert "Suggestions" in src

    def test_json_cleanup_logic(self):
        src = read_codegen_source()
        assert '```json' in src
        assert '```' in src


class TestProgrammableFilterStruct:
    """TC-GD-012: ProgrammableFilter 结构体字段"""

    def test_required_fields(self):
        src = read_codegen_source()
        assert '"id"' in src
        assert '"slot"' in src
        assert '"name"' in src
        assert '"description"' in src
        assert '"source_code"' in src
        assert '"source_hash"' in src
        assert '"status"' in src

    def test_status_values(self):
        src = read_codegen_source()
        assert '"compiling"' in src
        assert '"loaded"' in src
        assert '"error"' in src
        assert '"unloaded"' in src


class TestCompileFunction:
    """TC-GD-013: compile 函数编译器参数"""

    def test_clang_flags(self):
        src = read_codegen_source()
        assert '"-O2"' in src
        assert '"-g"' in src
        assert '"-Wall"' in src
        assert '"-Werror"' in src
        assert '"-target", "bpf"' in src

    def test_target_arch(self):
        src = read_codegen_source()
        assert "__TARGET_ARCH_x86" in src


class TestSlotManagement:
    """TC-GD-014: 槽位管理逻辑"""

    def test_slot_range_check(self):
        src = read_codegen_source()
        assert "slot < 0 || slot >= MaxProgrammableSlots" in src

    def test_slot_delete_logic(self):
        src = read_codegen_source()
        assert "progFilterMap.Delete" in src

    def test_map_replacements(self):
        src = read_codegen_source()
        assert "MapReplacements" in src
        assert '"pkt_ctx_map"' in src
        assert '"prog_filter_map"' in src


class TestFilterModeToggle:
    """TC-GD-015: SetFilterMode/GetFilterMode 切换逻辑"""

    def test_set_mode_function(self):
        src = read_codegen_source()
        assert "func (m *ProgrammableFilterManager) SetFilterMode" in src

    def test_get_mode_function(self):
        src = read_codegen_source()
        assert "func (m *ProgrammableFilterManager) GetFilterMode" in src

    def test_mode_values(self):
        src = read_codegen_source()
        assert "mode = 1" in src  # programmable mode
