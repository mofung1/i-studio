package storage

import (
	"bytes"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

type storageTransport func(*http.Request) (*http.Response, error)

func (f storageTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func cloudFixture(provider string) Profile {
	return Profile{ID: "store_fixture", Name: "测试存储", Provider: provider, Endpoint: "https://storage.example.com", PublicEndpoint: "https://download.example.com", Region: "cn-east-1", Bucket: "private-images", Prefix: "studio", PathStyle: provider != "aliyun"}
}

func TestCloudAdaptersRoundTripAndPrivatePresigning(t *testing.T) {
	for _, provider := range []string{"aliyun", "qiniu", "tencent", "s3"} {
		t.Run(provider, func(t *testing.T) {
			var saved []byte
			var methods []string
			transport := storageTransport(func(r *http.Request) (*http.Response, error) {
				methods = append(methods, r.Method)
				if r.Header.Get("Authorization") == "" {
					t.Fatal("unsigned cloud request")
				}
				if !strings.HasSuffix(r.URL.Path, "/studio/images/fixture.png") {
					t.Fatal("wrong object location", r.URL.Path)
				}
				response := &http.Response{StatusCode: 200, Header: http.Header{"Etag": []string{`"fixture"`}}, Body: io.NopCloser(strings.NewReader("")), Request: r}
				switch r.Method {
				case "PUT":
					saved, _ = io.ReadAll(r.Body)
					if r.Header.Get("Content-Type") != "image/png" {
						t.Fatal("missing image content type")
					}
				case "GET":
					response.Body = io.NopCloser(bytes.NewReader(saved))
					response.ContentLength = int64(len(saved))
				case "DELETE":
					saved = nil
				}
				return response, nil
			})
			p := cloudFixture(provider)
			c, err := NewCloudWithClient(p, Secrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}, &http.Client{Transport: transport})
			if err != nil {
				t.Fatal(err)
			}
			if err = c.Save("images/fixture.png", strings.NewReader("fixture-image-bytes")); err != nil {
				t.Fatal(err)
			}
			file, err := c.Open("images/fixture.png")
			if err != nil {
				t.Fatal(err)
			}
			data, _ := io.ReadAll(file)
			_ = file.Close()
			if string(data) != "fixture-image-bytes" {
				t.Fatal("cloud round trip corrupted data", string(data))
			}
			signed, err := c.SignedURL("images/fixture.png", 5*time.Minute)
			if err != nil {
				t.Fatal(err)
			}
			u, _ := url.Parse(signed)
			if !strings.Contains(u.Host, "download.example.com") || u.RawQuery == "" || strings.Contains(signed, "fixture-secret") {
				t.Fatal("invalid presigned download", u.Host)
			}
			if len(methods) != 2 {
				t.Fatal("signing performed a network request")
			}
			if err = c.Delete("images/fixture.png"); err != nil {
				t.Fatal(err)
			}
			if saved != nil {
				t.Fatal("cloud deletion did not execute")
			}
		})
	}
}

func TestCDNSigningUsesProviderProtocol(t *testing.T) {
	// Published Alibaba Type A example, independent of implementation.
	now := time.Unix(1444435200, 0)
	c := &Cloud{profile: Profile{CDNDomain: "https://cdn.example.com", CDNMode: "aliyun_type_a"}, secrets: Secrets{CDNKey: "aliyuncdnexp1234"}}
	signed, err := c.cdnURL("video/standard/test.mp4", 5*time.Minute, now)
	u, _ := url.Parse(signed)
	if err != nil || u.Query().Get("auth_key") != "1444435200-0-0-23bf85053008f5c0e791667a313e28ce" {
		t.Fatal("Type A signature mismatch", u.Query().Get("auth_key"), err)
	}

	c.profile.CDNMode = "tencent_type_a"
	signed, err = c.cdnURL("video/standard/test.mp4", 5*time.Minute, now)
	u, _ = url.Parse(signed)
	if err != nil || u.Query().Get("sign") == "" || u.Query().Get("auth_key") != "" {
		t.Fatal("Tencent parameter mismatch", err)
	}
	c.profile.CDNMode = "qiniu_private"
	c.secrets = Secrets{AccessKey: "fixture-access", SecretKey: "fixture-secret"}
	signed, err = c.cdnURL("images/a.png", 5*time.Minute, now)
	u, _ = url.Parse(signed)
	if err != nil || u.Query().Get("e") != "1444435500" || !strings.HasPrefix(u.Query().Get("token"), "fixture-access:") || !strings.Contains(signed, "&token=") {
		t.Fatal("invalid Qiniu token", err)
	}
}
