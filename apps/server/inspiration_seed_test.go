package main

import (
	"strings"
	"testing"
)

// 构造一份迷你画廊：含 CRLF 换行、来源缺失、超长 prompt、缺号，覆盖解析边界。
var galleryFixture = "### 例 1：信息图可视化设计\r\n\r\n![城市生命系统图谱](../data/images/case1.jpg)\r\n\r\n**来源：** 小红书号insight_express\r\n\r\n**提示词：**\r\n\r\n```text\r\nVertical 9:16 isometric cutaway infographic.\r\n多行第二行。\r\n```\r\n\r\n***\r\n\r\n<a name=\"case-2\"></a>\r\n\r\n### 例 2：社媒界面截图\r\n\r\n![Ailln AI](../data/images/case2.jpg)\r\n\r\n**来源：** 未提供\r\n\r\n**提示词：**\r\n\r\n```text\r\n画一张 X 的内容截图。\r\n```\r\n\r\n### 例 5：长提示词案例\r\n\r\n![长图](../data/images/case5.png)\r\n\r\n**提示词：**\r\n\r\n```text\r\n" + strings.Repeat("长", 9000) + "\r\n```\r\n"

const categoriesFixture = `## 分类案例入口

<a name="cat-ui"></a>

### 🧩 UI与界面 · 2 cases

- [例 2：社媒界面截图](./gallery-part-1.md#case-2)

<a name="cat-infographic"></a>

### 📊 图表与信息可视化 · 1 cases

- [例 1：信息图可视化设计](./gallery-part-1.md#case-1)

## 其他章节
`

func TestParseInspirationGallery(t *testing.T) {
	cases, err := parseInspirationGallery(galleryFixture, categoriesFixture)
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(cases) != 3 {
		t.Fatalf("案例数 %d，期望 3（缺号 3、4 不应补齐）", len(cases))
	}

	if cases[0].Number != 1 || cases[0].Title != "信息图可视化设计" {
		t.Fatalf("首例格式错误：%+v", cases[0])
	}
	if cases[0].Category != "信息图表" {
		t.Fatalf("例 1 分类应为 信息图表，得到 %q", cases[0].Category)
	}
	if cases[0].Source != "小红书号insight_express" {
		t.Fatalf("来源解析错误：%q", cases[0].Source)
	}
	if !strings.Contains(cases[0].Prompt, "多行第二行") {
		t.Fatalf("多行 prompt 未完整保留：%q", cases[0].Prompt)
	}
	if cases[0].ImageFile != "case1.jpg" {
		t.Fatalf("图片文件名解析错误：%q", cases[0].ImageFile)
	}

	if cases[1].Category != "UI 与界面" {
		t.Fatalf("例 2 分类应为 UI 与界面，得到 %q", cases[1].Category)
	}
	if cases[1].Source != "未提供" {
		t.Fatalf("「未提供」来源应原样保留，得到 %q", cases[1].Source)
	}

	// 9000 个中文字符在 UTF-8 下是 27000 字节；验证字符数而非字节数
	if len([]rune(cases[2].Prompt)) != 9000 {
		t.Fatalf("超长 prompt 字符数 %d，期望 9000", len([]rune(cases[2].Prompt)))
	}
	if cases[2].ImageFile != "case5.png" {
		t.Fatalf("png 扩展名解析错误：%q", cases[2].ImageFile)
	}
	// 例 5 无分类映射也无兜底，落到「其他场景」
	if cases[2].Category != "其他场景" {
		t.Fatalf("例 5 应兜底到 其他场景，得到 %q", cases[2].Category)
	}
}

// 案例 78-80 的图片 alt 跨行，验证闭合括号在后续行时仍能正确匹配。
func TestParseInspirationGalleryMultilineImage(t *testing.T) {
	fixture := "### 例 78：图像生成案例图\r\n\r\n![\\[CORE TASK\\]\r\nTransform the...](../data/images/case78.jpg)\r\n\r\n**来源：** 作者\r\n\r\n**提示词：**\r\n\r\n```text\r\nprompt\r\n```\r\n"
	cases, err := parseInspirationGallery(fixture, "")
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(cases) != 1 {
		t.Fatalf("案例数 %d，期望 1", len(cases))
	}
	if cases[0].ImageFile != "case78.jpg" {
		t.Fatalf("跨行图片未匹配：%q", cases[0].ImageFile)
	}
	if cases[0].Source != "作者" {
		t.Fatalf("来源应在图片之后仍能解析：%q", cases[0].Source)
	}
}

func TestCleanInspirationSource(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"[@wory37303852](https://x.com/wory37303852)", "@wory37303852"},
		{"[@mm\\_zzm44854](https://x.com/mm_zzm44854)", "@mm_zzm44854"},
		{"[@rionaifantasy](https://x.com/rionaifantasy/status/2045356799751303194)", "@rionaifantasy"},
		{"[OpenNana](https://opennana.com/awesome-prompt-gallery/rising-wind-calligraphy-art)", "OpenNana"},
		{"小红书号insight\\_express", "小红书号insight_express"},
		{"苍何原创实测（公众号文章《我逆向了 329 条 GPT-Image2 提示词模板，全部开源！》）", "苍何原创实测（公众号文章《我逆向了 329 条 GPT-Image2 提示词模板，全部开源！》）"},
		{"未提供", "未提供"},
		// 源文件里的畸形嵌套链接：括号被整体转义，不是合法 markdown
		{"\\[OpenNana]\\(]\\(<https://x.com/Toshi_nyaruo_AI/status/2045025277538107420>)", "OpenNana"},
	}
	for _, item := range cases {
		if got := cleanInspirationSource(item.raw); got != item.want {
			t.Fatalf("cleanInspirationSource(%q) = %q，期望 %q", item.raw, got, item.want)
		}
	}
}

func TestCleanInspirationText(t *testing.T) {
	if got := cleanInspirationText("一只**可爱的粉色丝绸马甲**，并且"); got != "一只可爱的粉色丝绸马甲，并且" {
		t.Fatalf("加粗标记未抹掉：%q", got)
	}
	if got := cleanInspirationText("**笔记本电脑、智能手机**"); got != "笔记本电脑、智能手机" {
		t.Fatalf("加粗标记未抹掉：%q", got)
	}
	// 首尾空白应一并清理
	if got := cleanInspirationText("  \\_x\\_  "); got != "_x_" {
		t.Fatalf("转义与空白清理错误：%q", got)
	}
	// 模板占位符展开成默认值
	if got := cleanInspirationText("为 {argument name=\"主题\" default=\"寿司\"} 生成海报"); got != "为 寿司 生成海报" {
		t.Fatalf("占位符未展开：%q", got)
	}
	// JSON 类 prompt 里引号被转义成 \"
	if got := cleanInspirationText(`"name": "{argument name=\"brand name\" default=\"沐阳 MUYANG TEA\"}"`); got != `"name": "沐阳 MUYANG TEA"` {
		t.Fatalf("JSON 内占位符未展开：%q", got)
	}
	// 语言标记头去掉，内容段落保留
	if got := cleanInspirationText("[中文]\n李白在抖音直播月下起舞"); got != "李白在抖音直播月下起舞" {
		t.Fatalf("语言标记未去掉：%q", got)
	}
	if got := cleanInspirationText("[English]\nA cat"); got != "A cat" {
		t.Fatalf("语言标记未去掉：%q", got)
	}
	if got := cleanInspirationText("[NEGATIVE]\nno text"); got != "[NEGATIVE]\nno text" {
		t.Fatalf("结构段落不应被去掉：%q", got)
	}
}

func TestFlattenInspirationJSON(t *testing.T) {
	cases := []struct{ name, raw, want string }{
		{
			"单层 JSON",
			`{ "type": "信息图", "style": "扁平矢量风格", "position": "top" }`,
			`信息图，扁平矢量风格`,
		},
		{
			"嵌套 JSON",
			"{\n  \"type\": \"海报\",\n  \"subject\": {\n    \"description\": \"一只猫\"\n  }\n}",
			`海报，一只猫`,
		},
		{
			"含转义引号",
			`{ "title": "他说\"你好\"" }`,
			`他说"你好"`,
		},
		{
			"中英文双段粘连（严格解析会失败）",
			"{\n  \"prompt\": \"手机照片，老式CCD美学\"\n}\n\n{\n  \"prompt\": \"mobile photo, CCD aesthetic\"\n}",
			`手机照片，老式CCD美学，mobile photo, CCD aesthetic`,
		},
		{
			"非 JSON 不动",
			"画一张海报，要求高质量",
			"画一张海报，要求高质量",
		},
		{
			"占位符外壳剥掉",
			"{ 角色名称 } 完全由天然树叶制成，8k\n\n{ CHARACTER NAME } made entirely from natural leaves, 8k",
			"角色名称 完全由天然树叶制成，8k\n\nCHARACTER NAME made entirely from natural leaves, 8k",
		},
	}
	for _, item := range cases {
		if got := cleanInspirationText(item.raw); got != item.want {
			t.Fatalf("%s：得到 %q，期望 %q", item.name, got, item.want)
		}
	}
}

func TestParseInspirationGalleryOrdering(t *testing.T) {
	// 故意乱序输入，验证按案例号升序输出
	reversed := "### 例 9：后一条\r\n\r\n![x](../data/images/case9.jpg)\r\n\r\n**提示词：**\r\n\r\n```text\r\nb\r\n```\r\n\r\n### 例 3：前一条\r\n\r\n![y](../data/images/case3.jpg)\r\n\r\n**提示词：**\r\n\r\n```text\r\na\r\n```\r\n"
	cases, err := parseInspirationGallery(reversed, "")
	if err != nil {
		t.Fatalf("解析失败：%v", err)
	}
	if len(cases) != 2 || cases[0].Number != 3 || cases[1].Number != 9 {
		t.Fatalf("排序错误：%v", cases)
	}
}

func TestNormalizeInspirationCategory(t *testing.T) {
	for _, raw := range []string{"UI与界面", "图表与信息可视化", "历史与古风题材", "其他应用场景"} {
		if normalizeInspirationCategory(raw) == raw {
			t.Fatalf("分类 %q 未被归一化", raw)
		}
	}
	for _, key := range inspirationCategoryKeys {
		if normalizeInspirationCategory(key) != key {
			t.Fatalf("标准键 %q 不应被改动", key)
		}
	}
}
