package studio

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"net/netip"
	"time"
)

// Only provider image downloads use this transport. Configured AI endpoints
// may be self-hosted, but URLs returned inside model output are untrusted.
func newPublicImageClient() *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = dialPublicImage
	return &http.Client{Timeout: 45 * time.Second, Transport: transport}
}

func publicImageAddress(ip net.IP) bool {
	address, ok := netip.AddrFromSlice(ip)
	if !ok {
		return false
	}
	address = address.Unmap()
	if !address.IsGlobalUnicast() || address.IsPrivate() || address.IsLoopback() || address.IsLinkLocalUnicast() {
		return false
	}
	// CGNAT, benchmarking, documentation and IPv6 translation ranges can route
	// back into private infrastructure despite not being classified IsPrivate.
	for _, block := range []string{"0.0.0.0/8", "100.64.0.0/10", "192.0.0.0/24", "192.0.2.0/24", "198.18.0.0/15", "198.51.100.0/24", "203.0.113.0/24", "240.0.0.0/4", "64:ff9b::/96", "64:ff9b:1::/48", "2001::/23", "2001:db8::/32", "2002::/16"} {
		if netip.MustParsePrefix(block).Contains(address) {
			return false
		}
	}
	return true
}

func dialPublicImage(ctx context.Context, network, target string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(target)
	if err != nil {
		return nil, err
	}
	addresses, err := net.DefaultResolver.LookupIPAddr(ctx, host)
	if err != nil || len(addresses) == 0 {
		return nil, fmt.Errorf("image host unavailable")
	}
	for _, address := range addresses {
		if !publicImageAddress(address.IP) || address.Zone != "" {
			return nil, fmt.Errorf("private image host is not allowed")
		}
	}
	// Dial the checked address, never resolve the hostname a second time.
	dialer := net.Dialer{Timeout: 10 * time.Second, KeepAlive: 30 * time.Second}
	for _, address := range addresses {
		connection, dialErr := dialer.DialContext(ctx, network, net.JoinHostPort(address.IP.String(), port))
		if dialErr == nil {
			return connection, nil
		}
		err = dialErr
	}
	return nil, err
}
