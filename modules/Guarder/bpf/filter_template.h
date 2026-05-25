// SPDX-License-Identifier: GPL-2.0
// Shared structures and maps for agent-generated programmable eBPF filters.
// All generated filter programs include this header via the codegen template.

#ifndef __FILTER_TEMPLATE_H__
#define __FILTER_TEMPLATE_H__

#include "vmlinux.h"
#include <bpf/bpf_helpers.h>
#include <bpf/bpf_endian.h>

// Packet context passed from the main XDP program via per-CPU map.
struct pkt_context {
    __u32 src_ip;
    __u32 dst_ip;
    __u16 src_port;
    __u16 dst_port;
    __u8  protocol;     // IPPROTO_TCP=6, IPPROTO_UDP=17, IPPROTO_ICMP=1
    __u8  tcp_flags;    // FIN|SYN|RST|PSH|ACK|URG packed into low 6 bits
    __u8  icmp_type;
    __u8  icmp_code;
    __u32 pkt_len;
    __u64 timestamp;    // bpf_ktime_get_ns()
    __u32 ifindex;
    __u32 __reserved[3];
};

// Per-CPU shared context map - rewritten at load time to reference main program's map.
struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct pkt_context);
} pkt_ctx_map SEC(".maps");

// Tail call dispatch map - rewritten at load time.
struct {
    __uint(type, BPF_MAP_TYPE_PROG_ARRAY);
    __uint(max_entries, 16);
    __type(key, __u32);
    __type(value, __u32);
} prog_filter_map SEC(".maps");

// Private per-filter state (per-CPU, NOT shared with other filters).
struct filter_state {
    __u64 match_count;
    __u64 drop_count;
    __u64 pass_count;
    __u64 counters[13];      // general purpose counters
    __u64 timestamps[32];    // per-bucket timestamps for rate tracking
    __u32 bloom_bits[8];     // 256-bit bloom filter for IP tracking
};

struct {
    __uint(type, BPF_MAP_TYPE_PERCPU_ARRAY);
    __uint(max_entries, 1);
    __type(key, __u32);
    __type(value, struct filter_state);
} filter_state_map SEC(".maps");

// ---- Protocol constants ----
#define PKT_PROTO_ICMP   1
#define PKT_PROTO_TCP    6
#define PKT_PROTO_UDP   17

// ---- TCP flag bits ----
#define PKT_TCP_FIN  0x01
#define PKT_TCP_SYN  0x02
#define PKT_TCP_RST  0x04
#define PKT_TCP_PSH  0x08
#define PKT_TCP_ACK  0x10
#define PKT_TCP_URG  0x20

// ---- Helper macros for generated code ----

// Extract individual bytes from a network-order IP
#define IP_BYTE(ip, n) ((__u8)(((ip) >> ((n) * 8)) & 0xFF))

// Match an IP against literal octets (a.b.c.d in host display order)
#define IP_MATCH(ip, a, b, c, d) \
    ((ip) == ((__u32)(a) | (__u32)(b) << 8 | (__u32)(c) << 16 | (__u32)(d) << 24))

// Check if IP is in a /24 subnet
#define IP_IN_SUBNET24(ip, a, b, c) \
    (((ip) & 0x00FFFFFF) == ((__u32)(a) | (__u32)(b) << 8 | (__u32)(c) << 16))

// Check if IP is in a /16 subnet
#define IP_IN_SUBNET16(ip, a, b) \
    (((ip) & 0x0000FFFF) == ((__u32)(a) | (__u32)(b) << 8))

// Fast IP hash (Knuth multiplicative hash) -> 8-bit bucket index
static __always_inline __u32 ip_hash8(__u32 ip) {
    return (ip * 2654435761u) >> 24;
}

// Fast IP hash -> 5-bit bucket index (for timestamps array of 32)
static __always_inline __u32 ip_hash5(__u32 ip) {
    return (ip * 2654435761u) >> 27;
}

// Bloom filter operations on filter_state.bloom_bits[8]
static __always_inline void bloom_add(struct filter_state *state, __u32 ip) {
    __u32 h1 = (ip * 2654435761u) >> 24;
    __u32 h2 = (ip * 2246822519u) >> 24;
    state->bloom_bits[h1 >> 5] |= (1u << (h1 & 31));
    state->bloom_bits[h2 >> 5] |= (1u << (h2 & 31));
}

static __always_inline int bloom_test(struct filter_state *state, __u32 ip) {
    __u32 h1 = (ip * 2654435761u) >> 24;
    __u32 h2 = (ip * 2246822519u) >> 24;
    return (state->bloom_bits[h1 >> 5] & (1u << (h1 & 31))) &&
           (state->bloom_bits[h2 >> 5] & (1u << (h2 & 31)));
}

// Chain to the next programmable filter in the pipeline.
// If no filter is installed at next_slot, execution falls through to XDP_PASS.
#define CHAIN_NEXT(ctx, next_slot) bpf_tail_call(ctx, &prog_filter_map, next_slot)

#endif /* __FILTER_TEMPLATE_H__ */
