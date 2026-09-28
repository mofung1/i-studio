export default function AssetsLoading() {
  return (
    <div className="app-shell" aria-busy="true" aria-label="资产库加载中">
      <div className="rail" />
      <main className="app-main">
        <div className="job-bar" />
        <div className="page">
          <div className="page-inner">
            <div className="page-head">
              <div className="skeleton" style={{ height: 40, width: 220 }} />
            </div>
            <div className="sheet-grid" style={{ marginTop: 24 }}>
              {Array.from({ length: 8 }, (_, index) => (
                <div className="sheet-cell" key={index}>
                  <div className="skeleton" style={{ aspectRatio: '1' }} />
                  <div className="skeleton" style={{ height: 12, width: '70%' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
