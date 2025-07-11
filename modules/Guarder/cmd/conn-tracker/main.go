package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	// "strings"
	"syscall"
	"time"

	"github.com/cilium/ebpf/link"
	"github.com/cilium/ebpf/rlimit"
)

//go:generate go run github.com/cilium/ebpf/cmd/bpf2go -cc clang -cflags "-O2 -g -Wall -Werror -I../../include" connTracker ../../bpf/conn_tracker.c

var (
	ifaceName   = flag.String("iface", "", "Interface to attach XDP program")
	pollInterval = flag.Int("interval", 10, "Polling interval in seconds")
	apiAddr      = flag.String("api", ":8080", "API server address")
	debug       = flag.Bool("debug", false, "Enable debug mode to print all connections")
)

func init() {
	flag.Parse()
}

func main() {
	flag.Parse()

	if *ifaceName == "" {
		log.Fatal("Please specify interface name with -iface")
	}

	// Allow the current process to lock memory for eBPF resources
	if err := rlimit.RemoveMemlock(); err != nil {
		log.Fatalf("Failed to remove memory lock: %v", err)
	}

	// Load pre-compiled BPF program
	objs := connTrackerObjects{}
	if err := loadConnTrackerObjects(&objs, nil); err != nil {
		log.Fatalf("Failed to load BPF objects: %v", err)
	}
	defer objs.Close()

	// Attach the program to XDP
	ifaceObj, err := net.InterfaceByName(*ifaceName)
	if err != nil {
		log.Fatalf("Failed to get interface %s: %v", *ifaceName, err)
	}
	
	iface, err := link.AttachXDP(link.XDPOptions{
		Program:   objs.ConnTracker,
		Interface: ifaceObj.Index,
	})
	if err != nil {
		log.Fatalf("Failed to attach XDP program: %v", err)
	}
	defer iface.Close()

	log.Printf("Successfully attached XDP program to interface %s", *ifaceName)

	// Create and start API server
	apiServer := NewAPIServer(&objs)
	go func() {
		if err := apiServer.Start(*apiAddr); err != nil {
			log.Printf("API server error: %v", err)
		}
	}()

	// Start polling maps
	stopChan := make(chan struct{})
	go pollMaps(objs, stopChan)

	log.Printf("Successfully started! Please run the following command to see BPF trace output:")
	log.Printf("sudo cat /sys/kernel/debug/tracing/trace_pipe")

	// Graceful shutdown
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig

	log.Println("Shutting down...")
	close(stopChan)
}

func pollMaps(objs connTrackerObjects, stopChan <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(*pollInterval) * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Only print connections and ICMP stats in debug mode
			if *debug {
				// Print TCP/UDP connections
				fmt.Println("\n=== TCP/UDP Connections ===")
				
				connections, err := GetConnections(objs.ConnMap)
				if err != nil {
					log.Printf("Error getting connections: %v", err)
					continue
				}
				
				for _, conn := range connections {
					fmt.Println(conn.Key)
					fmt.Printf("  %s\n\n", conn.Info)
				}

				// Print ICMP statistics
				fmt.Println("\n=== ICMP Statistics ===")
				
				icmpEntries, err := GetICMPEntries(objs.IcmpMap)
				if err != nil {
					log.Printf("Error getting ICMP entries: %v", err)
					continue
				}
				
				for _, entry := range icmpEntries {
					fmt.Println(entry.Key)
					fmt.Printf("  %s\n\n", entry.Info)
				}
			}

		case <-stopChan:
			return
		}
	}
}

func getProtocolName(proto uint8) string {
	switch proto {
	case 6:
		return "TCP"
	case 17:
		return "UDP"
	default:
		return "Unknown"
	}
}

func formatTime(ns uint64) string {
	bootTime := time.Now().UnixNano() - int64(ns)
	unixTime := time.Unix(0, bootTime)
	return unixTime.Format(time.RFC3339)
} 