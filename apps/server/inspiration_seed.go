package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"image"
	_ "image"
	_ "image/jpeg"
	_ "image/png"
)

// inspirationCase 是从画廊 markdown 解析出的单条案例。
type inspirationCase struct {
	Number    int
	Title     string
	Category  string
	Source    string
	Prompt    string
	ImageFile string // data/images/case1.jpg
}

// inspirationCategoryKeys 与 docs/gallery.md 分类概览的 13 个分类一一对应。
var inspirationCategoryKeys = []string{
	"UI 与界面", "信息图表", "海报排版", "商品电商", "品牌标志",
	"建筑空间", "摄影写实", "插画艺术", "人物角色", "场景叙事",
	"历史古风", "文档出版", "其他场景",
}

var (
	caseHeadingRE  = regexp.MustCompile(`^###\s+例\s+(\d+)\s*[：:]\s*(.+?)\s*$`)
	caseImageRE    = regexp.MustCompile(`!\[(?:[^\]\\]|\\.)*\]\(\.\./data/images/(case\d+\.(?:jpg|png|jpeg|webp))\)`)
	categoryLinkRE = regexp.MustCompile(`\]\(\./gallery-part-\d+\.md#case-(\d+)\)`)
)

// 18 条只在「推荐入口」区、未被分类区收录的案例，按标题归入最贴近的分类。
var fallbackCategories = map[int]string{
	1:   "信息图表",
	42:  "摄影写实",
	48:  "UI 与界面",
	50:  "建筑空间",
	66:  "信息图表",
	69:  "信息图表",
	82:  "信息图表",
	90:  "信息图表",
	133: "UI 与界面",
	159: "UI 与界面",
	166: "插画艺术",
	172: "插画艺术",
	243: "UI 与界面",
	280: "文档出版",
	301: "商品电商",
	318: "摄影写实",
	332: "海报排版",
	400: "海报排版",
}

// parseInspirationGallery 解析画廊 markdown，返回按案例号升序的案例列表。
// gallery 文件为 CRLF 换行，统一去除 \r 后再按行解析。
func parseInspirationGallery(galleryMarkdown, categoriesMarkdown string) ([]inspirationCase, error) {
	categories, err := parseInspirationCategories(categoriesMarkdown)
	if err != nil {
		return nil, err
	}

	scanner := bufio.NewScanner(strings.NewReader(strings.ReplaceAll(galleryMarkdown, "\r\n", "\n")))
	scanner.Buffer(make([]byte, 0, 1024*1024), 16*1024*1024)

	var cases []inspirationCase
	var current *inspirationCase
	var imageBuffer strings.Builder
	inPrompt := false

	for scanner.Scan() {
		line := scanner.Text()

		if inPrompt {
			if strings.TrimSpace(line) == "```" {
				inPrompt = false
				if current != nil && strings.TrimSpace(current.Prompt) != "" {
					cases = append(cases, *current)
				}
				current = nil
			} else {
				current.Prompt += line + "\n"
			}
			continue
		}

		if matches := caseHeadingRE.FindStringSubmatch(line); matches != nil {
			number, err := strconv.Atoi(matches[1])
			if err != nil {
				continue
			}
			current = &inspirationCase{Number: number, Title: strings.TrimSpace(matches[2])}
			continue
		}
		if current == nil {
			continue
		}

		switch {
		case strings.HasPrefix(line, "**来源：**"):
			current.Source = strings.TrimSpace(strings.TrimPrefix(line, "**来源：**"))
		case strings.Contains(line, "!["):
			// 图片 alt 可能跨行（闭合括号在后续行），累积到能匹配为止
			imageBuffer.Reset()
			imageBuffer.WriteString(line)
			for !caseImageRE.MatchString(imageBuffer.String()) && scanner.Scan() {
				imageBuffer.WriteString("\n" + scanner.Text())
			}
			if matches := caseImageRE.FindStringSubmatch(imageBuffer.String()); matches != nil {
				current.ImageFile = matches[1]
			}
		case strings.TrimSpace(line) == "```text":
			inPrompt = true
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}

	for index, item := range cases {
		if category, ok := categories[item.Number]; ok {
			cases[index].Category = category
		} else if fallback, ok := fallbackCategories[item.Number]; ok {
			cases[index].Category = fallback
		} else {
			cases[index].Category = "其他场景"
		}
		cases[index].Prompt = cleanInspirationText(cases[index].Prompt)
		cases[index].Source = cleanInspirationSource(cases[index].Source)
	}
	sort.Slice(cases, func(i, j int) bool { return cases[i].Number < cases[j].Number })
	return cases, nil
}

// markdownLinkRE 匹配来源行里的 markdown 链接 [@handle](https://x.com/handle)。
var markdownLinkRE = regexp.MustCompile(`\[([^\]]*)\]\(([^)]*)\)`)

// escapedBracketRE 匹配源文件里被整体转义的畸形链接
// \[OpenNana]\(]\(<https://x.com/...>)，括号前的反斜杠使其不是合法 markdown。
var escapedBracketRE = regexp.MustCompile(`\\?\[([^\]]*)\]\\?\]`)

// cleanInspirationSource 清洗来源：markdown 链接只保留可读的显示文本，
// 再去掉 \_ 之类的转义残留。例如：
//
//	[@wory37303852](https://x.com/wory37303852)            -> @wory37303852
//	[@mm\_zzm44854](https://x.com/mm_zzm44854)              -> @mm_zzm44854
//	小红书号insight\_express                                -> 小红书号insight_express
//	\[OpenNana]\(]\(<https://x.com/Toshi_nyaruo_AI/...>)    -> OpenNana
func cleanInspirationSource(source string) string {
	text := strings.ReplaceAll(source, "\\", "")
	if matches := markdownLinkRE.FindStringSubmatch(text); matches != nil {
		return cleanInspirationText(matches[1])
	}
	if matches := escapedBracketRE.FindStringSubmatch(text); matches != nil {
		return cleanInspirationText(matches[1])
	}
	return cleanInspirationText(source)
}

// argumentRE 匹配画廊里的模板占位符 {argument name="主题" default="寿司"}。
// 全部占位符都带 default，直接展开成默认值，否则页面上会显示一堆模板语法。
var argumentRE = regexp.MustCompile(`\{argument\s+name=\\?"([^\\"]*)\\?"\s+default=\\?"([^\\"]*)\\?"\}`)

// languageMarkerRE 匹配 prompt 开头的语言标记 [中文] / [English]。
// 这是作者标注 prompt 用的语言头，不是 prompt 内容，展示时去掉。
// 其余 [NEGATIVE] [STYLE] 之类是 prompt 的结构段落，属于内容，不动。
var languageMarkerRE = regexp.MustCompile(`(?m)^\[(?:中文|English)\]\s*$\n?`)

// placeholderBraceRE 匹配占位符外壳 { 角色名称 } / { CHARACTER NAME }，
// 这不是 JSON，是作者留的填空位，展示时剥掉只保留文字。
var placeholderBraceRE = regexp.MustCompile(`(?s)\{\s*([A-Za-z一-鿿][^{}\n]*?)\s*\}`)

// jsonFieldRE 匹配 JSON prompt 里的 "key": "value" 字符串对。
// value 允许含转义引号 \"，但不跨嵌套层级——只取叶子字符串。
var jsonFieldRE = regexp.MustCompile(`(?s)"([^"\n]+)"\s*:\s*"((?:[^"\\]|\\.)*)"`)

// jsonSkipKeys 是纯排版/元数据字段，拍平时丢弃：
// 位置、数量、比例、分辨率这类信息在生图时由工作台参数控制，不属于画面描述。
var jsonSkipKeys = map[string]bool{
	"position": true, "count": true, "alignment": true, "order": true,
	"aspect ratio": true, "aspect_ratio": true, "resolution": true,
	"language": true, "size": true, "font": true, "columns": true,
	"rows": true, "gap": true, "padding": true, "margin": true,
	"id": true, "version": true, "units": true, "format": true, "ar": true,
}

// flattenInspirationJSON 把 JSON 结构化提示词拍平成自然语言。
// 画廊里有 89 条 prompt 是 { "type": "...", "layout": {...} } 形式的结构化提示词，
// 原样显示在卡片上是一坨 JSON，且其中 11 条中英文双段粘连、含全角标点，
// 严格 JSON 解析会失败。这里改为直接抽取所有字符串值，按顺序拼接。
func flattenInspirationJSON(text string) string {
	trimmed := strings.TrimSpace(text)
	if !strings.HasPrefix(trimmed, "{") {
		return text
	}
	matches := jsonFieldRE.FindAllStringSubmatch(trimmed, -1)
	if len(matches) == 0 {
		return text
	}
	parts := make([]string, 0, len(matches))
	for _, match := range matches {
		if jsonSkipKeys[match[1]] {
			continue
		}
		value := strings.ReplaceAll(match[2], `\"`, `"`)
		value = strings.ReplaceAll(value, `\n`, " ")
		value = strings.TrimSpace(value)
		if len([]rune(value)) >= 2 {
			parts = append(parts, value)
		}
	}
	if len(parts) < 1 {
		return text
	}
	return strings.Join(parts, "，")
}

// cleanInspirationText 去掉 markdown 转义残留（\_ \* \[ \] 等），
// 并把 **加粗** 的星号抹掉，只保留文字本身。
func cleanInspirationText(text string) string {
	text = argumentRE.ReplaceAllString(text, "$2")
	text = languageMarkerRE.ReplaceAllString(text, "")
	text = flattenInspirationJSON(text)
	text = placeholderBraceRE.ReplaceAllString(text, "$1")
	text = strings.ReplaceAll(text, "\\_", "_")
	text = strings.ReplaceAll(text, "\\*", "*")
	text = strings.ReplaceAll(text, "**", "")
	return strings.TrimSpace(text)
}

// parseInspirationCategories 解析 docs/gallery.md 分类案例入口区，得到 案例号 -> 分类。
// 分类区以 `### 🧩 UI与界面 · 73 cases` 这类标题分段，其后每条 `- [例 N：...](...#case-N)` 属于该分类。
func parseInspirationCategories(markdown string) (map[int]string, error) {
	categoryHeadingRE := regexp.MustCompile(`^###\s+.*?([^\s·]+)\s*·\s*\d+\s*cases\s*$`)

	scanner := bufio.NewScanner(strings.NewReader(strings.ReplaceAll(markdown, "\r\n", "\n")))
	scanner.Buffer(make([]byte, 0, 256*1024), 4*1024*1024)

	categories := map[int]string{}
	current := ""
	inCategoryZone := false

	for scanner.Scan() {
		line := scanner.Text()
		if strings.HasPrefix(line, "## 分类案例入口") {
			inCategoryZone = true
			continue
		}
		if !inCategoryZone {
			continue
		}
		if strings.HasPrefix(line, "## ") {
			break
		}

		if matches := categoryHeadingRE.FindStringSubmatch(line); matches != nil {
			current = normalizeInspirationCategory(matches[1])
			continue
		}
		if current == "" {
			continue
		}
		if matches := categoryLinkRE.FindStringSubmatch(line); matches != nil {
			if number, err := strconv.Atoi(matches[1]); err == nil {
				categories[number] = current
			}
		}
	}
	return categories, scanner.Err()
}

// normalizeInspirationCategory 把仓库的分类标题对齐到 13 个标准键名。
func normalizeInspirationCategory(name string) string {
	aliases := map[string]string{
		"UI与界面":    "UI 与界面",
		"图表与信息可视化": "信息图表",
		"海报与排版":    "海报排版",
		"商品与电商":    "商品电商",
		"品牌与标志":    "品牌标志",
		"建筑与空间":    "建筑空间",
		"摄影与写实":    "摄影写实",
		"插画与艺术":    "插画艺术",
		"人物与角色":    "人物角色",
		"场景与叙事":    "场景叙事",
		"历史与古风题材":  "历史古风",
		"文档与出版物":   "文档出版",
		"其他应用场景":   "其他场景",
	}
	if key, ok := aliases[name]; ok {
		return key
	}
	return name
}

// seedInspirationPrompts 把解析出的案例写入数据库并下载案例图。
// 幂等：已存在的图片跳过下载，记录按 id 冲突更新。
func seedInspirationPrompts(db *sql.DB, cases []inspirationCase, storageRoot, imageBaseURL string, concurrency int) error {
	if concurrency < 1 {
		concurrency = 6
	}
	inspirationDir := filepath.Join(storageRoot, "inspiration")
	if err := os.MkdirAll(inspirationDir, 0o755); err != nil {
		return fmt.Errorf("创建灵感图目录失败：%w", err)
	}

	jobs := make(chan inspirationCase)
	results := make(chan error, len(cases))

	worker := func() {
		client := &http.Client{Timeout: 90 * time.Second}
		for item := range jobs {
			if err := seedOneCase(db, item, inspirationDir, imageBaseURL, client); err != nil {
				results <- fmt.Errorf("案例 %d：%w", item.Number, err)
				continue
			}
			results <- nil
		}
	}
	for range concurrency {
		go worker()
	}

	go func() {
		for _, item := range cases {
			jobs <- item
		}
		close(jobs)
	}()

	var failed []string
	for range cases {
		if err := <-results; err != nil {
			failed = append(failed, err.Error())
		}
	}
	if len(failed) > 0 {
		return fmt.Errorf("导入完成但有 %d 条失败，前 5 条：%s", len(failed), strings.Join(failed[:min(5, len(failed))], "; "))
	}
	return nil
}

func seedOneCase(db *sql.DB, item inspirationCase, inspirationDir, imageBaseURL string, client *http.Client) error {
	id := fmt.Sprintf("case-%d", item.Number)
	// image_key 只存文件名（case-1.jpg），不包含目录前缀：
	// 本地服务时由图片接口拼 inspiration/ 目录，迁 CDN 时直接拼域名即可。
	imageKey := item.ImageFile
	localPath := filepath.Join(inspirationDir, item.ImageFile)

	width, height := 0, 0
	if _, err := os.Stat(localPath); err != nil {
		if err := downloadInspirationImage(client, imageBaseURL+"/"+item.ImageFile, localPath); err != nil {
			return err
		}
	}
	if file, err := os.Open(localPath); err == nil {
		if config, _, decodeErr := image.DecodeConfig(file); decodeErr == nil {
			width, height = config.Width, config.Height
		}
		_ = file.Close()
	}

	_, err := db.Exec(`INSERT INTO inspiration_prompts (id,title,category,prompt,source,image_key,image_width,image_height,enabled,sort_order)
VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,$9)
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, category=EXCLUDED.category, prompt=EXCLUDED.prompt, source=EXCLUDED.source, image_key=EXCLUDED.image_key, image_width=EXCLUDED.image_width, image_height=EXCLUDED.image_height`,
		id, item.Title, item.Category, item.Prompt, item.Source, imageKey, width, height, item.Number)
	return err
}

func downloadInspirationImage(client *http.Client, url, dest string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("下载失败：%w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("下载返回状态 %d", response.StatusCode)
	}

	temp := dest + ".tmp"
	file, err := os.Create(temp)
	if err != nil {
		return err
	}
	if _, err := io.Copy(file, response.Body); err != nil {
		_ = file.Close()
		_ = os.Remove(temp)
		return err
	}
	if err := file.Close(); err != nil {
		_ = os.Remove(temp)
		return err
	}
	return os.Rename(temp, dest)
}
