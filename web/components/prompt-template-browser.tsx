'use client'

import { ChevronDown, ChevronRight, Folder, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PromptTemplate } from '@/lib/ai-settings'
import { groupPromptTemplates, promptGroupKey, promptTemplateLabel } from '@/lib/prompt-groups'

export function PromptTemplateBrowser({
  templates,
  selectedKey,
  busy,
  onSelect,
}: {
  templates: PromptTemplate[]
  selectedKey: string
  busy: boolean
  onSelect: (key: string) => void
}) {
  const selected = templates.find((template) => template.key === selectedKey)
  const selectedGroup = selected ? promptGroupKey(selected) : ''
  const [expandedGroup, setExpandedGroup] = useState(
    selected ? promptGroupKey(selected) : 'enhance',
  )
  const [search, setSearch] = useState('')
  const [searchCollapsed, setSearchCollapsed] = useState<string[]>([])
  useEffect(() => {
    if (selectedGroup) setExpandedGroup(selectedGroup)
  }, [selectedKey, selectedGroup])
  const groups = groupPromptTemplates(templates, search)
  const matches = groups.reduce((sum, group) => sum + group.templates.length, 0)
  function toggle(key: string) {
    if (search.trim())
      setSearchCollapsed((previous) =>
        previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key],
      )
    else setExpandedGroup((previous) => (previous === key ? '' : key))
  }

  return (
    <aside className="prompt-template-browser">
      <label className="prompt-template-search">
        <Search size={15} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜索内置提示词"
          placeholder="搜索名称或用途"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value)
            setSearchCollapsed([])
          }}
        />
      </label>
      <p className="prompt-template-count" role="status">
        {search.trim() ? `找到 ${matches} 个模板` : `${templates.length} 个模板 · 按用途分组`}
      </p>
      <nav className="prompt-template-tree" aria-label="提示词模板">
        {groups.map((group) => {
          const expanded = search.trim()
            ? !searchCollapsed.includes(group.key)
            : expandedGroup === group.key
          const activeGroup = group.templates.some((template) => template.key === selectedKey)
          return (
            <div
              className={`prompt-template-group${activeGroup ? ' has-current' : ''}`}
              key={group.key}
            >
              <button
                type="button"
                className="prompt-template-group-toggle"
                aria-expanded={expanded}
                aria-controls={`prompt-group-${group.key}`}
                disabled={busy}
                onClick={() => toggle(group.key)}
              >
                {expanded ? (
                  <ChevronDown size={14} aria-hidden="true" />
                ) : (
                  <ChevronRight size={14} aria-hidden="true" />
                )}
                <Folder size={15} aria-hidden="true" />
                <span>{group.label}</span>
                <small>{group.templates.length}</small>
              </button>
              {expanded && (
                <div
                  id={`prompt-group-${group.key}`}
                  className="prompt-template-children"
                  role="group"
                  aria-label={group.label}
                >
                  {group.templates.map((template) => (
                    <button
                      key={template.key}
                      type="button"
                      className="prompt-template-item"
                      disabled={busy}
                      aria-current={template.key === selectedKey ? 'true' : undefined}
                      onClick={() => onSelect(template.key)}
                    >
                      <span>{promptTemplateLabel(template)}</span>
                      <small
                        className={`prompt-template-status${template.enabled ? '' : ' is-disabled'}`}
                      >
                        {template.enabled ? '已启用' : '已停用'}
                      </small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      {!groups.length && <p className="settings-empty">没有匹配的模板</p>}
    </aside>
  )
}
