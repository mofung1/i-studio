// Package domain defines shared business values without transport or persistence dependencies.
package domain

const MaxGeneratedImageBytes = 25 << 20

type Asset struct {
	ID, UserID, ProjectID, Filename, StorageKey, Mime, Hash string
	SizeBytes                                               int64
	Width, Height                                           int
}

type User struct {
	ID, Username, PasswordHash, Role, Status string
	AuthVersion                              int64
}

type GenerationBilling struct {
	ModelName string `json:"modelName"`
	UnitPrice int64  `json:"unitPriceMinor"`
	Quantity  int    `json:"quantity"`
	Reserved  int64  `json:"reservedMinor"`
	Charged   int64  `json:"chargedMinor"`
	Refunded  int64  `json:"refundedMinor"`
	Settled   bool   `json:"settled"`
}

func IsActiveTask(status string) bool {
	return status == "queued" || status == "processing" || status == "waiting_provider"
}

type GenerationTask struct {
	Billing       *GenerationBilling `json:"billing,omitempty"`
	ID            string             `json:"id"`
	UserID        string             `json:"-"`
	ProjectID     string             `json:"projectId,omitempty"`
	ProjectName   string             `json:"projectName,omitempty"`
	Status        string             `json:"status"`
	CreatedAt     string             `json:"createdAt"`
	Input         any                `json:"input"`
	ResultImages  []string           `json:"resultImages,omitempty"`
	ResultModules []string           `json:"resultModules,omitempty"`
	ErrorMessage  string             `json:"errorMessage,omitempty"`
}

// taskInputField 读取任务输入里的字符串字段；用于内存模式下按模式 / 任务类型过滤。
func TaskInputField(input any, key string) string {
	fields, ok := input.(map[string]any)
	if !ok {
		return ""
	}
	value, ok := fields[key].(string)
	if !ok {
		return ""
	}
	return value
}
