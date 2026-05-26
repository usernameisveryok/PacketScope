"""
TC-FE-001 ~ TC-FE-015: 前端模块结构与配置完整性测试
"""
import pytest
import os
import json

PROJECT_ROOT = os.path.join(
    os.path.dirname(__file__), "..", ".."
)
SRC_DIR = os.path.join(PROJECT_ROOT, "src")


class TestPackageJson:
    """TC-FE-001: package.json 依赖配置"""

    def test_exists(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        assert os.path.exists(path)

    def test_valid_json(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        with open(path, "r") as f:
            data = json.load(f)
        assert "name" in data
        assert "dependencies" in data

    def test_react_dependency(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        with open(path, "r") as f:
            data = json.load(f)
        deps = data.get("dependencies", {})
        assert "react" in deps
        assert "react-dom" in deps

    def test_antd_dependency(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        with open(path, "r") as f:
            data = json.load(f)
        deps = data.get("dependencies", {})
        assert "antd" in deps

    def test_zustand_dependency(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        with open(path, "r") as f:
            data = json.load(f)
        deps = data.get("dependencies", {})
        assert "zustand" in deps

    def test_build_scripts(self):
        path = os.path.join(PROJECT_ROOT, "package.json")
        with open(path, "r") as f:
            data = json.load(f)
        scripts = data.get("scripts", {})
        assert "dev" in scripts
        assert "build" in scripts


class TestFrontendDirectoryStructure:
    """TC-FE-002: 前端目录结构完整性"""

    def test_src_exists(self):
        assert os.path.isdir(SRC_DIR)

    def test_pages_dir(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "pages"))

    def test_analyzer_pages(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "pages", "Analyzer"))

    def test_guarder_pages(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "pages", "Guarder"))

    def test_tracer_pages(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "pages", "Tracer"))

    def test_stores_dir(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "stores"))

    def test_components_dir(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "components"))

    def test_locales_dir(self):
        assert os.path.isdir(os.path.join(SRC_DIR, "locales"))


class TestStoreFiles:
    """TC-FE-003: Zustand Store 文件"""

    def test_use_store_exists(self):
        store_dir = os.path.join(SRC_DIR, "stores")
        files = os.listdir(store_dir)
        store_files = [f for f in files if f.endswith(".ts") or f.endswith(".tsx")]
        assert len(store_files) > 0

    def test_store_exports_zustand(self):
        store_dir = os.path.join(SRC_DIR, "stores")
        found_zustand = False
        for f in os.listdir(store_dir):
            if f.endswith(".ts") or f.endswith(".tsx"):
                with open(os.path.join(store_dir, f), "r") as fh:
                    content = fh.read()
                    if "zustand" in content:
                        found_zustand = True
                        break
        assert found_zustand


class TestI18nFiles:
    """TC-FE-004: 国际化文件"""

    def test_en_locale_exists(self):
        locales_dir = os.path.join(SRC_DIR, "locales")
        files = os.listdir(locales_dir)
        en_files = [f for f in files if "en" in f.lower()]
        assert len(en_files) > 0

    def test_zh_locale_exists(self):
        locales_dir = os.path.join(SRC_DIR, "locales")
        files = os.listdir(locales_dir)
        zh_files = [f for f in files if "zh" in f.lower()]
        assert len(zh_files) > 0


class TestComponentFiles:
    """TC-FE-005: 关键组件文件存在性"""

    def test_analyzer_components(self):
        analyzer_dir = os.path.join(SRC_DIR, "pages", "Analyzer")
        entries = os.listdir(analyzer_dir)
        # Components may be in subdirectories or as .tsx files
        component_count = sum(
            1 for e in entries
            if e.endswith(".tsx") or os.path.isdir(os.path.join(analyzer_dir, e))
        )
        assert component_count >= 3

    def test_guarder_components(self):
        guarder_dir = os.path.join(SRC_DIR, "pages", "Guarder")
        entries = os.listdir(guarder_dir)
        component_count = sum(
            1 for e in entries
            if e.endswith(".tsx") or os.path.isdir(os.path.join(guarder_dir, e))
        )
        assert component_count >= 3

    def test_tracer_components(self):
        tracer_dir = os.path.join(SRC_DIR, "pages", "Tracer")
        files = os.listdir(tracer_dir)
        tsx_files = [f for f in files if f.endswith(".tsx")]
        assert len(tsx_files) >= 3


class TestViteConfig:
    """TC-FE-006: Vite 构建配置"""

    def test_vite_config_exists(self):
        config_files = ["vite.config.ts", "vite.config.js"]
        found = any(os.path.exists(os.path.join(PROJECT_ROOT, f)) for f in config_files)
        assert found

    def test_tsconfig_exists(self):
        assert os.path.exists(os.path.join(PROJECT_ROOT, "tsconfig.json"))


class TestTailwindConfig:
    """TC-FE-007: TailwindCSS 配置"""

    def test_tailwind_configured(self):
        possible_files = [
            "tailwind.config.js", "tailwind.config.ts",
            "tailwind.config.mjs", "tailwind.config.cjs",
            "postcss.config.js", "postcss.config.mjs",
        ]
        found = any(os.path.exists(os.path.join(PROJECT_ROOT, f)) for f in possible_files)
        # TailwindCSS 4 may use CSS-based config
        if not found:
            css_files = []
            for root, dirs, files in os.walk(SRC_DIR):
                for f in files:
                    if f.endswith(".css"):
                        css_files.append(os.path.join(root, f))
                break  # only top level
            for css_file in css_files:
                with open(css_file, "r") as fh:
                    if "tailwind" in fh.read().lower():
                        found = True
                        break
        assert found
