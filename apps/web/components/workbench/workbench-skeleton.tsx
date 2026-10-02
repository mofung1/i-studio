/**
 * 工作台骨架屏。
 * 结构复用真实工作台的布局类（rail / nav / configuration-panel / creation-canvas），
 * 这样加载完成时不会出现白屏或布局跳动。
 */
export function WorkbenchSkeleton() {
  return (
    <main className="workbench-page">
      <section className={`workbench-shell config-${typeof document !== 'undefined' ? (document.documentElement.getAttribute('data-wb-side') || 'left') : 'left'}`} aria-busy="true" aria-label="工作台加载中">
        <aside className="workbench-rail" aria-hidden="true">
          <div className="workbench-rail-brand"><span className="ws-block ws-brand" /></div>
          <nav className="workbench-rail-nav">
            <span className="ws-rail-item">
              <span className="ws-block ws-icon" />
              <span className="skeleton-line ws-label" />
            </span>
            <span className="ws-rail-item">
              <span className="ws-block ws-icon" />
              <span className="skeleton-line ws-label" />
            </span>
          </nav>
        </aside>

        <header className="workbench-nav" aria-hidden="true">
          <span className="skeleton-line ws-nav-title" />
          <div className="workbench-nav-actions">
            <span className="skeleton-line ws-chip" />
            <span className="ws-block ws-close" />
          </div>
        </header>

        <aside className="configuration-panel creator-sidebar" aria-hidden="true">
          <div className="configuration-scroll">
            <div className="form-section config-card ws-card">
              <span className="skeleton-line skeleton-line-narrow" />
              <span className="ws-block ws-upload" />
            </div>
            <div className="form-section config-card ws-card">
              <span className="skeleton-line skeleton-line-narrow" />
              <span className="ws-block ws-block-lg" />
            </div>
            <div className="form-section config-card ws-card">
              <span className="skeleton-line skeleton-line-narrow" />
              <span className="ws-block ws-block-sm" />
            </div>
          </div>
          <div className="configuration-footer">
            <span className="skeleton-line skeleton-line-wide" />
            <span className="ws-block ws-button" />
          </div>
        </aside>

        <section className="creation-canvas" aria-hidden="true">
          <div className="ws-canvas">
            <span className="ws-block ws-canvas-icon" />
            <span className="skeleton-line ws-canvas-title" />
            <span className="skeleton-line skeleton-line-wide" />
            <span className="ws-block ws-reference" />
          </div>
        </section>
      </section>
    </main>
  )
}
