package studio

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Hostnames are resolved and checked again at dial time, then the checked IP is
// dialled directly. Proxies and redirects cannot bypass this policy.
func validateAIBaseURL(raw string) error {
	u, err := url.Parse(raw)
	if err != nil || u.Hostname() == "" || (u.Scheme != "https" && u.Scheme != "http") || u.User != nil || u.RawQuery != "" || u.Fragment != "" {
		return fmt.Errorf("Base URL 必须为不含凭据、查询或片段的 HTTP(S) 地址")
	}
	host := strings.ToLower(strings.TrimSuffix(u.Hostname(), "."))
	if host == "localhost" || strings.HasSuffix(host, ".localhost") || strings.HasSuffix(host, ".local") || strings.Contains(host, "%") {
		return fmt.Errorf("Base URL 不允许本地或私有地址")
	}
	if ip := net.ParseIP(host); ip != nil && !publicImageAddress(ip) {
		return fmt.Errorf("Base URL 不允许本地或私有地址")
	}
	return nil
}
func secureProtocolHTTPClient(timeout time.Duration) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = nil
	transport.DialContext = dialPublicImage
	return &http.Client{Timeout: timeout, Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
}
func (s *Service) imageProtocolClient(e endpointConfig, key string) imageProvider {
	c := newImageProtocolClient(e, key)
	if s.aiHTTPClient != nil {
		c.(*imageProtocolTransport).client = s.aiHTTPClient
	}
	return c
}

func (s *Service) openAIProtocolClient(e endpointConfig, key string) *openAICompatibleClient {
	c := newOpenAICompatibleClient(e, key)
	if s.aiHTTPClient != nil {
		c.client = s.aiHTTPClient
	}
	return c
}
