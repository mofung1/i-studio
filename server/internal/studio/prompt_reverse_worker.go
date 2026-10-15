package studio

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"time"

	"golang.org/x/image/draw"

	"github.com/istudio/server/internal/idgen"
)

func (s *Service) startPromptReverseWorkers() {
	if s.db == nil {
		return
	}
	for i := 0; i < 2; i++ {
		go func() {
			ticker := time.NewTicker(time.Second)
			defer ticker.Stop()
			for {
				job, err := s.claimReverseJob()
				if err == nil {
					s.processReverseJob(job)
				}
				<-ticker.C
			}
		}()
	}
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			_ = s.cleanupReverseTasks()
			<-ticker.C
		}
	}()
}

func (s *Service) claimReverseJob() (reverseJob, error) {
	token := idgen.New()
	return scanReverseJob(s.db.QueryRow(`UPDATE prompt_reverse_tasks SET status='processing',run_token=$1,updated_at=now(),
 deadline=now()+make_interval(secs=>(settings->>'timeoutSeconds')::int+30)
 WHERE id=(SELECT id FROM prompt_reverse_tasks WHERE status='queued' AND expires_at>now() ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
 RETURNING `+reverseTaskColumns, token))
}

func (s *Service) processReverseJob(job reverseJob) {
	var accountActive bool
	if s.db.QueryRow("SELECT status='active' FROM users WHERE id=$1", job.UserID).Scan(&accountActive) != nil || !accountActive {
		s.finishReverseJob(job, nil, "账号已停用，分析任务已终止")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(job.Settings.TimeoutSeconds)*time.Second)
	defer cancel()
	s.reverseCancels.Store(job.ID, func() { cancel() })
	defer s.reverseCancels.Delete(job.ID)
	var status string
	if s.db.QueryRow("SELECT status FROM prompt_reverse_tasks WHERE id=$1 AND run_token=$2", job.ID, job.RunToken).Scan(&status) != nil || status != "processing" {
		return
	}
	go func() {
		ticker := time.NewTicker(750 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var active bool
				if err := s.db.QueryRowContext(ctx, "SELECT status='processing' AND expires_at>now() FROM prompt_reverse_tasks WHERE id=$1 AND run_token=$2", job.ID, job.RunToken).Scan(&active); errors.Is(err, sql.ErrNoRows) || (err == nil && !active) {
					cancel()
					return
				}
			}
		}
	}()
	endpoint, err := s.reverseEndpoint(job.Settings)
	if err != nil {
		s.finishReverseJob(job, nil, err.Error())
		return
	}
	key, err := s.ai.decrypt(endpoint)
	if err != nil {
		s.finishReverseJob(job, nil, "识图服务密钥无法读取，请检查 AI 服务设置")
		return
	}
	imageKey := job.AnalysisKey
	if imageKey == "" {
		imageKey = job.ImageKey
	}
	file, err := s.storage.Open(imageKey)
	if err != nil {
		s.finishReverseJob(job, nil, "参考图片已失效，请重新上传")
		return
	}
	data, err := io.ReadAll(io.LimitReader(file, 10<<20+1))
	_ = file.Close()
	if err != nil || len(data) == 0 || len(data) > 10<<20 {
		s.finishReverseJob(job, nil, "参考图片无法读取，请重新上传")
		return
	}
	if job.AnalysisKey == "" {
		data, err = prepareReverseAnalysisData(data, job.Settings.ImageDetail)
		if err != nil {
			s.finishReverseJob(job, nil, "图片无法压缩，请换一张较小的图片")
			return
		}
	}
	endpoint.TimeoutSeconds = job.Settings.TimeoutSeconds
	client := newOpenAICompatibleClient(endpoint, key)
	client.disableThinking = true
	text, err := client.complete(ctx, job.SystemPrompt, reverseUserText(job), []promptImage{{Mime: http.DetectContentType(data), Data: base64.StdEncoding.EncodeToString(data), Detail: job.Settings.ImageDetail}}, 4096)
	if err != nil {
		message := "识图服务请求失败，请检查服务设置后重试"
		if errors.Is(ctx.Err(), context.DeadlineExceeded) {
			message = "图片分析超时，原图已保留，可调整反推超时后重试"
		}
		s.finishReverseJob(job, nil, message)
		return
	}
	var result *reverseResult
	if job.Mode == "style" {
		result, err = parseReverseStyleResult(text)
	} else {
		result, err = parseReverseResult(text)
	}
	if err != nil {
		s.finishReverseJob(job, nil, err.Error())
		return
	}
	result.Model = endpoint.Model
	result.TemplateVersion = job.TemplateVersion
	s.finishReverseJob(job, result, "")
}

func (s *Service) finishReverseJob(job reverseJob, result *reverseResult, message string) {
	status := "failed"
	var raw any
	if result != nil {
		status = "succeeded"
		raw, _ = json.Marshal(result)
	}
	// Retry only persistence; never repeat a completed, billable provider request.
	var err error
	for attempt := 0; attempt < 3; attempt++ {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		_, err = s.db.ExecContext(ctx, "UPDATE prompt_reverse_tasks SET status=$1,result=$2::jsonb,error_message=$3,updated_at=now() WHERE id=$4 AND run_token=$5 AND status='processing' AND expires_at>now()", status, raw, message, job.ID, job.RunToken)
		cancel()
		if err == nil {
			return
		}
		if attempt < 2 {
			time.Sleep(time.Duration(attempt+1) * 250 * time.Millisecond)
		}
	}
	log.Printf("prompt reverse %s: result persistence failed: %v", job.ID, err)
}

func (s *Service) cleanupReverseTasks() error {
	if _, err := s.db.Exec("UPDATE prompt_reverse_tasks SET status='failed',error_message='分析已中断或超时，原图已保留，请重新分析',updated_at=now() WHERE (status='processing' AND deadline<now()) OR (status IN ('queued','processing') AND expires_at<=now())"); err != nil {
		return err
	}
	rows, err := s.db.Query("DELETE FROM prompt_reverse_tasks WHERE expires_at<=now() AND status NOT IN ('queued','processing') RETURNING image_key,analysis_key")
	if err != nil {
		return err
	}
	keys := []string{}
	for rows.Next() {
		var key, analysisKey string
		if err := rows.Scan(&key, &analysisKey); err != nil {
			rows.Close()
			return err
		}
		keys = append(keys, key)
		if analysisKey != "" {
			keys = append(keys, analysisKey)
		}
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, key := range keys {
		_ = s.storage.Delete(key)
	}
	return nil
}

func prepareReverseAnalysisData(data []byte, detail string) ([]byte, error) {
	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	source = orientReverseImage(source, reverseImageOrientation(data))
	edge := 1536
	if detail == "high" {
		edge = 2048
	}
	if detail == "low" {
		edge = 1024
	}
	for _, limit := range []int{edge, 1024} {
		bounds := source.Bounds()
		width, height := bounds.Dx(), bounds.Dy()
		if width > limit || height > limit {
			if width >= height {
				height = max(1, height*limit/width)
				width = limit
			} else {
				width = max(1, width*limit/height)
				height = limit
			}
		}
		resized := image.NewRGBA(image.Rect(0, 0, width, height))
		draw.ApproxBiLinear.Scale(resized, resized.Bounds(), source, bounds, draw.Src, nil)
		var encoded bytes.Buffer
		if http.DetectContentType(data) == "image/jpeg" {
			err = jpeg.Encode(&encoded, resized, &jpeg.Options{Quality: 90})
		} else {
			err = png.Encode(&encoded, resized)
		}
		if err != nil {
			return nil, err
		}
		if encoded.Len() <= 5<<20 {
			return encoded.Bytes(), nil
		}
	}
	return nil, errors.New("compressed image is too large")
}
