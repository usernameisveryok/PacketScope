package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/cilium/ebpf"
)

const (
	MaxProgrammableSlots = 16
	DefaultWorkDir       = "/tmp/packetscope_ebpf"
)

// ProgrammableFilter represents a single agent-generated eBPF filter program.
type ProgrammableFilter struct {
	ID          string    `json:"id"`
	Slot        int       `json:"slot"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	SourceCode  string    `json:"source_code"`
	SourceHash  string    `json:"source_hash"`
	ObjectPath  string    `json:"object_path,omitempty"`
	Status      string    `json:"status"` // "compiling", "loaded", "error", "unloaded"
	Error       string    `json:"error,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	LoadedAt    *time.Time `json:"loaded_at,omitempty"`
	Stats       FilterStats `json:"stats"`
}

type FilterStats struct {
	PacketsProcessed uint64 `json:"packets_processed"`
	PacketsDropped   uint64 `json:"packets_dropped"`
}

// CodegenRequest is the input for agent-driven code generation.
type CodegenRequest struct {
	Intent       string `json:"intent"`
	AnalyzeType  string `json:"analyze_type,omitempty"`
	CustomPrompt string `json:"custom_prompt,omitempty"`
	TargetSlot   int    `json:"target_slot,omitempty"`
}

// CodegenResponse is returned after code generation and optional deployment.
type CodegenResponse struct {
	Success     bool                `json:"success"`
	Filter      *ProgrammableFilter `json:"filter,omitempty"`
	SourceCode  string              `json:"source_code,omitempty"`
	Analysis    string              `json:"analysis,omitempty"`
	Suggestions []string            `json:"suggestions,omitempty"`
	Error       string              `json:"error,omitempty"`
	TokensUsed  int                 `json:"tokens_used,omitempty"`
}

// ProgrammableFilterManager manages the lifecycle of agent-generated eBPF programs.
type ProgrammableFilterManager struct {
	workDir        string
	includePath    string
	filters        map[int]*ProgrammableFilter
	progFilterMap  *ebpf.Map
	filterModeMap  *ebpf.Map
	pktCtxMap      *ebpf.Map
	aiGenerator    *AIFilterGenerator
	sandbox        *EBPFSandbox
	mu             sync.RWMutex
}

func NewProgrammableFilterManager(
	progFilterMap, filterModeMap, pktCtxMap *ebpf.Map,
	aiGenerator *AIFilterGenerator,
	includePath string,
) *ProgrammableFilterManager {
	workDir := DefaultWorkDir
	os.MkdirAll(workDir, 0750)

	return &ProgrammableFilterManager{
		workDir:       workDir,
		includePath:   includePath,
		filters:       make(map[int]*ProgrammableFilter),
		progFilterMap: progFilterMap,
		filterModeMap: filterModeMap,
		pktCtxMap:     pktCtxMap,
		aiGenerator:   aiGenerator,
		sandbox:       NewEBPFSandbox(),
	}
}

// SetFilterMode toggles between legacy (0) and programmable (1) filter modes.
func (m *ProgrammableFilterManager) SetFilterMode(programmable bool) error {
	var mode uint32
	if programmable {
		mode = 1
	}
	var key uint32
	return m.filterModeMap.Update(&key, &mode, ebpf.UpdateAny)
}

// GetFilterMode returns true if programmable filter mode is active.
func (m *ProgrammableFilterManager) GetFilterMode() bool {
	var key, mode uint32
	if err := m.filterModeMap.Lookup(&key, &mode); err != nil {
		return false
	}
	return mode == 1
}

// GenerateFilter uses the AI agent to generate eBPF filter code from natural language.
func (m *ProgrammableFilterManager) GenerateFilter(
	objs *connTrackerObjects,
	req CodegenRequest,
) (*CodegenResponse, error) {
	if err := m.aiGenerator.ValidateConfig(); err != nil {
		return &CodegenResponse{Success: false, Error: fmt.Sprintf("AI not configured: %v", err)}, nil
	}

	systemPrompt := m.buildCodegenSystemPrompt()
	userPrompt := m.buildCodegenUserPrompt(objs, req)

	aiResp, err := m.aiGenerator.callAIModel(systemPrompt, userPrompt, 4000, false)
	if err != nil {
		return &CodegenResponse{Success: false, Error: fmt.Sprintf("AI API call failed: %v", err)}, nil
	}

	parsed, err := m.parseCodegenResponse(aiResp)
	if err != nil {
		return &CodegenResponse{Success: false, Error: fmt.Sprintf("response parse failed: %v", err)}, nil
	}

	return parsed, nil
}

// CompileAndLoad compiles eBPF C source and loads it into the specified tail-call slot.
func (m *ProgrammableFilterManager) CompileAndLoad(sourceCode string, slot int, name, description string) (*ProgrammableFilter, error) {
	if slot < 0 || slot >= MaxProgrammableSlots {
		return nil, fmt.Errorf("slot %d out of range [0, %d)", slot, MaxProgrammableSlots)
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if violations := m.sandbox.Validate(sourceCode); len(violations) > 0 {
		return nil, fmt.Errorf("sandbox violations: %s", strings.Join(violations, "; "))
	}

	hash := sha256.Sum256([]byte(sourceCode))
	hashStr := hex.EncodeToString(hash[:8])

	filter := &ProgrammableFilter{
		ID:          fmt.Sprintf("pf_%s_%d", hashStr, slot),
		Slot:        slot,
		Name:        name,
		Description: description,
		SourceCode:  sourceCode,
		SourceHash:  hex.EncodeToString(hash[:]),
		Status:      "compiling",
		CreatedAt:   time.Now(),
	}

	wrappedSource := m.wrapWithTemplate(sourceCode, slot)

	srcPath := filepath.Join(m.workDir, fmt.Sprintf("filter_%s.c", filter.ID))
	objPath := filepath.Join(m.workDir, fmt.Sprintf("filter_%s.o", filter.ID))
	if err := os.WriteFile(srcPath, []byte(wrappedSource), 0640); err != nil {
		return nil, fmt.Errorf("failed to write source: %w", err)
	}

	if err := m.compile(srcPath, objPath); err != nil {
		filter.Status = "error"
		filter.Error = err.Error()
		return filter, fmt.Errorf("compilation failed: %w", err)
	}
	filter.ObjectPath = objPath

	if err := m.loadIntoSlot(objPath, slot); err != nil {
		filter.Status = "error"
		filter.Error = err.Error()
		return filter, fmt.Errorf("loading failed: %w", err)
	}

	now := time.Now()
	filter.LoadedAt = &now
	filter.Status = "loaded"

	if prev, ok := m.filters[slot]; ok {
		log.Printf("replacing filter in slot %d: %s -> %s", slot, prev.ID, filter.ID)
	}
	m.filters[slot] = filter

	log.Printf("loaded programmable filter %q into slot %d (hash=%s)", name, slot, hashStr)
	return filter, nil
}

// UnloadSlot removes the program from a tail-call slot.
func (m *ProgrammableFilterManager) UnloadSlot(slot int) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if slot < 0 || slot >= MaxProgrammableSlots {
		return fmt.Errorf("slot %d out of range", slot)
	}

	key := uint32(slot)
	if err := m.progFilterMap.Delete(&key); err != nil {
		return fmt.Errorf("failed to remove program from slot %d: %w", slot, err)
	}

	if f, ok := m.filters[slot]; ok {
		f.Status = "unloaded"
		delete(m.filters, slot)
	}

	log.Printf("unloaded programmable filter from slot %d", slot)
	return nil
}

// ListFilters returns all currently loaded programmable filters.
func (m *ProgrammableFilterManager) ListFilters() []*ProgrammableFilter {
	m.mu.RLock()
	defer m.mu.RUnlock()

	result := make([]*ProgrammableFilter, 0, len(m.filters))
	for _, f := range m.filters {
		result = append(result, f)
	}
	return result
}

// GetFilter returns a filter by slot.
func (m *ProgrammableFilterManager) GetFilter(slot int) (*ProgrammableFilter, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	f, ok := m.filters[slot]
	return f, ok
}

func (m *ProgrammableFilterManager) compile(srcPath, objPath string) error {
	args := []string{
		"-O2", "-g", "-Wall", "-Werror",
		"-target", "bpf",
		"-D__TARGET_ARCH_x86",
		fmt.Sprintf("-I%s", m.includePath),
		"-c", srcPath,
		"-o", objPath,
	}

	cmd := exec.Command("clang", args...)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("clang: %s\n%s", err, stderr.String())
	}
	return nil
}

func (m *ProgrammableFilterManager) loadIntoSlot(objPath string, slot int) error {
	spec, err := ebpf.LoadCollectionSpec(objPath)
	if err != nil {
		return fmt.Errorf("load spec: %w", err)
	}

	// Rewrite map references to share maps with the main program
	for name, mapSpec := range spec.Maps {
		switch name {
		case "pkt_ctx_map":
			mapSpec.Contents = nil
			spec.Maps[name] = mapSpec
		case "prog_filter_map":
			mapSpec.Contents = nil
			spec.Maps[name] = mapSpec
		}
	}

	mapReplacements := map[string]*ebpf.Map{
		"pkt_ctx_map":     m.pktCtxMap,
		"prog_filter_map": m.progFilterMap,
	}

	collOpts := ebpf.CollectionOptions{
		MapReplacements: mapReplacements,
	}

	coll, err := ebpf.NewCollectionWithOptions(spec, collOpts)
	if err != nil {
		return fmt.Errorf("new collection: %w", err)
	}

	var prog *ebpf.Program
	for _, p := range coll.Programs {
		prog = p
		break
	}
	if prog == nil {
		coll.Close()
		return fmt.Errorf("no program found in compiled object")
	}

	key := uint32(slot)
	if err := m.progFilterMap.Update(&key, prog, ebpf.UpdateAny); err != nil {
		coll.Close()
		return fmt.Errorf("update prog_filter_map slot %d: %w", slot, err)
	}

	return nil
}

func (m *ProgrammableFilterManager) wrapWithTemplate(agentCode string, slot int) string {
	nextSlot := slot + 1
	return fmt.Sprintf(`// Auto-generated programmable filter for slot %d
// DO NOT EDIT - generated by PacketScope Agent eBPF Codegen

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

struct pkt_context {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8  protocol;
    __u8  tcp_flags;
    __u8  icmp_type;
    __u8  icmp_code;
    __u32 pkt_len;
    __u64 timestamp;
    __u32 ifindex;
    __u32 __reserved[3];
};

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct pkt_context);
} pkt_ctx_map SEC(".maps");

struct {
    __uint(type, BPF_MAP_TYPE_PROG_ARRAY);
    __uint(max_entries, 16);
    __type(key, __u32);
    __type(value, __u32);
} prog_filter_map SEC(".maps");

struct filter_state {
    __u64 match_count;
    __u64 drop_count;
    __u64 pass_count;
    __u64 counters[13];
    __u64 timestamps[32];
    __u32 bloom_bits[8];
};

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct filter_state);
} filter_state_map SEC(".maps");

#define PKT_PROTO_ICMP   1
#define PKT_PROTO_TCP    6
#define PKT_PROTO_UDP   17
#define PKT_TCP_FIN  0x01
#define PKT_TCP_SYN  0x02
#define PKT_TCP_RST  0x04
#define PKT_TCP_PSH  0x08
#define PKT_TCP_ACK  0x10
#define PKT_TCP_URG  0x20

#define IP_BYTE(ip, n) ((__u8)(((ip) >> ((n) * 8)) & 0xFF))
#define IP_MATCH(ip, a, b, c, d) \
    ((ip) == ((__u32)(a) | (__u32)(b) << 8 | (__u32)(c) << 16 | (__u32)(d) << 24))
#define IP_IN_SUBNET24(ip, a, b, c) \
    (((ip) & 0x00FFFFFF) == ((__u32)(a) | (__u32)(b) << 8 | (__u32)(c) << 16))

static __always_inline __u32 ip_hash8(__u32 ip) {
    return (ip * 2654435761u) >> 24;
}
static __always_inline __u32 ip_hash5(__u32 ip) {
    return (ip * 2654435761u) >> 27;
}

SEC("xdp")
int agent_filter_%d(struct xdp_md *ctx) {
    __u32 key = 0;
    struct pkt_context *pkt = bpf_map_lookup_elem(&pkt_ctx_map, &key);
    if (!pkt) goto chain_next;

    struct filter_state *state = bpf_map_lookup_elem(&filter_state_map, &key);
    if (!state) goto chain_next;

    // ====== AGENT-GENERATED LOGIC START ======
    %s
    // ====== AGENT-GENERATED LOGIC END ======

chain_next:
    // Chain to next filter in the pipeline
    bpf_tail_call(ctx, &prog_filter_map, %d);
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";
`, slot, slot, agentCode, nextSlot)
}

func (m *ProgrammableFilterManager) buildCodegenSystemPrompt() string {
	return `You are a senior Linux kernel eBPF engineer generating XDP packet filter logic.
You write C code that runs INSIDE an eBPF XDP program. The code has access to:

VARIABLES (already declared, do NOT redeclare):
  struct pkt_context *pkt;   // packet metadata (src_ip, dst_ip, src_port, dst_port, protocol, tcp_flags, icmp_type, icmp_code, pkt_len, timestamp)
  struct filter_state *state; // per-CPU persistent state (match_count, drop_count, pass_count, counters[13], timestamps[32], bloom_bits[8])

MACROS:
  PKT_PROTO_TCP (6), PKT_PROTO_UDP (17), PKT_PROTO_ICMP (1)
  PKT_TCP_SYN, PKT_TCP_ACK, PKT_TCP_FIN, PKT_TCP_RST, PKT_TCP_PSH, PKT_TCP_URG
  IP_MATCH(ip, a, b, c, d) - match IP against a.b.c.d
  IP_IN_SUBNET24(ip, a, b, c) - match /24 subnet
  ip_hash8(ip) - hash IP to 0-255 bucket
  ip_hash5(ip) - hash IP to 0-31 bucket

RETURN:
  return XDP_DROP;  // drop the packet
  goto chain_next;  // pass to next filter / allow

SAFETY RULES - YOU MUST FOLLOW:
1. Do NOT use bpf_probe_read, bpf_send_signal, bpf_override_return, bpf_ktime_get_boot_ns
2. Do NOT declare new maps or structs
3. Do NOT include any headers
4. Do NOT use loops with variable bounds (use bounded #pragma unroll or fixed iteration)
5. Only use: bpf_ktime_get_ns(), bpf_printk(), arithmetic, comparisons, bitwise ops
6. Maximum 200 lines of code

OUTPUT FORMAT - respond with ONLY valid JSON:
{
  "analysis": "Brief description of what this filter does and why",
  "source_code": "The C code to insert (NO headers, NO function signatures, just the logic)",
  "filter_name": "short_snake_case_name",
  "description": "One-line description for display",
  "suggestions": ["Any additional defense recommendations"]
}

CRITICAL: source_code must be ONLY the filter logic body. No #include, no SEC(), no function declarations.`
}

func (m *ProgrammableFilterManager) buildCodegenUserPrompt(objs *connTrackerObjects, req CodegenRequest) string {
	var prompt strings.Builder
	prompt.WriteString(fmt.Sprintf("Generate an eBPF programmable filter for: %s\n\n", req.Intent))

	if req.CustomPrompt != "" {
		prompt.WriteString(fmt.Sprintf("Additional requirements: %s\n\n", req.CustomPrompt))
	}

	summary, err := m.aiGenerator.generateConnectionSummary(objs, true, true, true)
	if err == nil && summary != "" {
		prompt.WriteString("Current network traffic context:\n")
		if len(summary) > 3000 {
			summary = summary[:3000] + "\n... (truncated)"
		}
		prompt.WriteString(summary)
	}

	return prompt.String()
}

func (m *ProgrammableFilterManager) parseCodegenResponse(resp *AITextResponse) (*CodegenResponse, error) {
	content := strings.TrimSpace(resp.Content)

	if strings.HasPrefix(content, "```json") {
		content = strings.TrimPrefix(content, "```json")
	}
	if strings.HasPrefix(content, "```") {
		content = strings.TrimPrefix(content, "```")
	}
	if strings.HasSuffix(content, "```") {
		content = strings.TrimSuffix(content, "```")
	}
	content = strings.TrimSpace(content)

	var parsed struct {
		Analysis    string   `json:"analysis"`
		SourceCode  string   `json:"source_code"`
		FilterName  string   `json:"filter_name"`
		Description string   `json:"description"`
		Suggestions []string `json:"suggestions"`
	}

	if err := json.Unmarshal([]byte(content), &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse AI response: %w\nraw: %s", err, content)
	}

	filter := &ProgrammableFilter{
		Name:        parsed.FilterName,
		Description: parsed.Description,
		SourceCode:  parsed.SourceCode,
		Status:      "generated",
		CreatedAt:   time.Now(),
	}

	return &CodegenResponse{
		Success:     true,
		Filter:      filter,
		SourceCode:  parsed.SourceCode,
		Analysis:    parsed.Analysis,
		Suggestions: parsed.Suggestions,
		TokensUsed:  resp.TokensUsed,
	}, nil
}
