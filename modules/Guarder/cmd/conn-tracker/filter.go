package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"

	"github.com/cilium/ebpf"
)

// TCP flag constants
const (
	TCPFlagFIN = 0x01
	TCPFlagSYN = 0x02
	TCPFlagRST = 0x04
	TCPFlagPSH = 0x08
	TCPFlagACK = 0x10
	TCPFlagURG = 0x20
	
	// Maximum number of filter rules (must match BPF map size)
	MaxFilterRules = 32
)

// Enhanced FilterRule for multi-protocol filtering
type FilterRule struct {
	ID       uint32 `json:"id"`
	SrcIP    string `json:"src_ip"`    // Source IP (empty = any)
	DstIP    string `json:"dst_ip"`    // Destination IP (empty = any)  
	SrcPort  uint16 `json:"src_port"`  // Source port (0 = any)
	DstPort  uint16 `json:"dst_port"`  // Destination port (0 = any)
	Protocol string `json:"protocol"`  // Protocol: "tcp", "udp", "icmp", or "any"
	Action   string `json:"action"`    // Action: "allow" or "drop"
	Enabled  bool   `json:"enabled"`   // Rule enabled/disabled
	RuleType string `json:"rule_type"` // "basic", "icmp", "tcp", "udp"
	Comment  string `json:"comment"`   // Optional comment
	
	// ICMP specific fields
	ICMPType *uint8 `json:"icmp_type,omitempty"` // ICMP type (null = any)
	ICMPCode *uint8 `json:"icmp_code,omitempty"` // ICMP code (null = any)
	
	// TCP specific fields
	TCPFlags     *uint8 `json:"tcp_flags,omitempty"`      // TCP flags to match
	TCPFlagsMask *uint8 `json:"tcp_flags_mask,omitempty"` // TCP flags mask
	
	// Inner packet filtering (for ICMP error messages)
	InnerSrcIP    string `json:"inner_src_ip,omitempty"`    // Inner source IP
	InnerDstIP    string `json:"inner_dst_ip,omitempty"`    // Inner destination IP
	InnerProtocol string `json:"inner_protocol,omitempty"` // Inner protocol
}

// Helper function to parse TCP flags from string
func parseTCPFlags(flagStr string) (uint8, error) {
	if flagStr == "" || flagStr == "any" {
		return 0, nil
	}
	
	var flags uint8
	parts := strings.Split(strings.ToUpper(flagStr), "|")
	
	for _, part := range parts {
		switch strings.TrimSpace(part) {
		case "FIN":
			flags |= TCPFlagFIN
		case "SYN":
			flags |= TCPFlagSYN
		case "RST":
			flags |= TCPFlagRST
		case "PSH":
			flags |= TCPFlagPSH
		case "ACK":
			flags |= TCPFlagACK
		case "URG":
			flags |= TCPFlagURG
		default:
			return 0, fmt.Errorf("unknown TCP flag: %s", part)
		}
	}
	
	return flags, nil
}

// Note: connTrackerFilterRule is already defined in generated files

// FilterManager manages filter rules
type FilterManager struct {
	filterMap *ebpf.Map
	rules     map[uint32]*FilterRule
	nextID    uint32
	mu        sync.RWMutex
}

// NewFilterManager creates a new filter manager
func NewFilterManager(filterMap *ebpf.Map) *FilterManager {
	return &FilterManager{
		filterMap: filterMap,
		rules:     make(map[uint32]*FilterRule),
		nextID:    0, // Start from 0 for array maps
	}
}

// AddRule adds a new filter rule
func (fm *FilterManager) AddRule(rule *FilterRule) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	if rule.ID == 0 {
		// Find the next available ID
		for i := uint32(0); i < MaxFilterRules; i++ {
			if _, exists := fm.rules[i]; !exists {
				rule.ID = i
				break
			}
		}
		
		// If no available ID found
		if rule.ID == 0 && len(fm.rules) > 0 {
			return fmt.Errorf("maximum number of filter rules (%d) reached", MaxFilterRules)
		}
	}

	// Check if ID is within valid range
	if rule.ID >= MaxFilterRules {
		return fmt.Errorf("rule ID %d exceeds maximum allowed (%d)", rule.ID, MaxFilterRules-1)
	}

	// Convert to eBPF structure
	bpfRule, err := fm.convertToBPFRule(rule)
	if err != nil {
		return fmt.Errorf("failed to convert rule: %v", err)
	}

	// Update BPF map
	key := rule.ID
	if err := fm.filterMap.Update(&key, &bpfRule, ebpf.UpdateAny); err != nil {
		return fmt.Errorf("failed to update BPF map: %v", err)
	}

	// Store in local cache
	fm.rules[rule.ID] = rule

	return nil
}

// RemoveRule removes a filter rule
func (fm *FilterManager) RemoveRule(id uint32) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	// Check if rule exists in local cache
	if _, exists := fm.rules[id]; !exists {
		return fmt.Errorf("rule with ID %d does not exist", id)
	}

	// For BPF array maps, we can't actually delete entries, so we zero them out
	// Create a zeroed-out rule structure to "delete" the entry
	var zeroRule connTrackerFilterRule
	
	// Set the key and update with zero values (effectively disabling the rule)
	key := id
	if err := fm.filterMap.Update(&key, &zeroRule, ebpf.UpdateAny); err != nil {
		// Log the error but don't fail completely if it's just a BPF map issue
		log.Printf("Warning: failed to zero out rule %d in BPF map: %v", id, err)
		// Continue to remove from local cache anyway
	}

	// Remove from local cache
	delete(fm.rules, id)

	return nil
}

// UpdateRule updates an existing filter rule
func (fm *FilterManager) UpdateRule(rule *FilterRule) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	// Check if ID is within valid range
	if rule.ID >= MaxFilterRules {
		return fmt.Errorf("rule ID %d exceeds maximum allowed (%d)", rule.ID, MaxFilterRules-1)
	}

	if _, exists := fm.rules[rule.ID]; !exists {
		return fmt.Errorf("rule with ID %d does not exist", rule.ID)
	}

	// Convert to eBPF structure
	bpfRule, err := fm.convertToBPFRule(rule)
	if err != nil {
		return fmt.Errorf("failed to convert rule: %v", err)
	}

	// Update BPF map
	key := rule.ID
	if err := fm.filterMap.Update(&key, &bpfRule, ebpf.UpdateExist); err != nil {
		return fmt.Errorf("failed to update BPF map: %v", err)
	}

	// Update local cache
	fm.rules[rule.ID] = rule

	return nil
}

// GetRules returns all filter rules
func (fm *FilterManager) GetRules() []*FilterRule {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	rules := make([]*FilterRule, 0, len(fm.rules))
	for _, rule := range fm.rules {
		rules = append(rules, rule)
	}

	return rules
}

// GetRule returns a specific filter rule
func (fm *FilterManager) GetRule(id uint32) (*FilterRule, error) {
	fm.mu.RLock()
	defer fm.mu.RUnlock()

	rule, exists := fm.rules[id]
	if !exists {
		return nil, fmt.Errorf("rule with ID %d not found", id)
	}

	return rule, nil
}

// EnableRule enables a filter rule
func (fm *FilterManager) EnableRule(id uint32) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	rule, exists := fm.rules[id]
	if !exists {
		return fmt.Errorf("rule with ID %d not found", id)
	}

	rule.Enabled = true
	
	// Convert to eBPF structure
	bpfRule, err := fm.convertToBPFRule(rule)
	if err != nil {
		return fmt.Errorf("failed to convert rule: %v", err)
	}

	// Update BPF map
	key := rule.ID
	if err := fm.filterMap.Update(&key, &bpfRule, ebpf.UpdateExist); err != nil {
		return fmt.Errorf("failed to update BPF map: %v", err)
	}

	return nil
}

// DisableRule disables a filter rule
func (fm *FilterManager) DisableRule(id uint32) error {
	fm.mu.Lock()
	defer fm.mu.Unlock()

	rule, exists := fm.rules[id]
	if !exists {
		return fmt.Errorf("rule with ID %d not found", id)
	}

	rule.Enabled = false
	
	// Convert to eBPF structure
	bpfRule, err := fm.convertToBPFRule(rule)
	if err != nil {
		return fmt.Errorf("failed to convert rule: %v", err)
	}

	// Update BPF map
	key := rule.ID
	if err := fm.filterMap.Update(&key, &bpfRule, ebpf.UpdateExist); err != nil {
		return fmt.Errorf("failed to update BPF map: %v", err)
	}

	return nil
}

// convertToBPFRule converts FilterRule to connTrackerFilterRule
func (fm *FilterManager) convertToBPFRule(rule *FilterRule) (connTrackerFilterRule, error) {
	var bpfRule connTrackerFilterRule

	// Convert source IP
	if rule.SrcIP != "" && rule.SrcIP != "any" {
		ip := net.ParseIP(rule.SrcIP)
		if ip == nil {
			return bpfRule, fmt.Errorf("invalid source IP: %s", rule.SrcIP)
		}
		ipv4 := ip.To4()
		if ipv4 == nil {
			return bpfRule, fmt.Errorf("IPv6 not supported: %s", rule.SrcIP)
		}
		bpfRule.SrcIp = uint32(ipv4[0]) | uint32(ipv4[1])<<8 | uint32(ipv4[2])<<16 | uint32(ipv4[3])<<24
	}

	// Convert destination IP
	if rule.DstIP != "" && rule.DstIP != "any" {
		ip := net.ParseIP(rule.DstIP)
		if ip == nil {
			return bpfRule, fmt.Errorf("invalid destination IP: %s", rule.DstIP)
		}
		ipv4 := ip.To4()
		if ipv4 == nil {
			return bpfRule, fmt.Errorf("IPv6 not supported: %s", rule.DstIP)
		}
		bpfRule.DstIp = uint32(ipv4[0]) | uint32(ipv4[1])<<8 | uint32(ipv4[2])<<16 | uint32(ipv4[3])<<24
	}

	// Set ports
	bpfRule.SrcPort = rule.SrcPort
	bpfRule.DstPort = rule.DstPort

	// Convert protocol
	switch strings.ToLower(rule.Protocol) {
	case "tcp":
		bpfRule.Protocol = 6
	case "udp":
		bpfRule.Protocol = 17
	case "icmp":
		bpfRule.Protocol = 1
	case "any", "":
		bpfRule.Protocol = 0
	default:
		return bpfRule, fmt.Errorf("unsupported protocol: %s", rule.Protocol)
	}

	// Convert action
	switch strings.ToLower(rule.Action) {
	case "allow":
		bpfRule.Action = 0
	case "drop":
		bpfRule.Action = 1
	default:
		return bpfRule, fmt.Errorf("unsupported action: %s", rule.Action)
	}

	// Convert rule type
	switch strings.ToLower(rule.RuleType) {
	case "basic", "":
		bpfRule.RuleType = 0
	case "icmp":
		bpfRule.RuleType = 1
	case "tcp":
		bpfRule.RuleType = 2
	case "udp":
		bpfRule.RuleType = 3
	default:
		return bpfRule, fmt.Errorf("unsupported rule type: %s", rule.RuleType)
	}

	// Set enabled flag
	if rule.Enabled {
		bpfRule.Enabled = 1
	} else {
		bpfRule.Enabled = 0
	}

	// ICMP specific fields
	if rule.ICMPType != nil {
		bpfRule.IcmpType = *rule.ICMPType
	} else {
		bpfRule.IcmpType = 255 // 255 = any
	}

	if rule.ICMPCode != nil {
		bpfRule.IcmpCode = *rule.ICMPCode
	} else {
		bpfRule.IcmpCode = 255 // 255 = any
	}

	// TCP specific fields
	if rule.TCPFlags != nil {
		bpfRule.TcpFlags = *rule.TCPFlags
	}

	if rule.TCPFlagsMask != nil {
		bpfRule.TcpFlagsMask = *rule.TCPFlagsMask
	}

	// Inner packet filtering (for ICMP error messages)
	if rule.InnerSrcIP != "" && rule.InnerSrcIP != "any" {
		ip := net.ParseIP(rule.InnerSrcIP)
		if ip == nil {
			return bpfRule, fmt.Errorf("invalid inner source IP: %s", rule.InnerSrcIP)
		}
		ipv4 := ip.To4()
		if ipv4 == nil {
			return bpfRule, fmt.Errorf("IPv6 not supported for inner source IP: %s", rule.InnerSrcIP)
		}
		bpfRule.InnerSrcIp = uint32(ipv4[0]) | uint32(ipv4[1])<<8 | uint32(ipv4[2])<<16 | uint32(ipv4[3])<<24
	}

	if rule.InnerDstIP != "" && rule.InnerDstIP != "any" {
		ip := net.ParseIP(rule.InnerDstIP)
		if ip == nil {
			return bpfRule, fmt.Errorf("invalid inner destination IP: %s", rule.InnerDstIP)
		}
		ipv4 := ip.To4()
		if ipv4 == nil {
			return bpfRule, fmt.Errorf("IPv6 not supported for inner destination IP: %s", rule.InnerDstIP)
		}
		bpfRule.InnerDstIp = uint32(ipv4[0]) | uint32(ipv4[1])<<8 | uint32(ipv4[2])<<16 | uint32(ipv4[3])<<24
	}

	if rule.InnerProtocol != "" && rule.InnerProtocol != "any" {
		switch strings.ToLower(rule.InnerProtocol) {
		case "tcp":
			bpfRule.InnerProtocol = 6
		case "udp":
			bpfRule.InnerProtocol = 17
		case "icmp":
			bpfRule.InnerProtocol = 1
		default:
			return bpfRule, fmt.Errorf("unsupported inner protocol: %s", rule.InnerProtocol)
		}
	}

	return bpfRule, nil
}

// HTTP API handlers for filter management

func (s *APIServer) handleFilterRules(w http.ResponseWriter, r *http.Request) {
	s.enableCORS(w, r)
	if r.Method == "OPTIONS" {
			return
	}

	switch r.Method {
	case "GET":
		s.handleGetFilterRules(w, r)
	case "POST":
		s.handleAddFilterRule(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *APIServer) handleFilterRule(w http.ResponseWriter, r *http.Request) {
	s.enableCORS(w, r)
	if r.Method == "OPTIONS" {
			return
	}

	// Extract rule ID from URL
	parts := strings.Split(r.URL.Path, "/")
	if len(parts) < 4 {
		http.Error(w, "Invalid URL", http.StatusBadRequest)
		return
	}

	id, err := strconv.ParseUint(parts[3], 10, 32)
	if err != nil {
		http.Error(w, "Invalid rule ID", http.StatusBadRequest)
		return
	}
	ruleID := uint32(id)

	// Check if this is an action endpoint (enable/disable)
	if len(parts) >= 5 {
		action := parts[4]
		if action == "enable" || action == "disable" {
			s.handleFilterRuleAction(w, r, ruleID, action)
			return
		}
	}

	switch r.Method {
	case "GET":
		s.handleGetFilterRule(w, r, ruleID)
	case "PUT":
		s.handleUpdateFilterRule(w, r, ruleID)
	case "DELETE":
		s.handleDeleteFilterRule(w, r, ruleID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *APIServer) handleGetFilterRules(w http.ResponseWriter, r *http.Request) {
	rules := s.filterManager.GetRules()
	
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rules)
}

func (s *APIServer) handleAddFilterRule(w http.ResponseWriter, r *http.Request) {
	var rule FilterRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	// Set default wildcard values for empty fields
	if rule.SrcIP == "" {
		rule.SrcIP = "any"
	}
	if rule.DstIP == "" {
		rule.DstIP = "any"
	}
	// Set default protocol based on rule type if not specified
	if rule.Protocol == "" {
		switch rule.RuleType {
		case "tcp":
			rule.Protocol = "tcp"
		case "udp":
			rule.Protocol = "udp"
		case "icmp":
			rule.Protocol = "icmp"
		default:
			rule.Protocol = "any"
		}
	}
	// Note: SrcPort and DstPort are uint16, 0 is already the wildcard value for ports
	// Protocol and other fields are handled by their respective rule types

	if err := s.filterManager.AddRule(&rule); err != nil {
		http.Error(w, fmt.Sprintf("Failed to add rule: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(rule)
}

func (s *APIServer) handleGetFilterRule(w http.ResponseWriter, r *http.Request, id uint32) {
	rule, err := s.filterManager.GetRule(id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rule)
}

func (s *APIServer) handleUpdateFilterRule(w http.ResponseWriter, r *http.Request, id uint32) {
	var rule FilterRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		http.Error(w, fmt.Sprintf("Invalid JSON: %v", err), http.StatusBadRequest)
		return
	}

	rule.ID = id
	
	// Set default wildcard values for empty fields
	if rule.SrcIP == "" {
		rule.SrcIP = "any"
	}
	if rule.DstIP == "" {
		rule.DstIP = "any"
	}
	// Set default protocol based on rule type if not specified
	if rule.Protocol == "" {
		switch rule.RuleType {
		case "tcp":
			rule.Protocol = "tcp"
		case "udp":
			rule.Protocol = "udp"
		case "icmp":
			rule.Protocol = "icmp"
		default:
			rule.Protocol = "any"
		}
	}
	
	if err := s.filterManager.UpdateRule(&rule); err != nil {
		http.Error(w, fmt.Sprintf("Failed to update rule: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(rule)
}

func (s *APIServer) handleDeleteFilterRule(w http.ResponseWriter, r *http.Request, id uint32) {
	if err := s.filterManager.RemoveRule(id); err != nil {
		http.Error(w, fmt.Sprintf("Failed to delete rule: %v", err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (s *APIServer) handleFilterRuleAction(w http.ResponseWriter, r *http.Request, ruleID uint32, action string) {
	if r.Method != "POST" {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var err error
	switch action {
	case "enable":
		err = s.filterManager.EnableRule(ruleID)
	case "disable":
		err = s.filterManager.DisableRule(ruleID)
	default:
		http.Error(w, "Invalid action", http.StatusBadRequest)
		return
	}

	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to %s rule: %v", action, err), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusOK)
} 