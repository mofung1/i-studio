export default function TaskDetailLoading() {
  return (
    <div className="app-shell" aria-busy="true" aria-label="任务详情加载中">
      <div className="rail" />
      <main className="app-main">
        <div className="job-bar" />
        <div className="page">
          <div className="page-inner">
            <div className="detail-card">
              <div className="skeleton" style={{ height: 26, width: 220 }} />
              <div className="skeleton" style={{ height: 60 }} />
              <div className="skeleton" style={{ height: 280 }} />
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
