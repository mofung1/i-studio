import type { ReactNode } from 'react'

export function AdminTable({
  headings,
  children,
  empty,
  loading = false,
}: {
  headings: string[]
  children: ReactNode
  empty?: boolean
  loading?: boolean
}) {
  return (
    <div className="ops-table-scroll" tabIndex={0} aria-label="列表内容" aria-busy={loading}>
      <table className="ops-table">
        <thead>
          <tr>
            {headings.map((item) => (
              <th key={item}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading && empty ? (
            <tr>
              <td colSpan={headings.length} className="ops-empty">
                正在读取…
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
      {empty && !loading && <p className="ops-empty">暂无记录</p>}
    </div>
  )
}
