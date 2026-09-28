export default function WorkbenchLoading() {
  return (
    <div className="workbench-page">
      <div className="workbench-shell" aria-busy="true" aria-label="工作台加载中">
        <div className="workbench-rail">
          <div className="workbench-rail-brand"><div className="skeleton-line skeleton-line-narrow" /></div>
        </div>
        <div className="workbench-nav">
          <div className="workbench-nav-context"><div className="skeleton-line skeleton-line-narrow" /></div>
        </div>
        <div className="configuration-panel creator-sidebar">
          <div className="configuration-scroll">
            {Array.from({ length: 4 }, (_, index) => (
              <div className="form-section form-section-loading" key={index}>
                <div className="skeleton-line skeleton-line-wide" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line-narrow" />
              </div>
            ))}
          </div>
          <div className="configuration-footer generate-bar"><div className="skeleton-line" /></div>
        </div>
        <div className="creation-canvas result-workspace">
          <div className="result-head">
            <div className="result-head-copy"><div className="skeleton-line skeleton-line-narrow" /></div>
          </div>
          <div className="result-body">
            <div className="result-skeleton" />
          </div>
        </div>
      </div>
    </div>
  )
}
