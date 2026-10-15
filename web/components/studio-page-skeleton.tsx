export function StudioPageSkeleton() {
  return (
    <div className="studio-page-skeleton" role="status" aria-label="页面加载中">
      <aside className="studio-page-skeleton-rail" aria-hidden="true">
        <span className="studio-page-skeleton-block is-brand" />
        {Array.from({ length: 4 }, (_, index) => (
          <span className="studio-page-skeleton-block" key={index} />
        ))}
      </aside>
      <header className="studio-page-skeleton-topbar" aria-hidden="true">
        <span className="studio-page-skeleton-block" />
        <span className="studio-page-skeleton-block is-avatar" />
      </header>
      <main className="studio-page-skeleton-content" aria-hidden="true">
        <span className="studio-page-skeleton-block is-wide" />
        <div className="studio-page-skeleton-gallery">
          {Array.from({ length: 3 }, (_, index) => (
            <span className="studio-page-skeleton-block is-card" key={index} />
          ))}
        </div>
      </main>
    </div>
  )
}
