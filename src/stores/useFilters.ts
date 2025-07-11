// useFilters.ts
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { type MessageInstance } from 'antd/es/message/interface';

export interface Filter {
  id: number;
  rule_type: 'basic' | 'tcp' | 'udp' | 'icmp';
  src_ip?: string;
  dst_ip?: string;
  src_port?: number;
  dst_port?: number;
  protocol?: string;
  action: 'allow' | 'drop';
  enabled: boolean;
  comment?: string;
  ai_generated?: boolean;
  ai_confidence?: number;
  ai_reason?: string;
  tcp_flags?: number;
  tcp_flags_mask?: number;
  icmp_type?: number;
  icmp_code?: number;
  inner_src_ip?: string;
  inner_dst_ip?: string;
  inner_protocol?: number | string;
}

interface FilterState {
  filters: Filter[];
  initFilters: (messageApi?: MessageInstance) => Promise<void>;
  fetchFilters: (messageApi?: MessageInstance) => Promise<void>;
  addFilter: (filter: Partial<Filter>, messageApi?: MessageInstance) => Promise<void>;
  updateFilter: (id: number, filter: Partial<Filter>, messageApi?: MessageInstance) => Promise<void>;
  deleteFilter: (id: number, messageApi?: MessageInstance) => Promise<void>;
  toggleFilter: (id: number, messageApi?: MessageInstance) => Promise<void>;
}

const HOST = 'http://localhost:8080';

export const useFilters = create<FilterState>()(
  devtools((set, get) => ({
    filters: [],
    initFilters: async (messageApi) => {
      try {
        const res = await fetch(`${HOST}/api/filters`);
        if (!res.ok) throw new Error('接口错误');
        const data: Filter[] = await res.json();
        if (data.length === 0) {
          await get().addFilter({
            rule_type: 'icmp',
            protocol: 'icmp',
            icmp_type: 8,
            icmp_code: 0,
            action: 'drop',
            enabled: false,
            comment: 'Block all ICMP ping requests (Echo Request)',
          });
          await get().addFilter({
            rule_type: 'icmp',
            protocol: 'icmp',
            icmp_type: 3,
            inner_protocol: 'udp',
            action: 'drop',
            enabled: false,
            comment: 'Block ICMP Destination Unreachable with inner UDP packets',
          });
          await get().addFilter({
            rule_type: 'icmp',
            protocol: 'icmp',
            icmp_type: 11,
            inner_protocol: 'udp',
            action: 'drop',
            enabled: false,
            comment: 'Block UDP traceroute attempts (ICMP Time Exceeded)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 23,
            action: 'drop',
            enabled: false,
            comment: 'Block Telnet (insecure remote access)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 135,
            action: 'drop',
            enabled: false,
            comment: 'Block RPC Endpoint Mapper (Windows vulnerability)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 445,
            action: 'drop',
            enabled: false,
            comment: 'Block SMB/CIFS (ransomware vector)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 139,
            action: 'drop',
            enabled: false,
            comment: 'Block NetBIOS Session Service',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 1433,
            action: 'drop',
            enabled: false,
            comment: 'Block MS SQL Server (external access)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 3389,
            action: 'drop',
            enabled: false,
            comment: 'Block RDP (brute force target)',
          });
          await get().addFilter({
            rule_type: 'tcp',
            protocol: 'tcp',
            dst_port: 5900,
            action: 'drop',
            enabled: false,
            comment: 'Block VNC (insecure remote access)',
          });
        }
      } catch (err) {
        messageApi?.error('获取过滤器失败');
        console.error(err);
      }
    },

    fetchFilters: async (messageApi) => {
      try {
        const res = await fetch(`${HOST}/api/filters`);
        if (!res.ok) throw new Error('接口错误');
        const data: Filter[] = await res.json();
        const newFilters = data
          .map((item) => ({ ...item, key: item.id, ai_generated: item.comment?.includes('AI') }))
          .sort((a, b) => b.id - a.id);
        set({ filters: newFilters });
      } catch (err) {
        messageApi?.error('获取过滤器失败');
        console.error(err);
      }
    },

    addFilter: async (filter, messageApi) => {
      try {
        const res = await fetch(`${HOST}/api/filters`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        });
        if (!res.ok) throw new Error('添加失败');
        messageApi?.success('添加成功');
        await get().fetchFilters(messageApi);
      } catch (err) {
        messageApi?.error('添加过滤器失败');
        console.error(err);
      }
    },

    updateFilter: async (id, filter, messageApi) => {
      try {
        const res = await fetch(`${HOST}/api/filters/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(filter),
        });
        if (!res.ok) throw new Error('更新失败');
        messageApi?.success('更新成功');
        await get().fetchFilters(messageApi);
      } catch (err) {
        messageApi?.error('更新过滤器失败');
        console.error(err);
      }
    },

    deleteFilter: async (id, messageApi) => {
      try {
        const res = await fetch(`${HOST}/api/filters/${id}`, {
          method: 'DELETE',
        });
        if (!res.ok) throw new Error('删除失败');
        messageApi?.success('删除成功');
        await get().fetchFilters(messageApi);
      } catch (err) {
        messageApi?.error('删除过滤器失败');
        console.error(err);
      }
    },

    toggleFilter: async (id, messageApi) => {
      const current = get().filters.find((f) => f.id === id);
      if (!current) return;

      const endpoint = current.enabled ? 'disable' : 'enable';
      try {
        const res = await fetch(`${HOST}/api/filters/${id}/${endpoint}`, {
          method: 'POST',
        });
        if (!res.ok) throw new Error('切换失败');
        messageApi?.success(`${current.enabled ? '禁用' : '启用'}成功`);
        await get().fetchFilters(messageApi);
      } catch (err) {
        messageApi?.error('切换过滤器状态失败');
        console.error(err);
      }
    },
  })),
);
