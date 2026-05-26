"""
TC-INT-001 ~ TC-INT-010: 项目级集成完整性测试

验证跨模块依赖、配置一致性、文件结构等。
"""
import pytest
import os
import json
import re

PROJECT_ROOT = os.path.join(
    os.path.dirname(__file__), "..", ".."
)


class TestProjectStructure:
    """TC-INT-001: 项目顶层目录结构"""

    def test_modules_dir(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "modules"))

    def test_analyzer_module(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "modules", "Analyzer"))

    def test_tracer_module(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "modules", "Tracer"))

    def test_guarder_module(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "modules", "Guarder"))

    def test_src_dir(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "src"))

    def test_docs_dir(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "docs"))


class TestDependencyFiles:
    """TC-INT-002: 依赖文件完整性"""

    def test_analyzer_requirements(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Analyzer", "Monitor", "requirements.txt")
        assert os.path.exists(path)
        with open(path, "r") as f:
            content = f.read()
        assert "Flask" in content or "flask" in content

    def test_tracer_requirements(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Tracer", "requirements.txt")
        assert os.path.exists(path)
        with open(path, "r") as f:
            content = f.read()
        assert "Flask" in content or "flask" in content

    def test_guarder_go_mod(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "go.mod")
        assert os.path.exists(path)
        with open(path, "r") as f:
            content = f.read()
        assert "cilium/ebpf" in content

    def test_frontend_package_json(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        assert os.path.exists(path)


class TestGuarderGoModDeps:
    """TC-INT-003: Guarder Go 依赖版本"""

    def test_go_version(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "go.mod")
        with open(path, "r") as f:
            content = f.read()
        match = re.search(r"go\s+(\d+\.\d+)", content)
        assert match is not None
        major, minor = match.group(1).split(".")
        assert int(major) >= 1
        assert int(minor) >= 21

    def test_cilium_ebpf_version(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "go.mod")
        with open(path, "r") as f:
            content = f.read()
        assert "cilium/ebpf" in content

    def test_golang_sys(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "go.mod")
        with open(path, "r") as f:
            content = f.read()
        assert "golang.org/x/sys" in content


class TestBPFIncludeFiles:
    """TC-INT-004: BPF 头文件依赖"""

    def test_include_dir_exists(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "include")
        assert os.path.isdir(path)

    def test_vmlinux_header(self):
        include_dir = os.path.join(PROJECT_ROOT, "modules", "Guarder", "include")
        found = False
        for root, dirs, files in os.walk(include_dir):
            for f in files:
                if "vmlinux" in f:
                    found = True
                    break
            if found:
                break
        assert found

    def test_bpf_dir(self):
        assert os.path.isdir(os.path.join(PROJECT_ROOT, "modules", "Guarder", "bpf"))

    def test_conn_tracker_c(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "bpf", "conn_tracker.c")
        assert os.path.exists(path)

    def test_filter_template_h(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "bpf", "filter_template.h")
        assert os.path.exists(path)


class TestGoGeneratedFiles:
    """TC-INT-005: Go 生成文件存在性"""

    def test_bpfel_generated(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "cmd", "conn-tracker", "conntracker_bpfel.go")
        assert os.path.exists(path)

    def test_bpfeb_generated(self):
        path = os.path.join(PROJECT_ROOT, "modules", "Guarder", "cmd", "conn-tracker", "conntracker_bpfeb.go")
        assert os.path.exists(path)

    def test_generated_files_match(self):
        bpfel = os.path.join(PROJECT_ROOT, "modules", "Guarder", "cmd", "conn-tracker", "conntracker_bpfel.go")
        bpfeb = os.path.join(PROJECT_ROOT, "modules", "Guarder", "cmd", "conn-tracker", "conntracker_bpfeb.go")
        with open(bpfel, "r") as f:
            bpfel_content = f.read()
        with open(bpfeb, "r") as f:
            bpfeb_content = f.read()
        # Both should define the same types
        assert "connTrackerObjects" in bpfel_content
        assert "connTrackerObjects" in bpfeb_content


class TestAPIConsistency:
    """TC-INT-006: 前后端 API 端点一致性"""

    def test_frontend_has_api_constants(self):
        constants_dir = os.path.join(PROJECT_ROOT, "src", "constants")
        if not os.path.isdir(constants_dir):
            pytest.skip("No constants directory")
        found_api = False
        for f in os.listdir(constants_dir):
            filepath = os.path.join(constants_dir, f)
            if os.path.isfile(filepath):
                with open(filepath, "r") as fh:
                    content = fh.read()
                    if "/api/" in content:
                        found_api = True
                        break
        assert found_api


class TestDocumentation:
    """TC-INT-007: 文档文件"""

    def test_slides_exist(self):
        docs_dir = os.path.join(PROJECT_ROOT, "docs")
        if not os.path.isdir(docs_dir):
            pytest.skip("No docs directory")
        files = os.listdir(docs_dir)
        html_files = [f for f in files if f.endswith(".html")]
        assert len(html_files) >= 1

    def test_slides_content(self):
        docs_dir = os.path.join(PROJECT_ROOT, "docs")
        html_files = [f for f in os.listdir(docs_dir) if f.endswith(".html")]
        if not html_files:
            pytest.skip("No HTML docs")
        with open(os.path.join(docs_dir, html_files[0]), "r") as f:
            content = f.read()
        assert "PacketScope" in content or "eBPF" in content


class TestSkillFiles:
    """TC-INT-008: Skill 文件完整性"""

    def test_guarder_skill_exists(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "SKILL.md")
        assert os.path.exists(path)

    def test_guarder_client_exists(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        assert os.path.exists(path)

    def test_guarder_client_imports(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "class GuarderClient" in content
        assert "def get_connections" in content
        assert "def list_filters" in content


class TestGuarderClientSkill:
    """TC-INT-009: GuarderClient API 覆盖"""

    def test_connection_methods(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "def get_connections" in content
        assert "def get_icmp_entries" in content
        assert "def get_stats" in content

    def test_filter_methods(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "def list_filters" in content
        assert "def create_filter" in content
        assert "def update_filter" in content
        assert "def delete_filter" in content
        assert "def enable_filter" in content
        assert "def disable_filter" in content

    def test_ai_methods(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "def get_ai_status" in content
        assert "def get_ai_config" in content
        assert "def ai_generate_filters" in content
        assert "def ai_analyze" in content

    def test_pcap_method(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "def analyze_pcap" in content

    def test_convenience_functions(self):
        path = os.path.join(PROJECT_ROOT, "skills", "guarder", "guarder_client.py")
        with open(path, "r") as f:
            content = f.read()
        assert "def block_ip" in content
        assert "def block_port" in content
