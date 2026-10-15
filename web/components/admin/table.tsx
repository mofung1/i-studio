import type { ReactNode } from 'react'

export function AdminTable({
  headings,
  children,
  empty,
}: {
  headings: string[]
  children: ReactNode
  empty?: boolean
}) {
  return (
    <div className="ops-table-scroll">
      <table className="ops-table">
        <thead>
          <tr>
            {headings.map((item) => (
              <th key={item}>{item}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="ops-empty">暂无记录</p>}
    </div>
  )
}
