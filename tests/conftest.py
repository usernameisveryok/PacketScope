import os
import sys
import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

sys.path.insert(0, os.path.join(PROJECT_ROOT, "modules", "Analyzer", "Monitor"))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "modules", "Tracer"))

GUARDER_DIR = os.path.join(PROJECT_ROOT, "modules", "Guarder")
BPF_DIR = os.path.join(GUARDER_DIR, "bpf")
GO_CMD_DIR = os.path.join(GUARDER_DIR, "cmd", "conn-tracker")
GO_PKG_DIR = os.path.join(GUARDER_DIR, "pkg", "bpf")
FRONTEND_DIR = os.path.join(PROJECT_ROOT, "src")


@pytest.fixture
def project_root():
    return PROJECT_ROOT


@pytest.fixture
def guarder_dir():
    return GUARDER_DIR


@pytest.fixture
def bpf_dir():
    return BPF_DIR


@pytest.fixture
def go_cmd_dir():
    return GO_CMD_DIR


@pytest.fixture
def frontend_dir():
    return FRONTEND_DIR
