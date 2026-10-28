package storage

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"time"

	"github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss"
	osscredentials "github.com/aliyun/alibabacloud-oss-go-sdk-v2/oss/credentials"
	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"

	"github.com/istudio/server/internal/domain"
)

type Profile struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Provider         string `json:"provider"`
	Endpoint         string `json:"endpoint"`
	PublicEndpoint   string `json:"publicEndpoint"`
	Region           string `json:"region"`
	Bucket           string `json:"bucket"`
	Prefix           string `json:"prefix"`
	PathStyle        bool   `json:"pathStyle"`
	CDNDomain        string `json:"cdnDomain"`
	CDNMode          string `json:"cdnMode"`
	EncryptedSecrets string `json:"-"`
	HasCredentials   bool   `json:"hasCredentials"`
	HasCDNKey        bool   `json:"hasCdnKey"`
}

type Secrets struct {
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	CDNKey    string `json:"cdnKey"`
}

type SignedStore interface {
	SignedURL(string, time.Duration) (string, error)
}

type Cloud struct {
	profile   Profile
	secrets   Secrets
	s3        *s3.Client
	s3Public  *s3.Client
	oss       *oss.Client
	ossPublic *oss.Client
}

func NewCloud(p Profile, secrets Secrets) (*Cloud, error) {
	return NewCloudWithClient(p, secrets, &http.Client{Timeout: 90 * time.Second})
}

func NewCloudWithClient(p Profile, secrets Secrets, client *http.Client) (*Cloud, error) {
	if err := ValidateProfile(p); err != nil {
		return nil, err
	}
	if secrets.AccessKey == "" || secrets.SecretKey == "" {
		return nil, fmt.Errorf("存储访问密钥未配置")
	}
	c := &Cloud{profile: p, secrets: secrets}
	endpoint := p.PublicEndpoint
	if endpoint == "" {
		endpoint = p.Endpoint
	}
	if p.Provider == "aliyun" {
		config := func(endpoint string) *oss.Config {
			return oss.LoadDefaultConfig().WithRegion(p.Region).WithEndpoint(endpoint).WithCredentialsProvider(osscredentials.NewStaticCredentialsProvider(secrets.AccessKey, secrets.SecretKey)).WithHttpClient(client)
		}
		c.oss = oss.NewClient(config(p.Endpoint))
		c.ossPublic = oss.NewClient(config(endpoint))
	} else {
		config := aws.Config{Region: p.Region, Credentials: credentials.NewStaticCredentialsProvider(secrets.AccessKey, secrets.SecretKey, ""), HTTPClient: client, RetryMaxAttempts: 3, RequestChecksumCalculation: aws.RequestChecksumCalculationWhenRequired, ResponseChecksumValidation: aws.ResponseChecksumValidationWhenRequired}
		makeClient := func(endpoint string) *s3.Client {
			return s3.NewFromConfig(config, func(o *s3.Options) { o.BaseEndpoint = &endpoint; o.UsePathStyle = p.PathStyle })
		}
		c.s3 = makeClient(p.Endpoint)
		c.s3Public = makeClient(endpoint)
	}
	return c, nil
}

func ValidateProfile(p Profile) error {
	if p.Provider != "aliyun" && p.Provider != "qiniu" && p.Provider != "tencent" && p.Provider != "s3" {
		return fmt.Errorf("不支持的存储平台")
	}
	if strings.TrimSpace(p.Name) == "" || len(p.Name) > 100 || p.Bucket == "" || len(p.Bucket) > 128 || p.Region == "" {
		return fmt.Errorf("请填写名称、区域和存储桶")
	}
	for _, value := range []string{p.Endpoint, p.PublicEndpoint, p.CDNDomain} {
		if value == "" {
			continue
		}
		u, err := url.Parse(value)
		if err != nil || u.Scheme != "https" || u.Hostname() == "" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || u.Path != "" && u.Path != "/" {
			return fmt.Errorf("存储和 CDN 地址需为 HTTPS 域名，不含路径、账号或查询参数")
		}
	}
	if p.Endpoint == "" {
		return fmt.Errorf("请填写存储 Endpoint")
	}
	if p.Prefix != "" && (strings.HasPrefix(p.Prefix, "/") || strings.Contains(p.Prefix, "\\") || path.Clean(p.Prefix) != p.Prefix || p.Prefix == ".." || strings.HasPrefix(p.Prefix, "../")) {
		return fmt.Errorf("存储前缀必须为相对目录，不含末尾斜线")
	}
	if p.CDNDomain != "" && p.CDNMode != "public" && p.CDNMode != "aliyun_type_a" && p.CDNMode != "tencent_type_a" && p.CDNMode != "qiniu_private" {
		return fmt.Errorf("CDN 必须启用对应的签名鉴权")
	}
	if p.CDNMode == "qiniu_private" && p.Provider != "qiniu" {
		return fmt.Errorf("七牛私有下载鉴权仅适用于七牛存储")
	}
	// Qiniu rejects anonymous requests on its S3 service domains even for public
	// spaces, so a public profile only works through a bound CDN domain.
	if p.Provider == "qiniu" && p.CDNMode == "public" && p.CDNDomain == "" {
		return fmt.Errorf("七牛公开直链需填写 CDN 域名，S3 服务域名不支持匿名访问")
	}
	return nil
}

func (c *Cloud) PublicDownloads() bool { return c.profile.CDNMode == "public" }

// Shared caches ignore "private", so a public profile must label objects
// explicitly. Curated covers never change under the same key and can be cached
// for a month; user content uses a day so deletions reach the edge quickly.
func objectCacheControl(mode, key string) string {
	if mode != "public" {
		return "private, max-age=300"
	}
	if strings.HasPrefix(key, "inspiration/") {
		return "public, max-age=2592000, immutable"
	}
	return "public, max-age=86400"
}

// CacheControl is the lifetime for a redirect to a public profile URL. It stays
// short so switching platforms or CDN domains takes effect without a purge.
func (c *Cloud) CacheControl() string {
	if !c.PublicDownloads() {
		return ""
	}
	return "public, max-age=600"
}

func (c *Cloud) downloadURL(target string) string {
	if c.PublicDownloads() {
		u, err := url.Parse(target)
		if err == nil {
			u.RawQuery = ""
			return u.String()
		}
	}
	return target
}

func (c *Cloud) objectKey(key string) (string, error) {
	if key == "" || strings.Contains(key, "\\") || path.IsAbs(key) || path.Clean(key) != key || key == ".." || strings.HasPrefix(key, "../") {
		return "", fmt.Errorf("invalid object key")
	}
	return path.Join(c.profile.Prefix, key), nil
}

func (c *Cloud) Save(key string, source io.Reader) error {
	cache := objectCacheControl(c.profile.CDNMode, key)
	key, err := c.objectKey(key)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(io.LimitReader(source, domain.MaxGeneratedImageBytes+1))
	if err != nil {
		return err
	}
	if len(data) > domain.MaxGeneratedImageBytes {
		return fmt.Errorf("object exceeds size limit")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	contentType := mime.TypeByExtension(path.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	if c.oss != nil {
		_, err = c.oss.PutObject(ctx, &oss.PutObjectRequest{Bucket: &c.profile.Bucket, Key: &key, Body: bytes.NewReader(data), ContentType: &contentType, CacheControl: &cache})
	} else {
		_, err = c.s3.PutObject(ctx, &s3.PutObjectInput{Bucket: &c.profile.Bucket, Key: &key, Body: bytes.NewReader(data), ContentType: &contentType, CacheControl: &cache})
	}
	return err
}

func (c *Cloud) Open(key string) (io.ReadCloser, error) {
	key, err := c.objectKey(key)
	if err != nil {
		return nil, err
	}
	// The HTTP client's timeout includes consuming the response body.
	if c.oss != nil {
		response, err := c.oss.GetObject(context.Background(), &oss.GetObjectRequest{Bucket: &c.profile.Bucket, Key: &key})
		if err != nil {
			return nil, err
		}
		return response.Body, nil
	}
	response, err := c.s3.GetObject(context.Background(), &s3.GetObjectInput{Bucket: &c.profile.Bucket, Key: &key})
	if err != nil {
		return nil, err
	}
	return response.Body, nil
}

func (c *Cloud) Delete(key string) error {
	key, err := c.objectKey(key)
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if c.oss != nil {
		_, err = c.oss.DeleteObject(ctx, &oss.DeleteObjectRequest{Bucket: &c.profile.Bucket, Key: &key})
	} else {
		_, err = c.s3.DeleteObject(ctx, &s3.DeleteObjectInput{Bucket: &c.profile.Bucket, Key: &key})
	}
	return err
}

func (c *Cloud) SignedURL(key string, ttl time.Duration) (string, error) {
	key, err := c.objectKey(key)
	if err != nil {
		return "", err
	}
	if c.profile.CDNDomain != "" {
		return c.cdnURL(key, ttl, time.Now())
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if c.ossPublic != nil {
		result, err := c.ossPublic.Presign(ctx, &oss.GetObjectRequest{Bucket: &c.profile.Bucket, Key: &key}, func(o *oss.PresignOptions) { o.Expires = ttl })
		if err != nil {
			return "", err
		}
		return c.downloadURL(result.URL), nil
	}
	result, err := s3.NewPresignClient(c.s3Public).PresignGetObject(ctx, &s3.GetObjectInput{Bucket: &c.profile.Bucket, Key: &key}, func(o *s3.PresignOptions) { o.Expires = ttl })
	if err != nil {
		return "", err
	}
	return c.downloadURL(result.URL), nil
}

func (c *Cloud) cdnURL(key string, ttl time.Duration, now time.Time) (string, error) {
	u, err := url.Parse(strings.TrimRight(c.profile.CDNDomain, "/") + "/")
	if err != nil {
		return "", err
	}
	u.Path = "/" + key
	if c.PublicDownloads() {
		return u.String(), nil
	}
	if c.profile.CDNMode == "qiniu_private" {
		q := u.Query()
		q.Set("e", strconv.FormatInt(now.Add(ttl).Unix(), 10))
		u.RawQuery = q.Encode()
		mac := hmac.New(sha1.New, []byte(c.secrets.SecretKey))
		mac.Write([]byte(u.String()))
		return u.String() + "&token=" + url.QueryEscape(c.secrets.AccessKey+":"+base64.URLEncoding.EncodeToString(mac.Sum(nil))), nil
	}
	if c.secrets.CDNKey == "" {
		return "", fmt.Errorf("CDN 鉴权密钥未配置")
	}
	// CDN console TTL must be 300 seconds; timestamp is the signing time.
	if ttl < 0 {
		now = now.Add(ttl - 5*time.Minute)
	}
	stamp := strconv.FormatInt(now.Unix(), 10) + "-0-0"
	digest := md5.Sum([]byte(u.EscapedPath() + "-" + stamp + "-" + c.secrets.CDNKey))
	q := u.Query()
	parameter := "auth_key"
	if c.profile.CDNMode == "tencent_type_a" {
		parameter = "sign"
	}
	q.Set(parameter, fmt.Sprintf("%s-%x", stamp, digest))
	u.RawQuery = q.Encode()
	return u.String(), nil
}
