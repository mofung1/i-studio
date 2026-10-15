package main

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/md5"  // Provider-defined CDN Type A protocol.
	"crypto/sha1" // Qiniu's documented download-token protocol.
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
)

type storageProfile struct {
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
type storageSecrets struct {
	AccessKey string `json:"accessKey"`
	SecretKey string `json:"secretKey"`
	CDNKey    string `json:"cdnKey"`
}
type signedObjectStorage interface {
	SignedURL(string, time.Duration) (string, error)
}
type cloudStorage struct {
	profile   storageProfile
	secrets   storageSecrets
	s3        *s3.Client
	s3Public  *s3.Client
	oss       *oss.Client
	ossPublic *oss.Client
}

func newCloudStorage(p storageProfile, secrets storageSecrets) (*cloudStorage, error) {
	return newCloudStorageWithClient(p, secrets, &http.Client{Timeout: 90 * time.Second})
}
func newCloudStorageWithClient(p storageProfile, secrets storageSecrets, client *http.Client) (*cloudStorage, error) {
	if err := validateStorageProfile(p); err != nil {
		return nil, err
	}
	if secrets.AccessKey == "" || secrets.SecretKey == "" {
		return nil, fmt.Errorf("存储访问密钥未配置")
	}
	c := &cloudStorage{profile: p, secrets: secrets}
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
func validateStorageProfile(p storageProfile) error {
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
	if p.CDNDomain != "" && p.CDNMode != "aliyun_type_a" && p.CDNMode != "tencent_type_a" && p.CDNMode != "qiniu_private" {
		return fmt.Errorf("CDN 必须启用对应的签名鉴权")
	}
	if p.CDNMode == "qiniu_private" && p.Provider != "qiniu" {
		return fmt.Errorf("七牛私有下载鉴权仅适用于七牛存储")
	}
	return nil
}
func (c *cloudStorage) objectKey(key string) (string, error) {
	if key == "" || strings.Contains(key, "\\") || path.IsAbs(key) || path.Clean(key) != key || key == ".." || strings.HasPrefix(key, "../") {
		return "", fmt.Errorf("invalid object key")
	}
	return path.Join(c.profile.Prefix, key), nil
}
func (c *cloudStorage) Save(key string, source io.Reader) error {
	key, err := c.objectKey(key)
	if err != nil {
		return err
	}
	data, err := io.ReadAll(io.LimitReader(source, maxGeneratedImageBytes+1))
	if err != nil {
		return err
	}
	if len(data) > maxGeneratedImageBytes {
		return fmt.Errorf("object exceeds size limit")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	contentType := mime.TypeByExtension(path.Ext(key))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	cache := "private, max-age=300"
	if c.oss != nil {
		_, err = c.oss.PutObject(ctx, &oss.PutObjectRequest{Bucket: &c.profile.Bucket, Key: &key, Body: bytes.NewReader(data), ContentType: &contentType, CacheControl: &cache})
	} else {
		_, err = c.s3.PutObject(ctx, &s3.PutObjectInput{Bucket: &c.profile.Bucket, Key: &key, Body: bytes.NewReader(data), ContentType: &contentType, CacheControl: &cache})
	}
	return err
}
func (c *cloudStorage) Open(key string) (io.ReadCloser, error) {
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
func (c *cloudStorage) Delete(key string) error {
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
func (c *cloudStorage) SignedURL(key string, ttl time.Duration) (string, error) {
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
		return result.URL, nil
	}
	result, err := s3.NewPresignClient(c.s3Public).PresignGetObject(ctx, &s3.GetObjectInput{Bucket: &c.profile.Bucket, Key: &key}, func(o *s3.PresignOptions) { o.Expires = ttl })
	if err != nil {
		return "", err
	}
	return result.URL, nil
}
func (c *cloudStorage) cdnURL(key string, ttl time.Duration, now time.Time) (string, error) {
	u, err := url.Parse(strings.TrimRight(c.profile.CDNDomain, "/") + "/")
	if err != nil {
		return "", err
	}
	u.Path = "/" + key
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
