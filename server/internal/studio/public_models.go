package studio

import (
	"database/sql"
	"encoding/json"
	"fmt"
)

type modelCapabilities struct {
	ReferenceImages bool     `json:"referenceImages"`
	AspectRatios    []string `json:"aspectRatios"`
	Resolutions     []string `json:"resolutions"`
}

func defaultModelCapabilities() modelCapabilities {
	return modelCapabilities{true, []string{"1:1", "3:4", "4:3", "9:16", "16:9"}, []string{"1K", "2K", "4K"}}
}

type modelChannel struct {
	ID              string `json:"id"`
	EndpointID      string `json:"endpointId"`
	UpstreamModelID string `json:"upstreamModelId"`
	Enabled         bool   `json:"enabled"`
	IsActive        bool   `json:"isActive"`
}
type publicModel struct {
	ID           string            `json:"id"`
	Name         string            `json:"name"`
	UsageHint    string            `json:"usageHint,omitempty"`
	PriceMinor   int64             `json:"priceMinor"`
	Enabled      bool              `json:"enabled"`
	IsDefault    bool              `json:"isDefault"`
	Version      int64             `json:"version"`
	Capabilities modelCapabilities `json:"capabilities"`
	Channels     []modelChannel    `json:"channels"`
}

const publicModelColumns = "id,name,usage_hint,price_minor,enabled,is_default,version,capabilities"

func scanPublicModel(row interface{ Scan(...any) error }) (publicModel, error) {
	var m publicModel
	var raw []byte
	err := row.Scan(&m.ID, &m.Name, &m.UsageHint, &m.PriceMinor, &m.Enabled, &m.IsDefault, &m.Version, &raw)
	if err == nil {
		err = json.Unmarshal(raw, &m.Capabilities)
	}
	return m, err
}

type modelQueryer interface {
	Query(string, ...any) (*sql.Rows, error)
}

func (s *Service) publicModels(onlyAvailable bool) ([]publicModel, error) {
	if s.db == nil {
		return []publicModel{}, nil
	}
	return queryPublicModels(s.db, onlyAvailable)
}
func queryPublicModels(db modelQueryer, onlyAvailable bool) ([]publicModel, error) {
	models := []publicModel{}
	query := "SELECT " + publicModelColumns + " FROM public_models m"
	if onlyAvailable {
		query += " WHERE enabled AND EXISTS(SELECT 1 FROM public_model_channels c JOIN ai_endpoints e ON e.id=c.endpoint_id WHERE c.public_model_id=m.id AND c.is_active AND c.enabled AND e.enabled AND e.purpose='image')"
	}
	rows, err := db.Query(query + " ORDER BY is_default DESC,created_at,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		m, err := scanPublicModel(rows)
		if err != nil {
			return nil, err
		}
		models = append(models, m)
	}
	return models, rows.Err()
}
func (s *Service) resolvePublicModel(id, name string) (publicModel, error) {
	if s.db == nil {
		return publicModel{}, fmt.Errorf("模型配置不可用")
	}
	return resolveAvailableModel(s.db, id, name)
}
func resolveAvailableModel(db modelQueryer, id, name string) (publicModel, error) {
	models, err := queryPublicModels(db, true)
	if err != nil {
		return publicModel{}, err
	}
	for _, m := range models {
		if (id != "" && m.ID == id) || (id == "" && (m.ID == name || (name == "" && m.IsDefault))) {
			return m, nil
		}
	}
	if id == "" && name == "" && len(models) == 1 {
		return models[0], nil
	}
	return publicModel{}, fmt.Errorf("所选模型未上架、未配置主渠道或已停用，请重新选择")
}

// resolveChannel only selects the administrator's explicit active binding.
func resolveChannel(tx *sql.Tx, modelID string) (endpointConfig, error) {
	var e endpointConfig
	var raw []byte
	err := tx.QueryRow(`SELECT e.id,e.name,e.purpose,e.protocol,e.base_url,e.api_key_encrypted,c.upstream_model_id,e.timeout_seconds,e.capabilities,e.enabled FROM public_model_channels c JOIN ai_endpoints e ON e.id=c.endpoint_id WHERE c.public_model_id=$1 AND c.is_active AND c.enabled AND e.enabled AND e.purpose='image'`, modelID).Scan(&e.ID, &e.Name, &e.Purpose, &e.Protocol, &e.BaseURL, &e.APIKeyEncrypted, &e.Model, &e.TimeoutSeconds, &raw, &e.Enabled)
	if err != nil {
		return e, fmt.Errorf("模型未配置可用主渠道: %w", err)
	}
	err = json.Unmarshal(raw, &e.Capabilities)
	return e, err
}
func validateModelParameters(c modelCapabilities, input map[string]any) error {
	contains := func(values []string, value string) bool {
		for _, v := range values {
			if v == value {
				return true
			}
		}
		return false
	}
	if !contains(c.AspectRatios, stringValue(input["aspectRatio"], "1:1")) || !contains(c.Resolutions, stringValue(input["resolution"], "2K")) {
		return fmt.Errorf("当前模型不支持所选比例或分辨率")
	}
	if !c.ReferenceImages && (len(sourceImages(input)) > 0 || hasInputImages(input)) {
		return fmt.Errorf("当前模型不支持参考图片")
	}
	return nil
}

func hasInputImages(input map[string]any) bool {
	if stringValue(input["modelAssetId"], "") != "" || stringValue(input["sceneAssetId"], "") != "" {
		return true
	}
	for _, key := range []string{"referenceAssetIds", "productAssetIds"} {
		switch v := input[key].(type) {
		case []any:
			if len(v) > 0 {
				return true
			}
		case []string:
			if len(v) > 0 {
				return true
			}
		}
	}
	return false
}
