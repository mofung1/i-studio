package studio

import (
	"fmt"

	"github.com/istudio/server/internal/idgen"
)

type publicModel struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	EndpointID string `json:"endpointId,omitempty"`
	PriceMinor int64  `json:"priceMinor"`
	Enabled    bool   `json:"enabled"`
	IsDefault  bool   `json:"isDefault"`
	Version    int64  `json:"version"`
}

func (s *Service) initializePublicModels() error {
	if s.db == nil {
		return nil
	}
	endpoints, err := s.ai.list()
	if err != nil {
		return err
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	var migrated bool
	if err = tx.QueryRow("SELECT models_migrated FROM operation_settings WHERE id=true FOR UPDATE").Scan(&migrated); err != nil {
		return err
	}
	if migrated {
		return nil
	}
	modelCounts := map[string]int{}
	for _, e := range endpoints {
		if e.Purpose == "image" {
			modelCounts[e.Model]++
		}
	}
	for _, e := range endpoints {
		if e.Purpose != "image" {
			continue
		}
		id := "model_" + idgen.New()
		if _, err = tx.Exec("INSERT INTO public_models(id,name,endpoint_id,price_minor) VALUES($1,$2,$3,0)", id, e.Name, e.ID); err != nil {
			return err
		}
		// Preserve private presets and their version history through the identifier change.
		condition := "(config->>'endpointId'=$1 OR (COALESCE(config->>'endpointId','')='' AND config->>'model'=$3 AND $4))"
		if _, err = tx.Exec("UPDATE personal_prompts SET config=jsonb_set(jsonb_set(config,'{endpointId}',to_jsonb($2::text)),'{model}',to_jsonb($5::text)) WHERE kind='preset' AND "+condition, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE personal_prompt_versions SET snapshot=jsonb_set(jsonb_set(snapshot,'{config,endpointId}',to_jsonb($2::text)),'{config,model}',to_jsonb($5::text)) WHERE snapshot->>'kind'='preset' AND (snapshot#>>'{config,endpointId}'=$1 OR (COALESCE(snapshot#>>'{config,endpointId}','')='' AND snapshot#>>'{config,model}'=$3 AND $4))`, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
		if _, err = tx.Exec(`UPDATE generation_tasks SET input=jsonb_set(jsonb_set(input,'{endpointId}',to_jsonb($2::text)),'{model}',to_jsonb($5::text)) WHERE input->>'endpointId'=$1 OR (COALESCE(input->>'endpointId','')='' AND input->>'model'=$3 AND $4)`, e.ID, id, e.Model, modelCounts[e.Model] == 1, e.Name); err != nil {
			return err
		}
	}

	if _, err = tx.Exec("UPDATE operation_settings SET models_migrated=true WHERE id=true"); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Service) publicModels(onlyAvailable bool) ([]publicModel, error) {
	models := []publicModel{}
	if s.db == nil {
		return models, nil
	}
	rows, err := s.db.Query("SELECT id,name,endpoint_id,price_minor,enabled,is_default,version FROM public_models ORDER BY is_default DESC,created_at,id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var m publicModel
		if err = rows.Scan(&m.ID, &m.Name, &m.EndpointID, &m.PriceMinor, &m.Enabled, &m.IsDefault, &m.Version); err != nil {
			return nil, err
		}
		if onlyAvailable {
			if !m.Enabled {
				continue
			}
			if _, err = s.ai.resolve("image", m.EndpointID, ""); err != nil {
				continue
			}
		}
		models = append(models, m)
	}
	return models, rows.Err()
}

func (s *Service) resolvePublicModel(id, legacyModel string) (publicModel, error) {
	models, err := s.publicModels(true)
	if err != nil {
		return publicModel{}, err
	}
	if id != "" {
		for _, m := range models {
			if m.ID == id {
				return m, nil
			}
		}
	}
	// Compatibility for older private presets: only an unambiguous published channel.
	matches := []publicModel{}
	for _, m := range models {
		if id != "" && m.EndpointID == id {
			matches = append(matches, m)
		}
		if id == "" && legacyModel != "" {
			e, eErr := s.ai.resolve("image", m.EndpointID, "")
			if eErr == nil && (legacyModel == m.ID || legacyModel == e.Model) {
				matches = append(matches, m)
			}
		}
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if id == "" && legacyModel == "" {
		for _, m := range models {
			if m.IsDefault {
				return m, nil
			}
		}
		if len(models) == 1 {
			return models[0], nil
		}
	}
	return publicModel{}, fmt.Errorf("所选模型未上架或已停用，请重新选择")
}
