export default function TaskDetailLoading() {
  return (
    <main className="task-detail-page" aria-busy="true" aria-label="任务详情加载中">
      <div className="task-detail-card">
        <div className="skeleton-line skeleton-line-narrow" />
        <h1 className="skeleton-headline" />
        <div className="task-status">
          <div className="skeleton-line" />
          <div className="skeleton-line" />
        </div>
        <div className="result-grid">
          {Array.from({ length: 2 }, (_, index) => (
            <div className="task-result-loading" key={index} />
          ))}
        </div>
      </div>
    </main>
  )
}
