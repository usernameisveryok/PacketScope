package main

import (
	"fmt"
	"regexp"
	"strings"
)

// EBPFSandbox performs static analysis on agent-generated eBPF code to enforce
// safety constraints before compilation. The kernel verifier provides the final
// guarantee, but catching issues early gives better error messages and prevents
// intentional abuse.
type EBPFSandbox struct {
	maxLines        int
	maxCodeBytes    int
	bannedHelpers   []string
	bannedKeywords  []string
	bannedIncludes  *regexp.Regexp
	unsafePtrPattern *regexp.Regexp
}

func NewEBPFSandbox() *EBPFSandbox {
	return &EBPFSandbox{
		maxLines:    200,
		maxCodeBytes: 16384,
		bannedHelpers: []string{
			"bpf_probe_read",
			"bpf_probe_read_user",
			"bpf_probe_read_kernel",
			"bpf_probe_read_str",
			"bpf_send_signal",
			"bpf_send_signal_thread",
			"bpf_override_return",
			"bpf_sys_bpf",
			"bpf_sys_close",
			"bpf_timer_init",
			"bpf_timer_set_callback",
			"bpf_timer_start",
			"bpf_timer_cancel",
			"bpf_task_pt_regs",
			"bpf_d_path",
			"bpf_snprintf",
			"bpf_ringbuf_reserve",
			"bpf_ringbuf_submit",
			"bpf_ringbuf_output",
			"bpf_map_update_elem",
			"bpf_map_delete_elem",
			"bpf_redirect",
			"bpf_redirect_map",
			"bpf_clone_redirect",
			"bpf_skb_store_bytes",
			"bpf_xdp_adjust_head",
			"bpf_xdp_adjust_tail",
			"bpf_xdp_adjust_meta",
			"bpf_fib_lookup",
		},
		bannedKeywords: []string{
			"#include",
			"SEC(",
			"__attribute__",
			"asm(",
			"__asm__",
			"volatile",
			"register",
			"extern",
			"static",
			"struct {",
			"} __attribute__",
			"BPF_MAP_TYPE_",
			".maps",
		},
		bannedIncludes:    regexp.MustCompile(`#\s*include`),
		unsafePtrPattern:  regexp.MustCompile(`\(\s*void\s*\*\s*\)\s*\d`),
	}
}

// Validate checks the agent-generated code body for safety violations.
// Returns a list of violation descriptions (empty = safe).
func (s *EBPFSandbox) Validate(code string) []string {
	var violations []string

	if len(code) > s.maxCodeBytes {
		violations = append(violations,
			fmt.Sprintf("code exceeds maximum size: %d > %d bytes", len(code), s.maxCodeBytes))
	}

	lines := strings.Split(code, "\n")
	if len(lines) > s.maxLines {
		violations = append(violations,
			fmt.Sprintf("code exceeds maximum lines: %d > %d", len(lines), s.maxLines))
	}

	for _, helper := range s.bannedHelpers {
		if strings.Contains(code, helper) {
			violations = append(violations,
				fmt.Sprintf("banned BPF helper used: %s", helper))
		}
	}

	for _, keyword := range s.bannedKeywords {
		if strings.Contains(code, keyword) {
			violations = append(violations,
				fmt.Sprintf("banned keyword found: %s", keyword))
		}
	}

	if s.bannedIncludes.MatchString(code) {
		violations = append(violations, "preprocessor #include directives are not allowed")
	}

	if s.unsafePtrPattern.MatchString(code) {
		violations = append(violations, "unsafe pointer cast from integer literal detected")
	}

	violations = append(violations, s.checkUnboundedLoops(code)...)

	return violations
}

func (s *EBPFSandbox) checkUnboundedLoops(code string) []string {
	var violations []string

	whilePattern := regexp.MustCompile(`\bwhile\s*\(`)
	if whilePattern.MatchString(code) {
		violations = append(violations,
			"while loops are not allowed in eBPF; use bounded for loops or #pragma unroll")
	}

	gotoPattern := regexp.MustCompile(`\bgoto\s+(?!chain_next\b)\w+`)
	if gotoPattern.MatchString(code) {
		violations = append(violations,
			"goto statements (except 'goto chain_next') are not allowed")
	}

	return violations
}

// SandboxReport provides a human-readable summary of validation results.
type SandboxReport struct {
	Safe       bool     `json:"safe"`
	Violations []string `json:"violations,omitempty"`
	CodeLines  int      `json:"code_lines"`
	CodeBytes  int      `json:"code_bytes"`
}

func (s *EBPFSandbox) Report(code string) SandboxReport {
	violations := s.Validate(code)
	lines := len(strings.Split(code, "\n"))
	return SandboxReport{
		Safe:       len(violations) == 0,
		Violations: violations,
		CodeLines:  lines,
		CodeBytes:  len(code),
	}
}
