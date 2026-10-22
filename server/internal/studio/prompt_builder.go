package studio

import (
	"net/http"
	"strings"
)

type promptBuilder struct{ templates []promptTemplate }

func (b promptBuilder) build(target, text string, r *http.Request) (string, string) {
	key := "rewrite"
	if target == "requirements" {
		key = "requirements"
	}
	mode := strings.TrimSpace(r.FormValue("taskType"))
	parts := []string{}
	for _, wanted := range []string{key, mode} {
		for _, t := range b.templates {
			if t.Key == wanted && t.Enabled {
				parts = append(parts, t.Content)
				break
			}
		}
	}
	return strings.Join(parts, "\n\n"), buildPromptUserText(target, text, r, promptSet(b.templates))
}

func (s *Service) buildPrompt(target, text string, r *http.Request) (string, string, error) {
	templates, err := s.promptSnapshot()
	if err != nil {
		return "", "", err
	}
	system, user := (promptBuilder{templates}).build(target, text, r)
	system += "\n\n输出约束：只输出提示词正文，不写字段名、冒号标题、列表或解释。用户没有明确给出的画幅方向、比例、分辨率和像素尺寸不要补写，输出规格由工作台参数控制。保留用户原意，不编造商品参数、功效、认证、价格或品牌信息。"
	if r.FormValue("taskType") == "product-retouch" {
		system += "\n本次是局部精修：用 100–250 字仅说明用户本次选择的修改及必须保持不变的内容，不重写整套拍摄方案。没有选择的精修项不得追加；只修复划痕时不得额外提亮、加深轮廓、增强光泽、校色、锐化、重布光或换背景。保留磨砂颗粒、纸纤维等原有材质纹理，不把真实纹理当作瑕疵抹除。"
	}
	return system, user, nil
}
