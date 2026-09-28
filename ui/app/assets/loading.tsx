import { TopNavigation } from '@/components/top-navigation'

export default function AssetsLoading() {
  return (
    <div className="site-shell">
      <TopNavigation />
      <main className="content-page" aria-busy="true" aria-label="资产库加载中">
        <div className="library-content">
          <div className="content-page-head">
            <div>
              <div className="skeleton-line skeleton-line-narrow" />
              <h1 className="skeleton-headline" />
            </div>
            <div className="skeleton-line skeleton-line-wide" />
          </div>
          <div className="asset-grid">
            {Array.from({ length: 10 }, (_, index) => (
              <div className="asset-item asset-item-loading" key={index}>
                <div className="asset-placeholder" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line-narrow" />
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
