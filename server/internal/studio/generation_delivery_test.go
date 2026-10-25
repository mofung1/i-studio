package studio

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path"
	"reflect"
	"strings"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/istudio/server/internal/domain"
	"github.com/istudio/server/internal/repository"
	objectstore "github.com/istudio/server/internal/storage"
)

type deliveryTestProvider struct {
	submit      func(context.Context, map[string]any) (providerTask, error)
	poll        func(context.Context, string) (providerPollResult, error)
	recoverable bool
}

func (p *deliveryTestProvider) Submit(ctx context.Context, input map[string]any) (providerTask, error) {
	if p.submit == nil {
		return providerTask{}, fmt.Errorf("unexpected generation submission")
	}
	return p.submit(ctx, input)
}
func (p *deliveryTestProvider) Poll(ctx context.Context, id string) (providerPollResult, error) {
	if p.poll == nil {
		return providerPollResult{}, fmt.Errorf("unexpected provider query")
	}
	return p.poll(ctx, id)
}
func (p *deliveryTestProvider) SupportsTaskRecovery() bool { return p.recoverable }

func deliveryFixture(t *testing.T, count int) (*Service, domain.GenerationTask, string) {
	t.Helper()
	s, model, _ := operationTestServer(t)
	s.storage = objectstore.NewLocal(s.storageRoot)
	job, _, err := s.reserveGeneration("member", "delivery-fixture", 125, operationInput(model, count))
	if err != nil {
		t.Fatal(err)
	}
	source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(siteLogoBytes(t, "png"))
	return s, job, source
}
func claimDeliveryRun(t *testing.T, s *Service, id string) *generationRun {
	t.Helper()
	token, _, ok := s.claimGenerationRun(id)
	if !ok {
		t.Fatal("cannot claim task")
	}
	return &generationRun{server: s, id: id, token: token}
}
func expireDeliveryRun(t *testing.T, s *Service, id string) {
	t.Helper()
	if _, err := s.db.Exec("UPDATE generation_tasks SET lease_until=now()-interval '1 minute' WHERE id=$1", id); err != nil {
		t.Fatal(err)
	}
}
func assertDeliverySettlement(t *testing.T, s *Service, id, status string, count, quantity int) domain.GenerationTask {
	t.Helper()
	task, ok, err := repository.TaskByID(s.db, id, "member")
	if err != nil || !ok {
		t.Fatal(err)
	}
	s.attachBilling(&task)
	if task.Status != status || len(task.ResultImages) != count || task.Billing == nil || !task.Billing.Settled || task.Billing.Charged != int64(count)*125 || task.Billing.Refunded != int64(quantity-count)*125 {
		t.Fatalf("unexpected task and billing: %+v %+v", task, task.Billing)
	}
	var available, held int64
	if err = s.db.QueryRow("SELECT available,held FROM credit_accounts WHERE user_id='member'").Scan(&available, &held); err != nil || available != 10000-int64(count)*125 || held != 0 {
		t.Fatal("wallet mismatch", available, held, err)
	}
	var ledger int
	if err = s.db.QueryRow("SELECT count(*) FROM credit_ledger WHERE task_id=$1 AND kind='settlement'", id).Scan(&ledger); err != nil || ledger != 1 {
		t.Fatal("settlement was not unique", ledger, err)
	}
	return task
}

func TestGenerationDeliversBeforeNextSubmissionAndPreservesPartialFailure(t *testing.T) {
	s, job, source := deliveryFixture(t, 3)
	calls := 0
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		calls++
		if calls == 2 {
			partial, ok, err := repository.TaskByID(s.db, job.ID, "member")
			if err != nil || !ok || len(partial.ResultImages) != 1 || partial.Status != "processing" {
				t.Fatal("first image was not published before second request", partial, err)
			}
			token := s.testToken(domain.User{ID: "member"})
			response := operationRequest(s, "GET", partial.ResultImages[0], "", token, s.router().ServeHTTP)
			if response.Code != 200 {
				t.Fatal("partial image cannot be downloaded", response.Code)
			}
			deletion := operationRequest(s, "DELETE", strings.TrimSuffix(partial.ResultImages[0], "/content"), "", token, s.router().ServeHTTP)
			if deletion.Code != 409 {
				t.Fatal("active result could be deleted before billing", deletion.Code)
			}
			return providerTask{}, errors.New("mock second request failed")
		}
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	q.processTask(job.ID)
	assertDeliverySettlement(t, s, job.ID, "failed", 1, 3)
	if calls != 2 {
		t.Fatal("unexpected submission count", calls)
	}
	var pending int
	if err := s.db.QueryRow("SELECT count(*) FROM generation_deliveries WHERE task_id=$1 AND result_source_encrypted<>''", job.ID).Scan(&pending); err != nil || pending != 0 {
		t.Fatal("temporary sources retained", pending, err)
	}
}

func TestInterruptedSynchronousDeliveryNeverResubmitsAndFencesOldWorker(t *testing.T) {
	s, job, source := deliveryFixture(t, 2)
	old := claimDeliveryRun(t, s, job.ID)
	q := &taskQueue{server: s}
	calls := 0
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		calls++
		return providerTask{Images: []string{source}}, nil
	}}
	input, _ := s.taskInput(job.ID)
	input["taskId"] = job.ID + "-1"
	if _, err := q.generateImage(context.Background(), job.ID, input, 1, "", old); err != nil {
		t.Fatal(err)
	}
	if _, _, err := old.begin(context.Background(), 2, job.ID+"-2", ""); err != nil {
		t.Fatal(err)
	}
	expireDeliveryRun(t, s, job.ID)
	q.processTask(job.ID)
	final := assertDeliverySettlement(t, s, job.ID, "failed", 1, 2)
	if calls != 1 || !strings.Contains(final.ErrorMessage, "重新生成") {
		t.Fatal("interrupted request resubmitted or unexplained", calls, final.ErrorMessage)
	}
	if _, err := old.keepSource(context.Background(), 2, "", source); !errors.Is(err, errGenerationLeaseLost) {
		t.Fatal("old worker could publish a late response", err)
	}
	if err := s.settleGeneration(job.ID, "succeeded", nil, nil, "", old.token); !errors.Is(err, errGenerationLeaseLost) {
		t.Fatal("old worker could settle task", err)
	}
	assertDeliverySettlement(t, s, job.ID, "failed", 1, 2)
}

func TestRecoverySavesEncryptedResponseWithoutAnotherGeneration(t *testing.T) {
	s, job, source := deliveryFixture(t, 1)
	old := claimDeliveryRun(t, s, job.ID)
	if _, _, err := old.begin(context.Background(), 1, job.ID+"-1", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := old.keepSource(context.Background(), 1, "private-provider-id", source); err != nil {
		t.Fatal(err)
	}
	var encrypted string
	if err := s.db.QueryRow("SELECT result_source_encrypted FROM generation_deliveries WHERE task_id=$1", job.ID).Scan(&encrypted); err != nil || encrypted == "" || strings.Contains(encrypted, "data:image") {
		t.Fatal("response not encrypted", err)
	}
	var calls atomic.Int32
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		calls.Add(1)
		return providerTask{}, errors.New("must not submit")
	}}
	expireDeliveryRun(t, s, job.ID)
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	q.processTask(job.ID)
	var key string
	if err := s.db.QueryRow("SELECT storage_key FROM assets WHERE task_id=$1", job.ID).Scan(&key); err != nil || path.Dir(path.Dir(key)) != "image" {
		t.Fatal("recovered delivery used the wrong storage directory", key, err)
	}
	final := assertDeliverySettlement(t, s, job.ID, "succeeded", 1, 1)
	if calls.Load() != 0 {
		t.Fatal("saving recovery generated again")
	}
	token := s.testToken(domain.User{ID: "member"})
	response := operationRequest(s, "GET", "/v1/generation/tasks/"+job.ID, "", token, s.router().ServeHTTP)
	if response.Code != 200 || strings.Contains(response.Body.String(), "private-provider-id") || strings.Contains(response.Body.String(), encrypted) {
		t.Fatal("private delivery metadata exposed", response.Code)
	}
	if final.ResultImages[0] == source {
		t.Fatal("temporary provider result exposed")
	}
}

func TestRecoveryQueriesOnlyExplicitlyRecoverableProvider(t *testing.T) {
	for _, recoverable := range []bool{false, true} {
		t.Run(fmt.Sprint(recoverable), func(t *testing.T) {
			s, job, source := deliveryFixture(t, 1)
			old := claimDeliveryRun(t, s, job.ID)
			if _, _, err := old.begin(context.Background(), 1, job.ID+"-1", ""); err != nil {
				t.Fatal(err)
			}
			if err := old.update(context.Background(), 1, "waiting_provider", "remote-existing", "", ""); err != nil {
				t.Fatal(err)
			}
			var submissions, polls atomic.Int32
			s.provider = &deliveryTestProvider{recoverable: recoverable, submit: func(context.Context, map[string]any) (providerTask, error) {
				submissions.Add(1)
				return providerTask{}, errors.New("must not submit")
			}, poll: func(_ context.Context, id string) (providerPollResult, error) {
				polls.Add(1)
				if id != "remote-existing" {
					t.Errorf("wrong provider ID %q", id)
				}
				return providerPollResult{Status: "succeeded", Images: []string{source}}, nil
			}}
			expireDeliveryRun(t, s, job.ID)
			q := &taskQueue{server: s}
			q.processTask(job.ID)
			status, count := "failed", 0
			if recoverable {
				status, count = "succeeded", 1
			}
			assertDeliverySettlement(t, s, job.ID, status, count, 1)
			if submissions.Load() != 0 || (polls.Load() > 0) != recoverable {
				t.Fatal("recovery exceeded provider capability", submissions.Load(), polls.Load())
			}
		})
	}
}

func TestDeliveryAssetAndProgressCommitAtomically(t *testing.T) {
	s, job, source := deliveryFixture(t, 1)
	if _, err := s.db.Exec("ALTER TABLE generation_deliveries ADD CONSTRAINT reject_saved_delivery CHECK(status<>'saved')"); err != nil {
		t.Fatal(err)
	}
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	assertDeliverySettlement(t, s, job.ID, "failed", 0, 1)
	var count int
	if err := s.db.QueryRow("SELECT count(*) FROM assets WHERE task_id=$1", job.ID).Scan(&count); err != nil || count != 0 {
		t.Fatal("asset survived rolled-back publication", count, err)
	}
}

func TestRecoveryAfterLastImageSettlesWithoutProviderOrNewSubmission(t *testing.T) {
	s, job, source := deliveryFixture(t, 1)
	old := claimDeliveryRun(t, s, job.ID)
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	input, _ := s.taskInput(job.ID)
	input["taskId"] = job.ID + "-1"
	if _, err := q.generateImage(context.Background(), job.ID, input, 1, "", old); err != nil {
		t.Fatal(err)
	}
	s.provider = nil
	expireDeliveryRun(t, s, job.ID)
	q.processTask(job.ID)
	assertDeliverySettlement(t, s, job.ID, "succeeded", 1, 1)
}

func TestPublicCapabilitiesExposeOnlyModelParameterConstraints(t *testing.T) {
	s, model, _ := operationTestServer(t)
	caps := modelCapabilities{false, []string{"3:4"}, []string{"1K"}}
	raw, _ := json.Marshal(caps)
	if _, err := s.db.Exec("UPDATE public_models SET capabilities=$1::jsonb WHERE id=$2", raw, model); err != nil {
		t.Fatal(err)
	}
	response := operationRequest(s, "GET", "/v1/generation/capabilities", "", "", s.router().ServeHTTP)
	var payload struct {
		Models []struct {
			ID           string            `json:"id"`
			Capabilities modelCapabilities `json:"capabilities"`
		} `json:"imageEndpoints"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || response.Code != 200 || len(payload.Models) != 1 || !reflect.DeepEqual(payload.Models[0].Capabilities, caps) {
		t.Fatal("public model constraints missing", response.Body.String(), err)
	}
	if strings.Contains(response.Body.String(), "baseUrl") || strings.Contains(response.Body.String(), "upstreamModelId") || strings.Contains(response.Body.String(), "apiKey") {
		t.Fatal("private channel exposed")
	}
}

func TestConcurrentWorkersSubmitEachImageOnce(t *testing.T) {
	s, job, source := deliveryFixture(t, 2)
	var calls atomic.Int32
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		calls.Add(1)
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	var group sync.WaitGroup
	for range 8 {
		group.Go(func() { q.processTask(job.ID) })
	}
	group.Wait()
	assertDeliverySettlement(t, s, job.ID, "succeeded", 2, 2)
	if calls.Load() != 2 {
		t.Fatal("workers submitted duplicates", calls.Load())
	}
}

func TestGenerationWorkerCrashHelper(t *testing.T) {
	if os.Getenv("ISTUDIO_DELIVERY_CRASH_HELPER") != "1" {
		t.Skip("subprocess helper")
	}
	schema := os.Getenv("ISTUDIO_DELIVERY_CRASH_SCHEMA")
	if !strings.HasPrefix(schema, "istudio_test_") {
		t.Fatal("helper requires an isolated test schema")
	}
	parsed, err := url.Parse(os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	query := parsed.Query()
	query.Set("search_path", schema)
	parsed.RawQuery = query.Encode()
	db, err := sql.Open("pgx", parsed.String())
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	root := os.Getenv("ISTUDIO_DELIVERY_CRASH_ROOT")
	s := &Service{db: db, storageRoot: root, storage: objectstore.NewLocal(root)}
	s.ai = newAIConfigStore(s)
	source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(siteLogoBytes(t, "png"))
	calls := 0
	s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
		calls++
		if calls == 2 {
			os.Exit(73)
		}
		return providerTask{Images: []string{source}}, nil
	}}
	q := &taskQueue{server: s}
	q.processTask(os.Getenv("ISTUDIO_DELIVERY_CRASH_JOB"))
	t.Fatal("helper did not reach the simulated crash")
}

func TestWorkerProcessExitPreservesPublishedImageAndRefundsRemainder(t *testing.T) {
	s, job, _ := deliveryFixture(t, 2)
	var schema string
	if err := s.db.QueryRow("SELECT current_schema()").Scan(&schema); err != nil {
		t.Fatal(err)
	}
	command := exec.Command(os.Args[0], "-test.run=^TestGenerationWorkerCrashHelper$")
	command.Env = append(os.Environ(), "ISTUDIO_DELIVERY_CRASH_HELPER=1", "ISTUDIO_DELIVERY_CRASH_SCHEMA="+schema, "ISTUDIO_DELIVERY_CRASH_ROOT="+s.storageRoot, "ISTUDIO_DELIVERY_CRASH_JOB="+job.ID)
	output, err := command.CombinedOutput()
	var exit *exec.ExitError
	if !errors.As(err, &exit) || exit.ExitCode() != 73 {
		t.Fatalf("unexpected child result: %v %s", err, output)
	}
	partial, ok, err := repository.TaskByID(s.db, job.ID, "member")
	if err != nil || !ok || len(partial.ResultImages) != 1 {
		t.Fatal("published image lost on process exit", partial, err)
	}
	s.provider = &deliveryTestProvider{}
	expireDeliveryRun(t, s, job.ID)
	q := &taskQueue{server: s}
	q.processTask(job.ID)
	assertDeliverySettlement(t, s, job.ID, "failed", 1, 2)
}

func TestInterruptedCommerceDeliveryKeepsModuleAttribution(t *testing.T) {
	for _, clothing := range []bool{false, true} {
		t.Run(fmt.Sprint(clothing), func(t *testing.T) {
			s, model, _ := operationTestServer(t)
			s.storage = objectstore.NewLocal(s.storageRoot)
			data := siteLogoBytes(t, "png")
			if err := s.storage.Save("garment.png", bytes.NewReader(data)); err != nil {
				t.Fatal(err)
			}
			if _, err := s.db.Exec("INSERT INTO assets(id,user_id,filename,storage_key,mime,size_bytes) VALUES('garment','member','garment.png','garment.png','image/png',$1)", len(data)); err != nil {
				t.Fatal(err)
			}
			input := operationInput(model, 2)
			expectedModule := "hero"
			if clothing {
				input = clothingFixture("product", map[string]int{"clothing-front": 1, "clothing-detail": 1})
				input["endpointId"], input["model"], input["aspectRatio"], input["resolution"] = model, model, "1:1", "2K"
				raw, _ := json.Marshal(input["clothingPlan"])
				var shots []clothingShot
				if err := json.Unmarshal(raw, &shots); err != nil {
					t.Fatal(err)
				}
				expectedModule = shots[0].ModuleKey
			} else {
				input["mode"], input["taskType"], input["productAssetIds"] = "commerce", "product-main", []any{"garment"}
				input["moduleMode"], input["moduleCounts"] = "custom", map[string]any{"hero": float64(1), "scene": float64(1)}
			}
			job, _, err := s.reserveGeneration("member", "module-delivery", 125, input)
			if err != nil {
				t.Fatal(err)
			}
			source := "data:image/png;base64," + base64.StdEncoding.EncodeToString(data)
			calls := 0
			s.provider = &deliveryTestProvider{submit: func(context.Context, map[string]any) (providerTask, error) {
				calls++
				if calls == 2 {
					expireDeliveryRun(t, s, job.ID)
					return providerTask{}, context.Canceled
				}
				return providerTask{Images: []string{source}}, nil
			}}
			q := &taskQueue{server: s}
			q.processTask(job.ID)
			q.processTask(job.ID)
			final := assertDeliverySettlement(t, s, job.ID, "failed", 1, 2)
			if calls != 2 || !reflect.DeepEqual(final.ResultModules, []string{expectedModule}) {
				t.Fatal("module attribution or submission count lost", calls, final.ResultModules, expectedModule)
			}
		})
	}
}
