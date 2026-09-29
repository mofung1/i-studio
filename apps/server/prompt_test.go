package main

import (
	"bytes"
	"context"
	"encoding/json"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

type fakePromptClient struct {
	model    string
	lastText string
	images   int
	reply    string
	err      error
}

func (f *fakePromptClient) complete(_ context.Context, _ string, userText string, images []promptImage, _ int) (string, error) {
	f.lastText = userText
	f.images = len(images)
	if f.err != nil {
		return "", f.err
	}
	return f.reply, nil
}

func (f *fakePromptClient) modelName() string { return f.model }

func newPromptRequest(t *testing.T, token string, text string, imageCount int) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	if text != "" {
		_ = writer.WriteField("target", "prompt")
		_ = writer.WriteField("text", text)
	}
	for index := 0; index < imageCount; index++ {
		part, err := writer.CreateFormFile("images", "shot.png")
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		// 1x1 PNG
		_, _ = part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/prompts/enhance", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	return request
}

func TestPromptEnhanceRequiresTextOrImage(t *testing.T) {
	client := &fakePromptClient{model: "deepseek-flash", reply: "改写结果"}
	s := &server{secret: []byte("test-secret"), promptClient: client}
	token := s.token(user{ID: "user-1", Username: "demo"})

	recorder := httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, token, "", 0))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without text or image, got %d", recorder.Code)
	}

	longText := ""
	for index := 0; index < maxPromptTextRunes+1; index++ {
		longText += "字"
	}
	recorder = httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, token, longText, 0))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for over-long text, got %d", recorder.Code)
	}
}

func TestPromptEnhanceAcceptsTextOrImage(t *testing.T) {
	client := &fakePromptClient{model: "deepseek-flash", reply: "  改写后的提示词  "}
	s := &server{secret: []byte("test-secret"), promptClient: client}
	token := s.token(user{ID: "user-1", Username: "demo"})

	recorder := httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, token, "一支绿色保温杯", 0))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 for text only, got %d: %s", recorder.Code, recorder.Body.String())
	}
	var payload struct {
		Text  string `json:"text"`
		Model string `json:"model"`
	}
	_ = json.Unmarshal(recorder.Body.Bytes(), &payload)
	if payload.Text != "改写后的提示词" || payload.Model != "deepseek-flash" {
		t.Fatalf("unexpected payload %#v", payload)
	}
	if client.images != 0 {
		t.Fatalf("expected no images, got %d", client.images)
	}

	// 只给图片、不给文字也要受理
	recorder = httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, token, "", 1))
	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 for image only, got %d: %s", recorder.Code, recorder.Body.String())
	}
	if client.images != 1 {
		t.Fatalf("expected 1 image forwarded, got %d", client.images)
	}
	if !bytes.Contains([]byte(client.lastText), []byte("用户没有输入文字")) {
		t.Fatalf("expected image-only hint, got %q", client.lastText)
	}
}

func TestPromptEnhanceAuthAndConfig(t *testing.T) {
	s := &server{secret: []byte("test-secret"), promptClient: &fakePromptClient{reply: "x"}}
	recorder := httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, "", "文案", 0))
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without token, got %d", recorder.Code)
	}

	unconfigured := &server{secret: []byte("test-secret")}
	token := unconfigured.token(user{ID: "user-1", Username: "demo"})
	recorder = httptest.NewRecorder()
	unconfigured.promptEnhance(recorder, newPromptRequest(t, token, "文案", 0))
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 when deepseek is not configured, got %d", recorder.Code)
	}
}

func TestPromptEnhanceUpstreamFailure(t *testing.T) {
	client := &fakePromptClient{err: context.DeadlineExceeded}
	s := &server{secret: []byte("test-secret"), promptClient: client}
	token := s.token(user{ID: "user-1", Username: "demo"})

	recorder := httptest.NewRecorder()
	s.promptEnhance(recorder, newPromptRequest(t, token, "文案", 0))
	if recorder.Code != http.StatusBadGateway {
		t.Fatalf("expected 502 on upstream failure, got %d", recorder.Code)
	}
}

// newPromptRequestWithFields 组装带额外表单字段的 multipart 请求（同一 key 可重复）。
func newPromptRequestWithFields(t *testing.T, token, text string, imageCount int, fields [][2]string) *http.Request {
	t.Helper()
	body := &bytes.Buffer{}
	writer := multipart.NewWriter(body)
	_ = writer.WriteField("target", "requirements")
	if text != "" {
		_ = writer.WriteField("text", text)
	}
	for _, field := range fields {
		_ = writer.WriteField(field[0], field[1])
	}
	for index := 0; index < imageCount; index++ {
		part, err := writer.CreateFormFile("images", "shot.png")
		if err != nil {
			t.Fatalf("create form file: %v", err)
		}
		_, _ = part.Write([]byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a})
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close writer: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/v1/prompts/enhance", body)
	request.Header.Set("Content-Type", writer.FormDataContentType())
	if token != "" {
		request.Header.Set("Authorization", "Bearer "+token)
	}
	return request
}

// 回归：比例、分辨率不参与提示词生成；模块组合必须带给模型，否则详情页会拿到与自身无关的描述。
func TestBuildPromptUserTextDropsOutputSpecsAndKeepsModules(t *testing.T) {
	request := newPromptRequestWithFields(t, "token", "帮我写详情页", 0, [][2]string{
		{"taskType", "detail-page"},
		{"platform", "tmall"},
		{"moduleMode", "custom"},
		{"modules", "首屏主视觉×1"},
		{"modules", "核心卖点图×2"},
		{"aspectRatio", "3:4"},
		{"resolution", "4K"},
	})
	if err := request.ParseMultipartForm(maxPromptBodySize); err != nil {
		t.Fatalf("parse multipart: %v", err)
	}

	text := buildPromptUserText("requirements", "帮我写详情页", request)
	for _, unwanted := range []string{"画面比例", "分辨率", "3:4", "4K"} {
		if strings.Contains(text, unwanted) {
			t.Fatalf("输出规格 %q 不应出现在提示词上下文：%q", unwanted, text)
		}
	}
	for _, wanted := range []string{"电商详情页素材", "天猫", "自定义模块：首屏主视觉×1、核心卖点图×2"} {
		if !strings.Contains(text, wanted) {
			t.Fatalf("提示词上下文缺少 %q：%q", wanted, text)
		}
	}
}

// 智能组合时也要让模型知道模块由 AI 自动搭配，而不是收到空上下文。
func TestBuildPromptUserTextSmartModuleMode(t *testing.T) {
	request := newPromptRequestWithFields(t, "token", "", 1, [][2]string{
		{"taskType", "detail-page"},
		{"moduleMode", "smart"},
	})
	if err := request.ParseMultipartForm(maxPromptBodySize); err != nil {
		t.Fatalf("parse multipart: %v", err)
	}
	text := buildPromptUserText("requirements", "", request)
	if !strings.Contains(text, "由 AI 依据商品与平台自动组合模块") {
		t.Fatalf("智能组合应说明模块来源：%q", text)
	}
}

// 回归：不同板块要拿到各自的表达重点，通用生图不带电商板块说明。
func TestPromptSystemGuidanceFollowsTaskType(t *testing.T) {
	detail := promptSystem("requirements", "detail-page")
	if !strings.Contains(detail, "电商详情页素材") || strings.Contains(detail, "本次任务是商品主图") {
		t.Fatalf("详情页应拿到详情页说明：%q", detail)
	}

	main := promptSystem("requirements", "product-main")
	if !strings.Contains(main, "本次任务是商品主图") || strings.Contains(main, "电商详情页素材，会按模块成套产出") {
		t.Fatalf("商品主图应拿到主图说明：%q", main)
	}

	general := promptSystem("prompt", "")
	if strings.Contains(general, "本次任务是") {
		t.Fatalf("通用生图不应带电商板块说明：%q", general)
	}
}
