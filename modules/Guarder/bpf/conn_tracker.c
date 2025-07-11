// #include "common1.h"
#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// common
#define AF_INET 2
#define AF_INET6 10

#define ETH_ALEN 6
#define ETH_P_802_3_MIN 0x0600
#define ETH_P_8021Q 0x8100
#define ETH_P_8021AD 0x88A8
#define ETH_P_IP 0x0800
#define ETH_P_IPV6 0x86DD
#define ETH_P_ARP 0x0806
#define IPPROTO_ICMPV6 58

#define TC_ACT_OK 0
#define TC_ACT_SHOT 2

#define IFNAMSIZ 16

// Connection tracking key structure
struct conn_key
{
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8 protocol;
    __u8 pad[3]; // 显式添加 padding，确保哈希一致性
} __attribute__((packed));

// Connection tracking value structure
struct conn_info
{
    __u64 packets;
    __u64 bytes;
    __u32 ip_id;      // Store IP ID
    __u64 start_time; // Connection start time
    __u64 last_seen;  // Last packet timestamp
    __u8 tcp_flags;   // TCP flags for TCP connections
    __u32 seq;        // TCP sequence number
    __u32 ack_seq;    // TCP acknowledgment number
    __u16 window;     // TCP window size
};

// Enhanced filter rule structure for multi-protocol filtering
struct filter_rule
{
    // Basic IP filtering
    __u32 src_ip;   // Source IP (0 = any)
    __u32 dst_ip;   // Destination IP (0 = any)
    __u16 src_port; // Source port (0 = any)
    __u16 dst_port; // Destination port (0 = any)
    __u8 protocol;  // Protocol (0 = any, 1 = ICMP, 6 = TCP, 17 = UDP)
    __u8 action;    // 0 = allow, 1 = drop
    __u8 enabled;   // 0 = disabled, 1 = enabled
    __u8 rule_type; // 0 = basic, 1 = ICMP, 2 = TCP, 3 = UDP

    // ICMP specific filtering
    __u8 icmp_type; // ICMP type (255 = any)
    __u8 icmp_code; // ICMP code (255 = any)

    // TCP specific filtering
    __u8 tcp_flags;      // TCP flags to match (0 = any)
    __u8 tcp_flags_mask; // Mask for TCP flags (0 = ignore flags)

    // Inner packet filtering (for ICMP error messages)
    __u32 inner_src_ip;  // Inner source IP (0 = any)
    __u32 inner_dst_ip;  // Inner destination IP (0 = any)
    __u8 inner_protocol; // Inner protocol (0 = any)
    __u8 pad[3];         // Padding for alignment
};

// ICMP tracking key structure
struct icmp_key
{
    __u32 src_ip;
    __u32 dst_ip;
    __u8 type;
    __u8 code;
};

// ICMP tracking value structure
struct icmp_info
{
    __u64 packets;
    __u64 bytes;
    __u32 ip_id;          // Store IP ID
    __u64 last_seen;      // Last packet timestamp
    __u8 type;            // ICMP type
    __u8 code;            // ICMP code
    __u32 inner_src_ip;   // Inner source IP
    __u32 inner_dst_ip;   // Inner destination IP
    __u8 inner_protocol;  // Inner protocol
    __u16 inner_src_port; // Inner source port
    __u16 inner_dst_port; // Inner destination port
};

// Performance statistics structure
struct perf_stats
{
    // ICMP statistics
    __u64 icmp_type_counts[16];  // Count for each ICMP type (0-15)
    __u64 icmp_code_counts[256]; // Count for each ICMP code

    // TCP statistics
    __u64 tcp_retrans;       // TCP retransmissions
    __u64 tcp_duplicate_ack; // Duplicate ACKs
    __u64 tcp_out_of_order;  // Out of order packets
    __u64 tcp_zero_window;   // Zero window packets
    __u64 tcp_small_window;  // Small window packets (< 1000 bytes)

    // General statistics
    __u64 total_packets;     // Total packets processed
    __u64 total_bytes;       // Total bytes processed
    __u64 dropped_packets;   // Dropped packets
    __u64 malformed_packets; // Malformed packets
};

// BPF maps
struct
{
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 65536);
    __type(key, struct conn_key);
    __type(value, struct conn_info);
} conn_map SEC(".maps");

struct
{
    __uint(type, BPF_MAP_TYPE_LRU_HASH);
    __uint(max_entries, 1024);
    __type(key, struct icmp_key);
    __type(value, struct icmp_info);
} icmp_map SEC(".maps");

// 添加性能统计map
struct
{
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct perf_stats);
} perf_stats_map SEC(".maps");

// Filter rules map
struct
{
    __uint(type, BPF_MAP_TYPE_ARRAY);
    __uint(max_entries, 32); // 减少到32个规则，更容易被验证器接受
    __type(key, __u32);
    __type(value, struct filter_rule);
} filter_map SEC(".maps");

// TCP flags definitions
#define TCP_FIN 0x01
#define TCP_SYN 0x02
#define TCP_RST 0x04
#define TCP_PSH 0x08
#define TCP_ACK 0x10
#define TCP_URG 0x20

// ICMP types for error messages
#define ICMP_DEST_UNREACH 3
#define ICMP_SOURCE_QUENCH 4
#define ICMP_TIME_EXCEEDED 11
#define ICMP_PARAMETER_PROB 12

// Enhanced ICMP filtering
static __always_inline int check_icmp_filter(struct filter_rule *rule,
                                             __u8 icmp_type, __u8 icmp_code,
                                             __u32 inner_src_ip, __u32 inner_dst_ip,
                                             __u8 inner_protocol)
{
    // Check ICMP type
    if (rule->icmp_type != 255 && rule->icmp_type != icmp_type)
    {
        return 0;
    }

    // Check ICMP code
    if (rule->icmp_code != 255 && rule->icmp_code != icmp_code)
    {
        return 0;
    }

    // Check inner packet for error messages
    if ((icmp_type == ICMP_DEST_UNREACH || icmp_type == ICMP_SOURCE_QUENCH ||
         icmp_type == ICMP_TIME_EXCEEDED || icmp_type == ICMP_PARAMETER_PROB))
    {

        if (rule->inner_src_ip != 0 && rule->inner_src_ip != inner_src_ip)
        {
            return 0;
        }

        if (rule->inner_dst_ip != 0 && rule->inner_dst_ip != inner_dst_ip)
        {
            return 0;
        }

        if (rule->inner_protocol != 0 && rule->inner_protocol != inner_protocol)
        {
            return 0;
        }
    }

    return 1;
}

// Enhanced TCP filtering
static __always_inline int check_tcp_filter(struct filter_rule *rule, __u8 tcp_flags)
{
    if (rule->tcp_flags_mask == 0)
    {
        return 1; // No specific TCP filtering
    }

    return ((tcp_flags & rule->tcp_flags_mask) == (rule->tcp_flags & rule->tcp_flags_mask));
}

// Enhanced filter checking function with protocol-specific filtering
static __always_inline int check_enhanced_filter_rules(__u32 src_ip, __u32 dst_ip,
                                                       __u16 src_port, __u16 dst_port,
                                                       __u8 protocol, __u8 icmp_type,
                                                       __u8 icmp_code, __u8 tcp_flags,
                                                       __u32 inner_src_ip, __u32 inner_dst_ip,
                                                       __u8 inner_protocol)
{
    struct filter_rule *rule;

    for (__u32 key = 0; key < 32; key++)
    {
        rule = NULL;
        __u32 newkey = key;
        rule = bpf_map_lookup_elem(&filter_map, &newkey);
        if (!rule)
        {
            break;
        }

        if (!rule->enabled)
        {
            continue;
        }

        // Basic IP and port matching
        if ((rule->src_ip == 0 || rule->src_ip == src_ip) &&
            (rule->dst_ip == 0 || rule->dst_ip == dst_ip) &&
            (rule->src_port == 0 || rule->src_port == src_port) &&
            (rule->dst_port == 0 || rule->dst_port == dst_port) &&
            (rule->protocol == 0 || rule->protocol == protocol))
        {
            int match = 1;
            
            bpf_printk("Filter Rule %u: enabled=%u, rule_type=%u, protocol=%u/%u",
                       key, rule->enabled, rule->rule_type, rule->protocol, protocol);

            // Protocol-specific filtering
            switch (rule->rule_type)
            {
            case 1: // ICMP filtering
                if (protocol == IPPROTO_ICMP)
                {
                    bpf_printk("ICMP Filter Check: rule_type=%u, icmp_type=%u/%u, icmp_code=%u/%u",
                               rule->rule_type, rule->icmp_type, icmp_type, rule->icmp_code, icmp_code);
                    match = check_icmp_filter(rule, icmp_type, icmp_code,
                                              inner_src_ip, inner_dst_ip, inner_protocol);
                    bpf_printk("ICMP Filter Result: match=%d, action=%u", match, rule->action);
                }
                else
                {
                    match = 0; // Protocol mismatch
                }
                break;

            case 2: // TCP filtering
                if (protocol == IPPROTO_TCP)
                {
                    match = check_tcp_filter(rule, tcp_flags);
                }
                break;

            case 3: // UDP filtering
                // UDP has no additional filtering beyond basic IP/port
                break;

            default: // Basic filtering (rule_type == 0)
                break;
            }

            if (match && rule->action == 1)
            {
                bpf_printk("Enhanced Filter DROP (type:%u): %u.%u.%u.%u:%u -> %u.%u.%u.%u:%u (proto:%u)",
                           rule->rule_type,
                           (src_ip >> 24) & 0xFF, (src_ip >> 16) & 0xFF, (src_ip >> 8) & 0xFF, src_ip & 0xFF, src_port,
                           (dst_ip >> 24) & 0xFF, (dst_ip >> 16) & 0xFF, (dst_ip >> 8) & 0xFF, dst_ip & 0xFF, dst_port,
                           protocol);
                return XDP_DROP;
            }
        }
    }

    return XDP_PASS;
}

// Helper function to update performance statistics
static __always_inline void update_perf_stats(struct perf_stats *stats, __u8 icmp_type, __u8 icmp_code,
                                              __u8 tcp_flags, __u16 window, __u32 seq, __u32 ack_seq)
{
    // Update ICMP statistics
    if (icmp_type < 16)
    {
        __sync_fetch_and_add(&stats->icmp_type_counts[icmp_type], 1);
    }
    // ICMP code is already in range 0-255 as it's __u8
    __sync_fetch_and_add(&stats->icmp_code_counts[icmp_code], 1);

    // Update TCP statistics
    if (tcp_flags & (1 << 1))
    { // SYN
        if (window == 0)
        {
            __sync_fetch_and_add(&stats->tcp_zero_window, 1);
        }
        else if (window < 1000)
        {
            __sync_fetch_and_add(&stats->tcp_small_window, 1);
        }
    }

    // Update general statistics
    __sync_fetch_and_add(&stats->total_packets, 1);
}

// Helper function to update connection tracking
static __always_inline void update_conn_tracking(struct conn_key *key, __u32 ip_id, __u8 tcp_flags,
                                                 __u16 pkt_len, __u32 seq, __u32 ack_seq, __u16 window)
{
    struct conn_info *info;
    __u64 now = bpf_ktime_get_ns();

    // 使用 BPF_NOEXIST 尝试插入新条目
    struct conn_info new_info = {
        .packets = 1,
        .bytes = pkt_len,
        .ip_id = ip_id,
        .start_time = now,
        .last_seen = now,
        .tcp_flags = tcp_flags,
        .seq = seq,
        .ack_seq = ack_seq,
        .window = window};

    // 首先尝试插入新条目
    if (bpf_map_update_elem(&conn_map, key, &new_info, BPF_NOEXIST) == 0)
    {
        // 插入成功，新连接已创建
        __u32 cpu_id = bpf_get_smp_processor_id();
        bpf_printk("New connection created on CPU %u: %u.%u.%u.%u:%u -> %u.%u.%u.%u:%u",
                   cpu_id,
                   (key->src_ip >> 24) & 0xFF,
                   (key->src_ip >> 16) & 0xFF,
                   (key->src_ip >> 8) & 0xFF,
                   key->src_ip & 0xFF,
                   key->src_port,
                   (key->dst_ip >> 24) & 0xFF,
                   (key->dst_ip >> 16) & 0xFF,
                   (key->dst_ip >> 8) & 0xFF,
                   key->dst_ip & 0xFF,
                   key->dst_port);
        return;
    }

    // 如果插入失败，说明条目已存在，更新现有条目
    info = bpf_map_lookup_elem(&conn_map, key);
    if (info)
    {
        // 使用原子操作更新计数
        __sync_fetch_and_add(&info->packets, 1);
        __sync_fetch_and_add(&info->bytes, pkt_len);

        // 更新其他字段
        info->ip_id = ip_id;
        info->last_seen = now;
        info->tcp_flags |= tcp_flags;
        info->seq = seq;
        info->ack_seq = ack_seq;
        info->window = window;
    }
    else
    {
        // 如果查找失败，说明在插入和查找之间条目被删除了
        // 重试插入操作
        if (bpf_map_update_elem(&conn_map, key, &new_info, BPF_NOEXIST) != 0)
        {
            bpf_printk("Error: Failed to update connection map");
        }
    }
}

// Helper function to update ICMP tracking
static __always_inline void update_icmp_tracking(struct icmp_key *key, __u32 ip_id, __u16 pkt_len,
                                                 void *data_end, void *data)
{
    struct icmp_info *info, new_info = {0};
    __u64 now = bpf_ktime_get_ns();

    info = bpf_map_lookup_elem(&icmp_map, key);
    if (info)
    {
        info->packets++;
        info->bytes += pkt_len;
        info->ip_id = ip_id;
        info->last_seen = now;
        info->type = key->type;
        info->code = key->code;
    }
    else
    {
        new_info.packets = 1;
        new_info.bytes = pkt_len;
        new_info.ip_id = ip_id;
        new_info.last_seen = now;
        new_info.type = key->type;
        new_info.code = key->code;

        // 解析ICMP内嵌报文
        if (key->type == 3 || key->type == 4 || key->type == 11 || key->type == 12)
        { // Destination Unreachable or Source Quench
            struct iphdr *inner_ip = data + sizeof(struct icmphdr);
            if ((void *)inner_ip + sizeof(*inner_ip) <= data_end)
            {
                new_info.inner_src_ip = inner_ip->saddr;
                new_info.inner_dst_ip = inner_ip->daddr;
                new_info.inner_protocol = inner_ip->protocol;

                // 如果是TCP或UDP，解析端口
                if (inner_ip->protocol == IPPROTO_TCP || inner_ip->protocol == IPPROTO_UDP)
                {
                    struct tcphdr *inner_tcp = (void *)inner_ip + (inner_ip->ihl * 4);
                    if ((void *)inner_tcp + sizeof(*inner_tcp) <= data_end)
                    {
                        new_info.inner_src_port = bpf_ntohs(inner_tcp->source);
                        new_info.inner_dst_port = bpf_ntohs(inner_tcp->dest);
                    }
                }
            }
        }

        if (bpf_map_update_elem(&icmp_map, key, &new_info, BPF_ANY) != 0)
        {
            bpf_printk("Error: Failed to update ICMP map");
        }
    }
}

SEC("xdp")
int conn_tracker(struct xdp_md *ctx)
{
    void *data_end = (void *)(long)ctx->data_end;
    void *data = (void *)(long)ctx->data;

    // 获取性能统计map
    __u32 stats_key = 0;
    struct perf_stats *stats = bpf_map_lookup_elem(&perf_stats_map, &stats_key);
    if (!stats)
    {
        return XDP_PASS;
    }

    // Parse Ethernet header
    struct ethhdr *eth = data;
    if (data + sizeof(*eth) > data_end)
        return XDP_PASS;

    // Only handle IPv4 packets
    if (eth->h_proto != bpf_htons(ETH_P_IP))
        return XDP_PASS;

    // Parse IP header
    struct iphdr *ip = data + sizeof(*eth);
    if ((void *)ip + sizeof(*ip) > data_end)
        return XDP_PASS;

    __u32 ip_id = bpf_ntohs(ip->id);

    // Update general statistics
    __sync_fetch_and_add(&stats->total_packets, 1);
    __sync_fetch_and_add(&stats->total_bytes, bpf_ntohs(ip->tot_len));

    // Check filter rules first
    int filter_result = check_enhanced_filter_rules(ip->saddr, ip->daddr, 0, 0, ip->protocol, 0, 0, 0, 0, 0, 0);
    if (filter_result == XDP_DROP)
    {
        __sync_fetch_and_add(&stats->dropped_packets, 1);
        return XDP_DROP;
    }

    // Handle different protocols
    if (ip->protocol == IPPROTO_TCP)
    {
        // Parse TCP header
        struct tcphdr *tcp = (void *)ip + (ip->ihl * 4);
        if ((void *)tcp + sizeof(*tcp) > data_end)
            return XDP_PASS;

        // Check filter rules with ports for TCP
        int tcp_filter_result = check_enhanced_filter_rules(ip->saddr, ip->daddr,
                                                            bpf_ntohs(tcp->source),
                                                            bpf_ntohs(tcp->dest),
                                                            IPPROTO_TCP, 0, 0,
                                                            tcp->fin | (tcp->syn << 1) | (tcp->rst << 2) | (tcp->psh << 3) | (tcp->ack << 4) | (tcp->urg << 5),
                                                            0, 0, 0);
        if (tcp_filter_result == XDP_DROP)
        {
            __sync_fetch_and_add(&stats->dropped_packets, 1);
            return XDP_DROP;
        }

        struct conn_key key = {
            .src_ip = ip->saddr,
            .dst_ip = ip->daddr,
            .src_port = bpf_ntohs(tcp->source),
            .dst_port = bpf_ntohs(tcp->dest),
            .protocol = IPPROTO_TCP};

        // 更新TCP连接跟踪
        update_conn_tracking(&key, ip_id, tcp->fin | (tcp->syn << 1) | (tcp->rst << 2) | (tcp->psh << 3) | (tcp->ack << 4) | (tcp->urg << 5),
                             bpf_ntohs(ip->tot_len) - (ip->ihl * 4),
                             bpf_ntohl(tcp->seq),
                             bpf_ntohl(tcp->ack_seq),
                             bpf_ntohs(tcp->window));

        // 更新性能统计
        update_perf_stats(stats, 0, 0, tcp->fin | (tcp->syn << 1) | (tcp->rst << 2) | (tcp->psh << 3) | (tcp->ack << 4) | (tcp->urg << 5),
                          bpf_ntohs(tcp->window),
                          bpf_ntohl(tcp->seq),
                          bpf_ntohl(tcp->ack_seq));
    }
    else if (ip->protocol == IPPROTO_UDP)
    {
        // Parse UDP header
        struct udphdr *udp = (void *)ip + (ip->ihl * 4);
        if ((void *)udp + sizeof(*udp) > data_end)
            return XDP_PASS;

        // Check filter rules with ports for UDP
        int udp_filter_result = check_enhanced_filter_rules(ip->saddr, ip->daddr,
                                                            bpf_ntohs(udp->source),
                                                            bpf_ntohs(udp->dest),
                                                            IPPROTO_UDP, 0, 0, 0, 0, 0, 0);
        if (udp_filter_result == XDP_DROP)
        {
            __sync_fetch_and_add(&stats->dropped_packets, 1);
            return XDP_DROP;
        }

        struct conn_key key = {
            .src_ip = ip->saddr,
            .dst_ip = ip->daddr,
            .src_port = bpf_ntohs(udp->source),
            .dst_port = bpf_ntohs(udp->dest),
            .protocol = IPPROTO_UDP};

        update_conn_tracking(&key, ip_id, 0, bpf_ntohs(ip->tot_len) - (ip->ihl * 4), 0, 0, 0);
    }
    else if (ip->protocol == IPPROTO_ICMP)
    {
        // Parse ICMP header
        struct icmphdr *icmp = (void *)ip + (ip->ihl * 4);
        if ((void *)icmp + sizeof(*icmp) > data_end)
            return XDP_PASS;

        // First get inner packet info for error messages
        __u32 inner_src_ip = 0, inner_dst_ip = 0;
        __u8 inner_protocol = 0;

        if (icmp->type == 3 || icmp->type == 4 || icmp->type == 11 || icmp->type == 12)
        {
            struct iphdr *inner_ip = (void *)icmp + sizeof(*icmp);
            if ((void *)inner_ip + sizeof(*inner_ip) <= data_end)
            {
                inner_src_ip = inner_ip->saddr;
                inner_dst_ip = inner_ip->daddr;
                inner_protocol = inner_ip->protocol;
            }
        }

        struct icmp_key key = {
            .src_ip = ip->saddr,
            .dst_ip = ip->daddr,
            .type = icmp->type,
            .code = icmp->code};

        // 计算ICMP数据长度
        __u16 icmp_data_len = bpf_ntohs(ip->tot_len) - (ip->ihl * 4) - sizeof(*icmp);

        // 更新ICMP跟踪
        update_icmp_tracking(&key, ip_id, icmp_data_len, data_end, (void *)icmp + sizeof(*icmp));

        // 更新性能统计
        update_perf_stats(stats, icmp->type, icmp->code, 0, 0, 0, 0);

        // Check filter rules with inner packet info for ICMP
        int icmp_filter_result = check_enhanced_filter_rules(ip->saddr, ip->daddr, 0, 0,
                                                             IPPROTO_ICMP, icmp->type, icmp->code, 0,
                                                             inner_src_ip, inner_dst_ip, inner_protocol);
        if (icmp_filter_result == XDP_DROP)
        {
            __sync_fetch_and_add(&stats->dropped_packets, 1);
            return XDP_DROP;
        }
    }

    // Allow the packet to pass through
    return XDP_PASS;
}

char _license[] SEC("license") = "GPL";