'use client'
import { useTransientMessage } from '@/hooks/use-transient-message'
import { AdminPageHeader } from '@/components/admin/page-header'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { adminRequest } from '@/lib/admin'
import type { PromptTemplate } from '@/lib/ai-settings'
import { promptGroupLabel } from '@/lib/prompt-groups'
import { PromptTemplateBrowser } from '@/components/prompt-template-browser'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Checkbox } from '@/components/admin/ui/checkbox'
import { Textarea } from '@/components/admin/ui/textarea'
import styles from '@/components/admin/settings-forms.module.css'
import '@/styles/admin-settings-layouts.css'

const promptVariableLabels: Record<string, string> = {
  prompt: '用户输入的画面描述',
  style: '所选创作风格的指令',
  language: '本次选择的画面文字语言',
}
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : '请求失败，请重试'

export default function AdminPromptsPage() {
  const [templates, setTemplates] = useState<PromptTemplate[]>([])
  const [selectedKey, setSelectedKey] = useState('')
  const [promptDraft, setPromptDraft] = useState('')
  const [promptEnabled, setPromptEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [saved, setSaved] = useTransientMessage()
  const [attempt, setAttempt] = useState(0)
  const activeTemplate = templates.find((template) => template.key === selectedKey)
  const promptDefault = activeTemplate?.defaultContent ?? ''
  const promptDirty =
    !!activeTemplate &&
    (promptDraft !== activeTemplate.content || promptEnabled !== activeTemplate.enabled)
  const drafts = useRef(new Map<string, { content: string; enabled: boolean }>())
  const dirtyTemplates = templates.filter((template) => {
    const draft =
      template.key === selectedKey
        ? { content: promptDraft, enabled: promptEnabled }
        : drafts.current.get(template.key)
    return draft && (draft.content !== template.content || draft.enabled !== template.enabled)
  })

  const load = useCallback(async (signal?: AbortSignal) => {
    const data = await adminRequest<{ templates: PromptTemplate[] }>(
      'prompt-templates',
      'GET',
      undefined,
      signal,
    )
    if (signal?.aborted) return
    setTemplates(data.templates)
    setSelectedKey((previous) => {
      if (data.templates.some((item) => item.key === previous)) return previous
      const requested = new URLSearchParams(window.location.search).get('template') ?? 'rewrite'
      return (
        data.templates.find((item) => item.key === requested)?.key ?? data.templates[0]?.key ?? ''
      )
    })
  }, [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setMessage('')
    load(controller.signal)
      .catch((error) => {
        if (!controller.signal.aborted) setMessage(errorMessage(error))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [load, attempt])
  useEffect(() => {
    if (activeTemplate) {
      const cached = drafts.current.get(activeTemplate.key)
      setPromptDraft(cached?.content ?? activeTemplate.content)
      setPromptEnabled(cached?.enabled ?? activeTemplate.enabled)
    }
  }, [activeTemplate])

  function selectTemplate(key: string) {
    if (key === selectedKey || busy) return
    drafts.current.set(selectedKey, { content: promptDraft, enabled: promptEnabled })
    setSelectedKey(key)
    setSaved('')
    setMessage('')
  }
  async function savePrompt() {
    if (busy || !activeTemplate) return
    setBusy(true)
    setMessage('')
    setSaved('')
    try {
      await adminRequest('prompt-templates', 'PUT', {
        key: selectedKey,
        content: promptDraft,
        enabled: promptEnabled,
        restoreDefault: false,
      })
      drafts.current.delete(activeTemplate.key)
      await load()
      setSaved('提示词已保存')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="ai-settings admin-prompts-page">
      <AdminPageHeader title="系统提示词" />
      {message && (
        <Alert variant="destructive" className="settings-error" role="alert">
          <AlertDescription>{message}</AlertDescription>
          {!templates.length && (
            <Button variant="outline" onClick={() => setAttempt((value) => value + 1)}>
              重试
            </Button>
          )}
        </Alert>
      )}
      {saved && !promptDirty && (
        <Alert className="settings-saved" role="status">
          <AlertDescription>{saved}</AlertDescription>
        </Alert>
      )}
      {loading ? (
        <div className="settings-loading" role="status">
          <LoaderCircle className="settings-spinner" size={20} />
          正在读取系统提示词
        </div>
      ) : templates.length ? (
        <section id="prompts-panel" className={`prompt-settings ${styles.promptLayout}`}>
          <div className={styles.promptSidebar}>
            <h2>功能模板</h2>
            <p>切换模板时保留草稿。</p>
            <PromptTemplateBrowser
              templates={templates}
              selectedKey={selectedKey}
              busy={!!busy}
              onSelect={selectTemplate}
            />
            {dirtyTemplates.length > 0 && (
              <div className={styles.pendingDrafts}>
                <strong>{dirtyTemplates.length} 个模板有未保存更改</strong>
                <div>
                  {dirtyTemplates.map((template) => (
                    <button
                      type="button"
                      key={template.key}
                      disabled={busy}
                      aria-label={`编辑未保存模板：${template.name}`}
                      onClick={() => selectTemplate(template.key)}
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className={`prompt-settings-editor ${styles.promptEditor}`}>
            {activeTemplate && (
              <p className="prompt-editor-breadcrumb">{promptGroupLabel(activeTemplate)}</p>
            )}
            <div className="prompt-editor-heading">
              <div className="prompt-editor-title">
                <h2>{activeTemplate?.name}</h2>
                {promptDirty && <span className="prompt-dirty-status">未保存更改</span>}
              </div>
              <label className="settings-switch">
                <Checkbox
                  checked={promptEnabled}
                  disabled={!!busy}
                  onCheckedChange={(checked) => setPromptEnabled(checked === true)}
                />
                <span
                  className="admin-switch-label"
                  data-tone={promptEnabled ? 'success' : 'danger'}
                >
                  {promptEnabled ? '已启用' : '已停用'}
                </span>
              </label>
            </div>
            {activeTemplate?.description && (
              <p className="prompt-template-purpose">{activeTemplate.description}</p>
            )}
            <p className="admin-field-hint">
              {activeTemplate?.category === 'reverse'
                ? '此模板决定对应图片反推模式的分析方式。停用后，该模式将无法发起分析。'
                : '此模板由所有账号共享。停用后，该功能不再附加这里的系统指令。'}
            </p>
            {!!activeTemplate?.variables?.length && (
              <p className="prompt-template-variables">
                可用变量：
                {activeTemplate.variables.map((variable) => (
                  <span key={variable}>
                    <code>{`{{${variable}}}`}</code> {promptVariableLabels[variable] ?? variable}
                  </span>
                ))}
              </p>
            )}
            <Textarea
              className="prompt-content-editor"
              aria-label="提示词模板内容"
              value={promptDraft}
              disabled={!!busy}
              maxLength={20000}
              rows={18}
              onChange={(event) => setPromptDraft(event.target.value)}
            />
            <details className="prompt-default">
              <summary>查看系统默认内容</summary>
              <pre>{promptDefault}</pre>
            </details>
            <div className={styles.promptFooter}>
              <p id="prompt-save-scope">
                {promptDraft.length.toLocaleString()} / 20,000 字符
                {' · 保存仅更新当前模板'}
              </p>
              <div className="settings-form-actions">
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() => {
                    setPromptDraft(promptDefault)
                    setSaved('')
                    setMessage('')
                  }}
                >
                  <RotateCcw data-icon="inline-start" />
                  填入默认内容
                </Button>
                <Button
                  disabled={!!busy || !promptDirty || !promptDraft.trim()}
                  aria-describedby="prompt-save-scope"
                  onClick={() => savePrompt()}
                >
                  <Save data-icon="inline-start" />
                  {busy ? '保存中' : '保存'}
                </Button>
              </div>
            </div>
          </div>
        </section>
      ) : (
        !message && <p className="settings-empty">暂无系统提示词模板。</p>
      )}
    </main>
  )
}
