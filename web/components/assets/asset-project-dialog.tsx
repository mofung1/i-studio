'use client'

import { Check, Folder, Search } from 'lucide-react'
import { useState } from 'react'
import { LibraryDialog } from '@/components/library-controls'
import type { LibraryAsset, LibraryProject } from '@/lib/library'

export function AssetProjectDialog({
  assets,
  projects,
  busy,
  error,
  onClose,
  onMove,
}: {
  assets: LibraryAsset[]
  projects: LibraryProject[]
  busy: boolean
  error: string
  onClose: () => void
  onMove: (projectId: string) => void
}) {
  const firstProject = assets[0]?.projectId || ''
  const sameProject = assets.every((asset) => asset.projectId === firstProject)
  const [target, setTarget] = useState(sameProject ? firstProject : '')
  const [query, setQuery] = useState('')
  const currentName = sameProject ? assets[0]?.projectName || '未分类' : '多个项目'
  const options = [
    { id: '', name: '未分类', archived: false },
    ...projects.filter((project) => !project.archived),
  ].filter((project) => project.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  const unchanged = assets.every((asset) => asset.projectId === target)
  return (
    <LibraryDialog
      title={assets.length === 1 ? '移至项目' : `移动 ${assets.length} 张图片`}
      onClose={() => {
        if (!busy) onClose()
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!unchanged && !busy) onMove(target)
        }}
      >
        <p className="asset-move-current">
          当前项目：<strong>{currentName}</strong>
        </p>
        <label className="library-search asset-project-search">
          <Search size={16} aria-hidden="true" />
          <input
            type="search"
            aria-label="搜索目标项目"
            placeholder="搜索项目名称"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={busy}
          />
        </label>
        <div className="asset-project-options" role="radiogroup" aria-label="目标项目">
          {options.map((project) => (
            <label
              key={project.id}
              className={`asset-project-option${target === project.id ? ' is-selected' : ''}`}
            >
              <input
                type="radio"
                name="asset-target-project"
                value={project.id}
                checked={target === project.id}
                onChange={() => setTarget(project.id)}
                disabled={busy}
              />
              <Folder size={17} aria-hidden="true" />
              <span>{project.name}</span>
              {sameProject && firstProject === project.id && <small>当前项目</small>}
              {target === project.id && <Check size={16} aria-hidden="true" />}
            </label>
          ))}
          {!options.length && <p className="asset-project-no-results">没有匹配的项目</p>}
        </div>
        {error && (
          <p className="settings-error" role="alert">
            {error}
          </p>
        )}
        <div className="library-form-actions">
          <button type="button" className="studio-secondary" disabled={busy} onClick={onClose}>
            取消
          </button>
          <button type="submit" className="studio-primary" disabled={busy || unchanged}>
            {busy ? '移动中…' : unchanged ? '已在此项目' : '确认移动'}
          </button>
        </div>
      </form>
    </LibraryDialog>
  )
}
