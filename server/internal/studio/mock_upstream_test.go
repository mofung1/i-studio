package studio

import (
	"net/http"
	"net/http/httptest"
	"net/url"
)

// Tests map a public configured hostname to a local Mock Server without adding
// any runtime SSRF bypass or permitting private URLs in administrator input.
func mockUpstreamClient(server *httptest.Server) *http.Client {
	target, _ := url.Parse(server.URL)
	return &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		copied := r.Clone(r.Context())
		u := *r.URL
		u.Scheme = target.Scheme
		u.Host = target.Host
		copied.URL = &u
		return server.Client().Transport.RoundTrip(copied)
	})}
}
