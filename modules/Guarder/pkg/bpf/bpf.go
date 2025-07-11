package bpf

import (
	"encoding/binary"
	"fmt"
	"net"
	"strings"
	"time"
	"unsafe"
)

// ConnKey represents a connection tracking key
type ConnKey struct {
	SrcIP    uint32
	DstIP    uint32
	SrcPort  uint16
	DstPort  uint16
	Protocol uint8
	Pad      [3]uint8 // 添加padding与C结构体保持一致
}

// ConnInfo represents connection tracking information
type ConnInfo struct {
	Packets    uint64
	Bytes      uint64
	IPID       uint32
	StartTime  uint64
	LastSeen   uint64
	TCPFlags   uint8
	Seq        uint32    // TCP sequence number
	AckSeq     uint32    // TCP acknowledgment number
	Window     uint16    // TCP window size
}

// ICMPKey represents an ICMP tracking key
type ICMPKey struct {
	SrcIP  uint32
	DstIP  uint32
	Type   uint8
	Code   uint8
}

// ICMPInfo represents ICMP tracking information
type ICMPInfo struct {
	Packets       uint64
	Bytes         uint64
	IPID          uint32
	LastSeen      uint64
	InnerSrcIP    uint32    // 内嵌报文的源IP
	InnerDstIP    uint32    // 内嵌报文的目标IP
	InnerProtocol uint8     // 内嵌报文的协议
	InnerSrcPort  uint16    // 内嵌报文的源端口
	InnerDstPort  uint16    // 内嵌报文的目标端口
}

// PerfStats represents performance statistics
type PerfStats struct {
	// ICMP statistics
	ICMPTypeCounts [16]uint64  // Count for each ICMP type (0-15)
	ICMPCodeCounts [256]uint64 // Count for each ICMP code
	
	// TCP statistics
	TCPRetrans      uint64 // TCP retransmissions
	TCPDuplicateAck uint64 // Duplicate ACKs
	TCPOutOfOrder   uint64 // Out of order packets
	TCPZeroWindow   uint64 // Zero window packets
	TCPSmallWindow  uint64 // Small window packets (< 1000 bytes)
	
	// General statistics
	TotalPackets    uint64 // Total packets processed
	TotalBytes      uint64 // Total bytes processed
	DroppedPackets  uint64 // Dropped packets
	MalformedPackets uint64 // Malformed packets
}

// FormatConnKey formats a connection key for display
func FormatConnKey(key ConnKey) string {
	srcIP := net.IP(make([]byte, 4))
	dstIP := net.IP(make([]byte, 4))
	
	binary.LittleEndian.PutUint32(srcIP, key.SrcIP)
	binary.LittleEndian.PutUint32(dstIP, key.DstIP)
	
	proto := "Unknown"
	switch key.Protocol {
	case 6:
		proto = "TCP"
	case 17:
		proto = "UDP"
	}
	
	return fmt.Sprintf("%s:%d -> %s:%d (%s)", 
		srcIP.String(), key.SrcPort, 
		dstIP.String(), key.DstPort, 
		proto)
}

// FormatICMPKey formats an ICMP key for display
func FormatICMPKey(key ICMPKey) string {
	srcIP := net.IP(make([]byte, 4))
	dstIP := net.IP(make([]byte, 4))
	
	binary.LittleEndian.PutUint32(srcIP, key.SrcIP)
	binary.LittleEndian.PutUint32(dstIP, key.DstIP)
	
	return fmt.Sprintf("%s -> %s (Type: %d, Code: %d)", 
		srcIP.String(), dstIP.String(), 
		key.Type, key.Code)
}

// FormatConnInfo formats connection info for display
func FormatConnInfo(info ConnInfo) string {
	return formatConnInfo(&info)
}

// FormatICMPInfo formats ICMP info for display
func FormatICMPInfo(info ICMPInfo) string {
	return formatICMPInfo(&info)
}

// ConnKeySize returns the size of ConnKey
func ConnKeySize() int {
	return int(unsafe.Sizeof(ConnKey{}))
}

// ConnInfoSize returns the size of ConnInfo
func ConnInfoSize() int {
	return int(unsafe.Sizeof(ConnInfo{}))
}

// ICMPKeySize returns the size of ICMPKey
func ICMPKeySize() int {
	return int(unsafe.Sizeof(ICMPKey{}))
}

// ICMPInfoSize returns the size of ICMPInfo
func ICMPInfoSize() int {
	return int(unsafe.Sizeof(ICMPInfo{}))
}

// 添加时间转换函数
func formatTime(ns uint64) string {
	// 获取系统启动时间
	bootTime := time.Now().UnixNano() - int64(ns)
	// 转换为Unix时间戳
	unixTime := time.Unix(0, bootTime)
	return unixTime.Format(time.RFC3339)
}

// 修改连接信息的格式化函数
func formatConnInfo(info *ConnInfo) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("Packets: %d", info.Packets))
	parts = append(parts, fmt.Sprintf("Bytes: %d", info.Bytes))
	parts = append(parts, fmt.Sprintf("IP ID: %d", info.IPID))
	
	// Format timestamps
	bootTime := time.Now().UnixNano() - int64(info.LastSeen)
	lastSeen := time.Unix(0, int64(bootTime))
	parts = append(parts, fmt.Sprintf("Last Seen: %s", lastSeen.Format(time.RFC3339)))
	
	// Format TCP specific information
	if info.TCPFlags != 0 {
		parts = append(parts, fmt.Sprintf("TCP Flags: %s", formatTCPFlags(info.TCPFlags)))
		parts = append(parts, fmt.Sprintf("Seq: %d", info.Seq))
		parts = append(parts, fmt.Sprintf("Ack: %d", info.AckSeq))
		parts = append(parts, fmt.Sprintf("Window: %d", info.Window))
	}
	
	return strings.Join(parts, ", ")
}

// 修改ICMP信息的格式化函数
func formatICMPInfo(info *ICMPInfo) string {
	var parts []string
	parts = append(parts, fmt.Sprintf("Packets: %d", info.Packets))
	parts = append(parts, fmt.Sprintf("Bytes: %d", info.Bytes))
	parts = append(parts, fmt.Sprintf("IP ID: %d", info.IPID))
	
	// Format timestamp
	bootTime := time.Now().UnixNano() - int64(info.LastSeen)
	lastSeen := time.Unix(0, int64(bootTime))
	parts = append(parts, fmt.Sprintf("Last Seen: %s", lastSeen.Format(time.RFC3339)))
	
	// Format inner packet information if available
	if info.InnerSrcIP != 0 || info.InnerDstIP != 0 {
		innerParts := []string{
			fmt.Sprintf("Inner Src IP: %s", net.IP{byte(info.InnerSrcIP >> 24), byte(info.InnerSrcIP >> 16), byte(info.InnerSrcIP >> 8), byte(info.InnerSrcIP)}.String()),
			fmt.Sprintf("Inner Dst IP: %s", net.IP{byte(info.InnerDstIP >> 24), byte(info.InnerDstIP >> 16), byte(info.InnerDstIP >> 8), byte(info.InnerDstIP)}.String()),
		}
		
		if info.InnerProtocol == 6 { // TCP
			innerParts = append(innerParts, fmt.Sprintf("Inner Protocol: TCP"))
			if info.InnerSrcPort != 0 || info.InnerDstPort != 0 {
				innerParts = append(innerParts, fmt.Sprintf("Inner Ports: %d -> %d", info.InnerSrcPort, info.InnerDstPort))
			}
		} else if info.InnerProtocol == 17 { // UDP
			innerParts = append(innerParts, fmt.Sprintf("Inner Protocol: UDP"))
			if info.InnerSrcPort != 0 || info.InnerDstPort != 0 {
				innerParts = append(innerParts, fmt.Sprintf("Inner Ports: %d -> %d", info.InnerSrcPort, info.InnerDstPort))
			}
		} else {
			innerParts = append(innerParts, fmt.Sprintf("Inner Protocol: %d", info.InnerProtocol))
		}
		
		parts = append(parts, fmt.Sprintf("Inner Packet: {%s}", strings.Join(innerParts, ", ")))
	}
	
	return strings.Join(parts, ", ")
}

// formatPerfStats formats performance statistics for display
func formatPerfStats(stats *PerfStats) string {
	var parts []string
	
	// Format general statistics
	parts = append(parts, fmt.Sprintf("Total Packets: %d", stats.TotalPackets))
	parts = append(parts, fmt.Sprintf("Total Bytes: %d", stats.TotalBytes))
	parts = append(parts, fmt.Sprintf("Dropped Packets: %d", stats.DroppedPackets))
	parts = append(parts, fmt.Sprintf("Malformed Packets: %d", stats.MalformedPackets))
	
	// Format TCP statistics
	parts = append(parts, "\nTCP Statistics:")
	parts = append(parts, fmt.Sprintf("  Retransmissions: %d", stats.TCPRetrans))
	parts = append(parts, fmt.Sprintf("  Duplicate ACKs: %d", stats.TCPDuplicateAck))
	parts = append(parts, fmt.Sprintf("  Out of Order: %d", stats.TCPOutOfOrder))
	parts = append(parts, fmt.Sprintf("  Zero Window: %d", stats.TCPZeroWindow))
	parts = append(parts, fmt.Sprintf("  Small Window: %d", stats.TCPSmallWindow))
	
	// Format ICMP statistics
	parts = append(parts, "\nICMP Statistics:")
	for i := 0; i < 16; i++ {
		if stats.ICMPTypeCounts[i] > 0 {
			parts = append(parts, fmt.Sprintf("  Type %d: %d", i, stats.ICMPTypeCounts[i]))
			// For type 3 (Destination Unreachable), show code details
			if i == 3 {
				for j := 0; j < 16; j++ {
					if stats.ICMPCodeCounts[j] > 0 {
						parts = append(parts, fmt.Sprintf("    Code %d: %d", j, stats.ICMPCodeCounts[j]))
					}
				}
			}
		}
	}
	
	return strings.Join(parts, "\n")
}

// formatTCPFlags returns a string representation of TCP flags
func formatTCPFlags(flags uint8) string {
	var result []string
	if flags&(1<<1) != 0 {
		result = append(result, "SYN")
	}
	if flags&(1<<2) != 0 {
		result = append(result, "ACK")
	}
	if flags&(1<<3) != 0 {
		result = append(result, "FIN")
	}
	if flags&(1<<4) != 0 {
		result = append(result, "RST")
	}
	if flags&(1<<5) != 0 {
		result = append(result, "PSH")
	}
	if flags&(1<<6) != 0 {
		result = append(result, "URG")
	}
	if len(result) == 0 {
		return "NONE"
	}
	return strings.Join(result, "|")
} 