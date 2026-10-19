'use client'
import { AdminPageHeader } from '@/components/admin/page-header'

import { useCallback, useEffect, useState } from 'react'
import { LoaderCircle, RotateCcw, Save } from 'lucide-react'
import { adminRequest } from '@/lib/admin'
import type { PromptTemplate } from '@/lib/ai-settings'
import { promptGroupLabel } from '@/lib/prompt-groups'
import { PromptTemplateBrowser } from '@/components/prompt-template-browser'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { useAdminUnsavedChanges } from '@/components/admin/use-unsaved-changes'

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
  const [saved, setSaved] = useState('')
  const [attempt, setAttempt] = useState(0)
  const activeTemplate = templates.find((template) => template.key === selectedKey)
  const promptDefault = activeTemplate?.defaultContent ?? ''
  const promptDirty =
    !!activeTemplate &&
    (promptDraft !== activeTemplate.content || promptEnabled !== activeTemplate.enabled)
  useAdminUnsavedChanges(promptDirty)

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
      setPromptDraft(activeTemplate.content)
      setPromptEnabled(activeTemplate.enabled)
    }
  }, [activeTemplate])

  function selectTemplate(key: string) {
    if (key === selectedKey || busy) return
    if (promptDirty && !window.confirm('放弃未保存的修改？')) return
    setSelectedKey(key)
    setSaved('')
    setMessage('')
  }
  async function savePrompt(restoreDefault = false) {
    if (busy || !activeTemplate) return
    setBusy(true)
    setMessage('')
    setSaved('')
    try {
      await adminRequest('prompt-templates', 'PUT', {
        key: selectedKey,
        content: promptDraft,
        enabled: promptEnabled,
        restoreDefault,
      })
      await load()
      setSaved(restoreDefault ? '已恢复默认提示词' : '提示词已保存')
    } catch (error) {
      setMessage(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="ai-settings admin-prompts-page">
      <AdminPageHeader
        title="系统提示词"
        description="按用途维护平台共享的创作指令、图片分析模板与启用状态。"
      />
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
        <section id="prompts-panel" className="prompt-settings">
          <div className="prompt-settings-intro">
            <h2>内置提示词</h2>
            <p>
              按用途分组管理，所有账号共享此配置。停用一般模板后不再附加指令；停用反推模板后，对应分析模式不可用。
            </p>
          </div>
          <PromptTemplateBrowser
            templates={templates}
            selectedKey={selectedKey}
            busy={!!busy}
            onSelect={selectTemplate}
          />
          <div className="prompt-settings-editor">
            {activeTemplate && (
              <p className="prompt-editor-breadcrumb">{promptGroupLabel(activeTemplate)}</p>
            )}
            <div className="prompt-editor-heading">
              <div className="prompt-editor-title">
                <h2>{activeTemplate?.name}</h2>
                {promptDirty && <span className="prompt-dirty-status">未保存更改</span>}
              </div>
              <label className="settings-switch">
                <input
                  type="checkbox"
                  checked={promptEnabled}
                  disabled={!!busy}
                  onChange={(event) => setPromptEnabled(event.target.checked)}
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
            <textarea
              className="prompt-content-editor"
              aria-label="提示词模板内容"
              value={promptDraft}
              disabled={!!busy}
              maxLength={20000}
              rows={18}
              onChange={(event) => setPromptDraft(event.target.value)}
            />
            <details className="prompt-default">
              <summary>查看默认 Prompt</summary>
              <pre>{promptDefault}</pre>
            </details>
            <div className="settings-form-actions">
              <Button
                variant="outline"
                disabled={!!busy}
                onClick={() => {
                  if (window.confirm('恢复默认提示词？当前修改将被替换。')) savePrompt(true)
                }}
              >
                <RotateCcw data-icon="inline-start" />
                恢复默认
              </Button>
              <Button disabled={!!busy || !promptDraft.trim()} onClick={() => savePrompt()}>
                <Save data-icon="inline-start" />
                {busy ? '保存中' : '保存'}
              </Button>
            </div>
          </div>
        </section>
      ) : (
        !message && <p className="settings-empty">暂无系统提示词模板。</p>
      )}
    </main>
  )
}
