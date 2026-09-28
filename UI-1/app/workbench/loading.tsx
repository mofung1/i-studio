export default function WorkbenchLoading() {
  return (
    <div className="app-shell" aria-busy="true" aria-label="工作台加载中">
      <div className="rail" />
      <main className="app-main">
        <div className="job-bar" />
        <div className="workbench">
          <div className="spec-panel">
            <div className="spec-head">
              <div>
                <div className="skeleton" style={{ height: 12, width: 90 }} />
                <div className="skeleton" style={{ height: 22, width: 160, marginTop: 8 }} />
              </div>
            </div>
            <div className="spec-scroll">
              {Array.from({ length: 3 }, (_, index) => (
                <div className="clause" key={index}>
                  <span className="clause-index" />
                  <div className="clause-body">
                    <div className="skeleton" style={{ height: 14, width: '40%' }} />
                    <div className="skeleton" style={{ height: 96 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="light-table" />
        </div>
      </main>
    </div>
  )
}
