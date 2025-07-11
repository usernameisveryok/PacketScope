package main

import (
	"encoding/json"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/cilium/ebpf"
)

// ConnectionEntry 表示一个连接条目
type ConnectionEntry struct {
	Key  string `json:"key"`
	Info string `json:"info"`
}

// ICMPEntry 表示一个ICMP条目
type ICMPEntry struct {
	Key  string `json:"key"`
	Info string `json:"info"`
}

// FormatConnections 将连接表序列化为JSON字符串
func FormatConnections(connMap *ebpf.Map) (string, error) {
	var connections []ConnectionEntry

	var key connTrackerConnKey
	var info connTrackerConnInfo
	iter := connMap.Iterate()
	for iter.Next(&key, &info) {
		keyStr := formatConnKey(&key)
		infoStr := formatConnInfo(&key, &info)

		connections = append(connections, ConnectionEntry{
			Key:  keyStr,
			Info: infoStr,
		})
	}
	if err := iter.Err(); err != nil {
		return "", fmt.Errorf("error iterating connection map: %v", err)
	}

	jsonData, err := json.MarshalIndent(connections, "", "  ")
	if err != nil {
		return "", fmt.Errorf("error marshaling to JSON: %v", err)
	}

	return string(jsonData), nil
}

// FormatICMPEntries 将ICMP表序列化为JSON字符串
func FormatICMPEntries(icmpMap *ebpf.Map) (string, error) {
	var icmpEntries []ICMPEntry

	var key connTrackerIcmpKey
	var info connTrackerIcmpInfo
	iter := icmpMap.Iterate()
	for iter.Next(&key, &info) {
		keyStr := formatICMPKey(&key)
		infoStr := formatICMPInfo(&info)

		icmpEntries = append(icmpEntries, ICMPEntry{
			Key:  keyStr,
			Info: infoStr,
		})
	}
	if err := iter.Err(); err != nil {
		return "", fmt.Errorf("error iterating ICMP map: %v", err)
	}

	jsonData, err := json.MarshalIndent(icmpEntries, "", "  ")
	if err != nil {
		return "", fmt.Errorf("error marshaling to JSON: %v", err)
	}

	return string(jsonData), nil
}

// GetConnections 获取连接表数据
func GetConnections(connMap *ebpf.Map) ([]ConnectionEntry, error) {
	var connections []ConnectionEntry

	var key connTrackerConnKey
	var info connTrackerConnInfo
	iter := connMap.Iterate()
	for iter.Next(&key, &info) {
		keyStr := formatConnKey(&key)
		infoStr := formatConnInfo(&key, &info)

		connections = append(connections, ConnectionEntry{
			Key:  keyStr,
			Info: infoStr,
		})
	}
	if err := iter.Err(); err != nil {
		return nil, fmt.Errorf("error iterating connection map: %v", err)
	}

	return connections, nil
}

// GetICMPEntries 获取ICMP表数据
func GetICMPEntries(icmpMap *ebpf.Map) ([]ICMPEntry, error) {
	var icmpEntries []ICMPEntry

	var key connTrackerIcmpKey
	var info connTrackerIcmpInfo
	iter := icmpMap.Iterate()
	for iter.Next(&key, &info) {
		keyStr := formatICMPKey(&key)
		infoStr := formatICMPInfo(&info)

		icmpEntries = append(icmpEntries, ICMPEntry{
			Key:  keyStr,
			Info: infoStr,
		})
	}
	if err := iter.Err(); err != nil {
		return nil, fmt.Errorf("error iterating ICMP map: %v", err)
	}

	return icmpEntries, nil
}

// 格式化连接键
func formatConnKey(key *connTrackerConnKey) string {
	srcIP := net.IP{byte(key.SrcIp), byte(key.SrcIp >> 8), 
				byte(key.SrcIp >> 16), byte(key.SrcIp >> 24)}
	dstIP := net.IP{byte(key.DstIp), byte(key.DstIp >> 8), 
				byte(key.DstIp >> 16), byte(key.DstIp >> 24)}
	
	protocol := "Unknown"
	switch key.Protocol {
	case 6:
		protocol = "TCP"
	case 17:
		protocol = "UDP"
	}
	
	return fmt.Sprintf("%s:%d -> %s:%d (%s)", 
		srcIP.String(), key.SrcPort,
		dstIP.String(), key.DstPort,
		protocol)
}

// 格式化连接信息
func formatConnInfo(key *connTrackerConnKey, info *connTrackerConnInfo) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("Packets: %d", info.Packets))
	parts = append(parts, fmt.Sprintf("Bytes: %d", info.Bytes))
	parts = append(parts, fmt.Sprintf("IP ID: %d", info.IpId))
	
	// 格式化时间戳
	bootTime := time.Now().UnixNano() - int64(info.LastSeen)
	lastSeen := time.Unix(0, int64(bootTime))
	parts = append(parts, fmt.Sprintf("Last Seen: %s", lastSeen.Format(time.RFC3339)))
	
	startTime := time.Now().UnixNano() - int64(info.StartTime)
	firstSeen := time.Unix(0, int64(startTime))
	parts = append(parts, fmt.Sprintf("First Seen: %s", firstSeen.Format(time.RFC3339)))
	
	// TCP特定信息，不格式化flags
	if info.TcpFlags != 0 {
		parts = append(parts, fmt.Sprintf("TCP Flags: %d", info.TcpFlags))
		parts = append(parts, fmt.Sprintf("Seq: %d", info.Seq))
		parts = append(parts, fmt.Sprintf("Ack: %d", info.AckSeq))
		parts = append(parts, fmt.Sprintf("Window: %d", info.Window))
	}
	
	return strings.Join(parts, ", ")
}

// 格式化ICMP键
func formatICMPKey(key *connTrackerIcmpKey) string {
	srcIP := net.IP{byte(key.SrcIp), byte(key.SrcIp >> 8), 
				byte(key.SrcIp >> 16), byte(key.SrcIp >> 24)}
	dstIP := net.IP{byte(key.DstIp), byte(key.DstIp >> 8), 
				byte(key.DstIp >> 16), byte(key.DstIp >> 24)}
	
	return fmt.Sprintf("%s -> %s (Type: %d, Code: %d)", 
		srcIP.String(), dstIP.String(), 
		key.Type, key.Code)
}

// 格式化ICMP信息
func formatICMPInfo(info *connTrackerIcmpInfo) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("Packets: %d", info.Packets))
	parts = append(parts, fmt.Sprintf("Bytes: %d", info.Bytes))
	parts = append(parts, fmt.Sprintf("IP ID: %d", info.IpId))
	
	// 格式化时间戳
	bootTime := time.Now().UnixNano() - int64(info.LastSeen)
	lastSeen := time.Unix(0, int64(bootTime))
	parts = append(parts, fmt.Sprintf("Last Seen: %s", lastSeen.Format(time.RFC3339)))
	
	// 格式化内部包信息
	if info.InnerSrcIp != 0 || info.InnerDstIp != 0 {
		innerSrcIP := net.IP{byte(info.InnerSrcIp), byte(info.InnerSrcIp >> 8), 
						byte(info.InnerSrcIp >> 16), byte(info.InnerSrcIp >> 24)}
		innerDstIP := net.IP{byte(info.InnerDstIp), byte(info.InnerDstIp >> 8), 
						byte(info.InnerDstIp >> 16), byte(info.InnerDstIp >> 24)}
		
		protocol := "Unknown"
		if info.InnerProtocol == 6 {
			protocol = "TCP"
		} else if info.InnerProtocol == 17 {
			protocol = "UDP"
		}
		
		innerParts := []string{
			fmt.Sprintf("Inner Src IP: %s", innerSrcIP.String()),
			fmt.Sprintf("Inner Dst IP: %s", innerDstIP.String()),
			fmt.Sprintf("Inner Protocol: %s", protocol),
		}
		
		if info.InnerSrcPort != 0 || info.InnerDstPort != 0 {
			innerParts = append(innerParts, fmt.Sprintf("Inner Ports: %d -> %d", 
				info.InnerSrcPort, info.InnerDstPort))
		}
		
		parts = append(parts, fmt.Sprintf("Inner Packet: {%s}", strings.Join(innerParts, ", ")))
	}
	
	return strings.Join(parts, ", ")
} 