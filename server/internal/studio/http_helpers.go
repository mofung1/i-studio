package studio

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"

	"github.com/istudio/server/internal/httpapi"
)

func decode(r *http.Request, v any) bool {
	if r.Body == nil {
		return false
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, (1<<20)+1))
	if err != nil || len(data) > 1<<20 {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(v); err != nil {
		return false
	}
	var extra any
	return decoder.Decode(&extra) == io.EOF
}

func (s *Service) json(w http.ResponseWriter, status int, v any) { httpapi.JSON(w, status, v) }
func (s *Service) error(w http.ResponseWriter, status int, code, message string) {
	httpapi.Error(w, status, code, message)
}
