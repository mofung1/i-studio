package studio

import (
	"database/sql"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"

	"github.com/istudio/server/internal/domain"
	objectstore "github.com/istudio/server/internal/storage"
)

// Dependencies are supplied by the process composition root, not global state.
type Dependencies struct {
	Database    *sql.DB
	Storage     objectstore.Store
	StorageRoot string
	AuthSecret  []byte
}

// New initializes application services without starting background workers.
func New(deps Dependencies) (*Service, error) {
	if deps.Database == nil || deps.Storage == nil || len(deps.AuthSecret) == 0 {
		return nil, fmt.Errorf("database, storage and authentication key are required")
	}
	s := &Service{
		users: map[string]domain.User{}, tasks: map[string]domain.GenerationTask{},
		secret: append([]byte(nil), deps.AuthSecret...), db: deps.Database,
		storageRoot: deps.StorageRoot, storage: deps.Storage,
	}
	s.storage = objectstore.NewRouter(s.storage, s, s.recordStorageFailure)
	if err := s.syncEnvironmentAdmin(); err != nil {
		return nil, fmt.Errorf("administrator configuration: %w", err)
	}
	s.ai = newAIConfigStore(s)
	if err := s.ai.migrateLegacy(); err != nil {
		return nil, fmt.Errorf("AI configuration: %w", err)
	}
	if err := cleanupLegacyGeneratedAssets(s.db, s.storage); err != nil {
		fmt.Printf("legacy generated asset cleanup skipped: %v\n", err)
	}
	s.provider = &dynamicImageProvider{server: s}
	s.promptClient = &dynamicPromptClient{server: s}
	return s, nil
}

// StartWorkers starts the durable task dispatcher, reverse tasks and storage maintenance.
func (s *Service) StartWorkers() {
	s.queue = newTaskQueue(s)
	s.startPromptReverseWorkers()
	s.startStorageMaintenance()
}

// Service coordinates studio workflows and their shared transaction boundaries.
type Service struct {
	aiHTTPClient             *http.Client // Internal transport injection for isolated upstream tests.
	mu                       sync.RWMutex
	siteMu                   sync.Mutex
	users                    map[string]domain.User
	administrators           map[string]domain.User
	tasks                    map[string]domain.GenerationTask
	secret                   []byte
	db                       *sql.DB
	storageRoot              string
	storage                  objectstore.Store
	queue                    *taskQueue
	provider                 imageProvider
	promptClient             promptCompleter
	ai                       *aiConfigStore
	reverseCancels           sync.Map
	storageMonitoringDropped atomic.Int64
}
