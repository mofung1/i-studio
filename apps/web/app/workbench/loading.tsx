export default function WorkbenchLoading() {
  return (
    <div className="workbench-page">
      <div className="workbench-shell" aria-busy="true" aria-label="工作台加载中">
        <div className="mode-rail" />
        <div className="workbench-header">
          <div className="workbench-title-loading" />
          <div className="header-actions">
            <div className="workbench-chip-loading" />
            <div className="workbench-chip-loading" />
          </div>
        </div>
        <div className="configuration-panel">
          <div className="configuration-scroll">
            {Array.from({ length: 3 }, (_, index) => (
              <div className="form-section form-section-loading" key={index}>
                <div className="skeleton-line skeleton-line-wide" />
                <div className="skeleton-line" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line-narrow" />
              </div>
            ))}
          </div>
        </div>
        <div className="creation-canvas">
          <div className="canvas-copy">
            <div className="skeleton-line skeleton-line-narrow" />
          </div>
          <div className="canvas-preview-loading" />
        </div>
      </div>
    </div>
  )
}
