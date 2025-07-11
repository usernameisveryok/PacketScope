package main

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror -I/usr/include -I../../include -I../../bpf" connTracker ../../bpf/conn_tracker.c
