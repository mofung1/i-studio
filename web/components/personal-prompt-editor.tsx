'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { DialogActions } from './dialog-actions'
import { LibraryDialog, LibrarySelect } from './library-controls'
import { libraryRequest } from '@/lib/library'
import {
  presetDescription,
  type CreationPreset,
  type PersonalPrompt,
  type PromptVersion,
} from '@/lib/personal-prompts'
import { styleOptions } from './workbench/shared'
import { clothingStyles } from '@/lib/clothing'
import { useAccount } from './account-provider'
import { useActionConfirmation } from './use-action-confirmation'
import {
  personalPromptDraftKey,
  readPersonalPromptDraft,
  writePersonalPromptDraft,
  type PersonalPromptDraft,
} from '@/lib/personal-prompt-draft'

export interface PersonalPromptSeed {
  title?: string
  prompt: string
  source?: string
  config?: CreationPreset
  favorite?: boolean
}
interface PersonalPromptEditorProps {
  portalContainer?: HTMLElement | null
  item?: PersonalPrompt
  seed?: PersonalPromptSeed
  categories?: string[]
  onClose: () => void
  onSaved: (item: PersonalPrompt) => void
}

export function PersonalPromptEditor(props: PersonalPromptEditorProps) {
  const { account, loading } = useAccount()
  const owner = account.user?.id
  if (loading || !account.authenticated || !owner)
    return (
      <LibraryDialog
        title="编辑提示词"
        onClose={props.onClose}
        portalContainer={props.portalContainer}
      >
        <p role="status">{loading ? '正在确认登录状态…' : '请登录后编辑提示词。'}</p>
      </LibraryDialog>
    )
  const identity = props.item
    ? `${props.item.id}:${props.item.version}`
    : props.seed?.config
      ? 'new-preset'
      : 'new-prompt'
  return <PersonalPromptEditorContent key={`${owner}:${identity}`} {...props} owner={owner} />
}

function PersonalPromptEditorContent({
  item,
  seed: incomingSeed,
  categories = [],
  onClose,
  onSaved,
  portalContainer,
  owner,
}: PersonalPromptEditorProps & { owner: string }) {
  // Background model/parameter updates must not replace a draft while its dialog is open.
  const [seed] = useState(incomingSeed)
  const formId = useId()
  const kind = item?.kind ?? (seed?.config ? 'preset' : 'prompt')
  const [title, setTitle] = useState((item?.title ?? seed?.title ?? '').slice(0, 160))
  const [category, setCategory] = useState(item?.category ?? '')
  const [prompt, setPrompt] = useState(item?.prompt ?? seed?.prompt ?? '')
  const [tags, setTags] = useState(item?.tags.join('、') ?? '')
  const [favorite, setFavorite] = useState(item?.favorite ?? seed?.favorite ?? false)
  const [config, setConfig] = useState(item?.config ?? seed?.config ?? {})
  const [newCategory, setNewCategory] = useState(false)
  const [versions, setVersions] = useState<PromptVersion[] | null>(null)
  const [nextBefore, setNextBefore] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [endpoints, setEndpoints] = useState<Array<{ id: string; name: string; model: string }>>([])
  const [storedCategories, setStoredCategories] = useState<string[]>([])
  const initialDraft = useRef({ title, category, prompt, tags, favorite, config, newCategory })
  const baseline = JSON.stringify({
    value: initialDraft.current,
    source: seed?.source ?? item?.source,
  })
  const draftKey = personalPromptDraftKey(
    owner,
    item ? `${item.id}:${item.version}` : kind,
    baseline,
  )
  const draftValue: PersonalPromptDraft = {
    title,
    category,
    prompt,
    tags,
    favorite,
    config,
    newCategory,
  }
  const serializedDraft = JSON.stringify(draftValue)
  const dirty = serializedDraft !== JSON.stringify(initialDraft.current)
  const [draftReady, setDraftReady] = useState(false)
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const [restoredDraft, setRestoredDraft] = useState(false)
  const savedDraft = useRef('')
  const completed = useRef(false)
  const active = useRef(true)
  const { ask, confirmation } = useActionConfirmation()

  useEffect(() => {
    active.current = true
    try {
      const saved = readPersonalPromptDraft(draftKey, baseline)
      if (saved) {
        setTitle(saved.title)
        setCategory(saved.category)
        setPrompt(saved.prompt)
        setTags(saved.tags)
        setFavorite(saved.favorite)
        setConfig(saved.config)
        setNewCategory(saved.newCategory)
        savedDraft.current = JSON.stringify(saved)
        setRestoredDraft(true)
        setDraftStatus('saved')
      }
    } catch {
      setDraftStatus('error')
    }
    setDraftReady(true)
    return () => {
      active.current = false
    }
  }, [draftKey, baseline])

  useEffect(() => {
    if (!draftReady || completed.current) return
    if (!dirty && !savedDraft.current) return
    try {
      if (dirty) writePersonalPromptDraft(draftKey, baseline, JSON.parse(serializedDraft))
      else localStorage.removeItem(draftKey)
      savedDraft.current = serializedDraft
      setDraftStatus(dirty ? 'saved' : 'idle')
      if (!dirty) setRestoredDraft(false)
    } catch {
      setDraftStatus('error')
    }
  }, [draftReady, dirty, draftKey, baseline, serializedDraft])

  useEffect(() => {
    const controller = new AbortController()
    void libraryRequest<{ categories: string[] }>(`personal/prompts?kind=${kind}&limit=1`, {
      signal: controller.signal,
    })
      .then((data) => {
        if (!controller.signal.aborted) setStoredCategories(data.categories)
      })
      .catch(() => {
        /* New categories can still be entered when this lookup fails. */
      })
    return () => controller.abort()
  }, [kind])
  useEffect(() => {
    if (kind !== 'preset') return
    const controller = new AbortController()
    void libraryRequest<{ imageEndpoints?: Array<{ id: string; name: string; model: string }> }>(
      'generation/capabilities',
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setEndpoints(data.imageEndpoints ?? [])
      })
      .catch(() => {
        /* The saved model stays visible if capabilities cannot be read. */
      })
    return () => controller.abort()
  }, [kind])
  async function close() {
    if (busy) return
    if (dirty && savedDraft.current !== serializedDraft) {
      try {
        writePersonalPromptDraft(draftKey, baseline, draftValue)
        savedDraft.current = serializedDraft
      } catch {
        setDraftStatus('error')
        if (
          !(await ask({
            title: '草稿尚未保存',
            description: '浏览器无法保存本地草稿，关闭后会丢失本次修改。',
            confirmLabel: '放弃修改并关闭',
            intent: 'danger',
          }))
        )
          return
      }
    }
    onClose()
  }
  async function discardDraft() {
    if (
      busy ||
      !(await ask({
        title: '放弃这份草稿？',
        description: '将清除本次未提交的修改，已保存的提示词不受影响。',
        confirmLabel: '放弃草稿',
        intent: 'danger',
      }))
    )
      return
    try {
      localStorage.removeItem(draftKey)
      completed.current = true
      onClose()
    } catch {
      setError('本地草稿暂时无法清除，请重试')
    }
  }
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      const data = await libraryRequest<{ item: PersonalPrompt }>(
        `personal/prompts${item ? `/${item.id}` : ''}`,
        {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify({
            kind,
            title,
            category,
            prompt,
            tags: tags.split(/[,，、\n]/),
            ...(!item || favorite !== item.favorite ? { favorite } : {}),
            config,
            source: item?.source ?? seed?.source ?? '',
            ...(item ? { version: item.version } : {}),
          }),
        },
      )
      if (!active.current) return
      completed.current = true
      try {
        localStorage.removeItem(draftKey)
      } catch {
        /* The server copy is already saved. */
      }
      onSaved(data.item)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }
  async function loadVersions(before = 0) {
    if (!item || busy) return
    setBusy(true)
    setError('')
    try {
      const data = await libraryRequest<{ versions: PromptVersion[]; nextBefore: number }>(
        `personal/prompts/${item.id}/versions${before ? `?before=${before}` : ''}`,
      )
      setVersions((previous) => (before ? [...(previous ?? []), ...data.versions] : data.versions))
      setNextBefore(data.nextBefore)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '版本读取失败')
    } finally {
      setBusy(false)
    }
  }
  const knownCategories = [
    ...new Set([...categories, ...storedCategories, item?.category ?? ''].filter(Boolean)),
  ]
  const selectedEndpoint =
    endpoints.find(
      (endpoint) => endpoint.id === config.endpointId && endpoint.model === config.model,
    ) ?? endpoints.find((endpoint) => endpoint.model === config.model)
  return (
    <LibraryDialog
      title={
        item
          ? `编辑${kind === 'preset' ? '创作预设' : '私有提示词'}`
          : `保存${kind === 'preset' ? '创作预设' : '私有提示词'}`
      }
      onClose={() => void close()}
      portalContainer={portalContainer}
      footer={
        <DialogActions>
          <button
            type="button"
            className="studio-secondary"
            disabled={busy}
            onClick={() => void close()}
          >
            {dirty ? '关闭并保留草稿' : '取消'}
          </button>
          {(dirty || restoredDraft) && (
            <button
              type="button"
              className="library-command"
              disabled={busy}
              onClick={() => void discardDraft()}
            >
              放弃草稿
            </button>
          )}
          <button
            form={formId}
            type="submit"
            className="studio-primary"
            disabled={busy || !title.trim() || (kind === 'prompt' && !prompt.trim())}
          >
            {busy ? '保存中…' : '保存到我的提示词'}
          </button>
        </DialogActions>
      }
    >
      {confirmation}
      {draftStatus === 'error' ? (
        <p className="settings-error" role="alert">
          草稿未保存，请勿刷新或离开页面。你仍可保存到我的提示词。
        </p>
      ) : draftStatus === 'saved' ? (
        <p className="library-feedback" role="status">
          {restoredDraft ? '已恢复本地草稿，修改会自动保存。' : '草稿已保存在此浏览器。'}
        </p>
      ) : null}
      <form
        id={formId}
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <label>
          名称
          <input
            aria-label="提示词名称"
            autoFocus
            required
            maxLength={160}
            value={title}
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="给这次创作起个名字"
          />
        </label>
        <label>
          分类
          <LibrarySelect
            label="私有提示词分类"
            disabled={busy}
            value={newCategory ? 'new' : category ? `c:${category}` : 'none'}
            onChange={(value) => {
              if (value === 'new') {
                setNewCategory(true)
                setCategory('')
              } else {
                setNewCategory(false)
                setCategory(value === 'none' ? '' : value.slice(2))
              }
            }}
            options={[
              ['none', '未分类'],
              ...knownCategories.map((value) => [`c:${value}`, value] as [string, string]),
              ['new', '新增分类…'],
            ]}
          />
          {newCategory && (
            <input
              aria-label="新分类名称"
              maxLength={80}
              value={category}
              disabled={busy}
              onChange={(event) => setCategory(event.target.value)}
              placeholder="输入新分类名称"
            />
          )}
        </label>
        <label>
          提示词
          <textarea
            aria-label="私有提示词内容"
            required={kind === 'prompt'}
            rows={6}
            maxLength={10000}
            value={prompt}
            disabled={busy}
            onChange={(event) => setPrompt(event.target.value)}
          />
          <small>可以使用 {'{{产品名称}}'} 等变量，应用时填写。</small>
        </label>
        {kind === 'preset' && (
          <>
            <p className="personal-preset-summary">
              {presetDescription(config)}
              <small>保存创作参数，原图与参考素材在使用时另行选择。</small>
            </p>
            <details className="personal-preset-fields">
              <summary>编辑创作参数</summary>
              <div>
                <label>
                  模型
                  <LibrarySelect
                    label="预设模型"
                    disabled={busy}
                    value={selectedEndpoint?.id ?? 'saved'}
                    onChange={(value) => {
                      const endpoint = endpoints.find((item) => item.id === value)
                      if (endpoint)
                        setConfig((previous) => ({
                          ...previous,
                          endpointId: endpoint.id,
                          model: endpoint.model,
                        }))
                    }}
                    options={[
                      ...(!selectedEndpoint
                        ? [['saved', config.model || '已保存模型'] as [string, string]]
                        : []),
                      ...endpoints.map(
                        (endpoint) => [endpoint.id, endpoint.name] as [string, string],
                      ),
                    ]}
                  />
                </label>
                <label>
                  画面比例
                  <LibrarySelect
                    label="预设画面比例"
                    disabled={busy}
                    value={config.aspectRatio ?? ''}
                    onChange={(value) =>
                      setConfig((previous) => ({
                        ...previous,
                        aspectRatio: value as CreationPreset['aspectRatio'],
                      }))
                    }
                    options={['1:1', '3:4', '4:3', '9:16', '16:9'].map((value) => [value, value])}
                  />
                </label>
                <label>
                  清晰度
                  <LibrarySelect
                    label="预设清晰度"
                    disabled={busy}
                    value={config.resolution ?? ''}
                    onChange={(value) =>
                      setConfig((previous) => ({
                        ...previous,
                        resolution: value as CreationPreset['resolution'],
                      }))
                    }
                    options={['1K', '2K', '4K'].map((value) => [value, value])}
                  />
                </label>
                {config.mode === 'general' && (
                  <>
                    <label>
                      生成张数
                      <input
                        aria-label="预设生成张数"
                        type="number"
                        required
                        min={1}
                        max={4}
                        step={1}
                        disabled={busy}
                        value={config.count}
                        onChange={(event) =>
                          setConfig((previous) => ({
                            ...previous,
                            count: event.target.valueAsNumber,
                          }))
                        }
                      />
                    </label>
                    <label>
                      风格
                      <LibrarySelect
                        label="预设风格"
                        disabled={busy}
                        value={config.style ?? 'unspecified'}
                        onChange={(value) =>
                          setConfig((previous) => ({
                            ...previous,
                            style: value as CreationPreset['style'],
                          }))
                        }
                        options={styleOptions}
                      />
                    </label>
                  </>
                )}
                {config.taskType === 'clothing-set' && (
                  <label>
                    拍摄风格
                    <LibrarySelect
                      label="预设拍摄风格"
                      disabled={busy}
                      value={config.clothingStyle ?? 'studio'}
                      onChange={(value) =>
                        setConfig((previous) => ({
                          ...previous,
                          clothingStyle: value as CreationPreset['clothingStyle'],
                        }))
                      }
                      options={clothingStyles}
                    />
                  </label>
                )}
              </div>
              <small>电商图种和素材可在工作台中继续调整。</small>
            </details>
          </>
        )}
        <label>
          标签
          <input
            aria-label="提示词标签"
            maxLength={400}
            value={tags}
            disabled={busy}
            onChange={(event) => setTags(event.target.value)}
            placeholder="用逗号分隔标签"
          />
        </label>
        <label className="personal-checkbox">
          <input
            type="checkbox"
            checked={favorite}
            disabled={busy}
            onChange={(event) => setFavorite(event.target.checked)}
          />
          加入收藏
        </label>
        {item && (
          <button
            className="library-command"
            type="button"
            disabled={busy}
            onClick={() => void loadVersions()}
          >
            版本记录 · 当前 v{item.version}
          </button>
        )}
        {versions && (
          <div className="personal-versions">
            {versions.map((version) => (
              <div key={version.version}>
                <span>
                  v{version.version} · {new Date(version.createdAt).toLocaleString('zh-CN')}
                </span>
                <p>{version.snapshot.prompt || presetDescription(version.snapshot.config)}</p>
                <button
                  type="button"
                  className="library-command"
                  disabled={busy}
                  onClick={() => {
                    const previous = version.snapshot
                    setTitle(previous.title)
                    setCategory(previous.category)
                    setNewCategory(!knownCategories.includes(previous.category))
                    setPrompt(previous.prompt)
                    setTags(previous.tags.join('、'))
                    setConfig(previous.config)
                    setVersions(null)
                  }}
                >
                  载入此版本
                </button>
              </div>
            ))}
            {nextBefore > 0 && (
              <button
                className="library-command"
                type="button"
                disabled={busy}
                onClick={() => void loadVersions(nextBefore)}
              >
                更早版本
              </button>
            )}
            <small>载入后点击保存，会创建新版本。</small>
          </div>
        )}
        {error && (
          <p role="alert" className="settings-error">
            {error}
          </p>
        )}
      </form>
    </LibraryDialog>
  )
}
