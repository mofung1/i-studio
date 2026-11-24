'use client'

import { useId, useRef, type FormEvent, type RefObject } from 'react'
import { ChevronDown, Save, X } from 'lucide-react'
import { DialogActions } from '@/components/dialog-actions'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/admin/ui/dialog'
import { Alert, AlertDescription } from '@/components/admin/ui/alert'
import { Button } from '@/components/admin/ui/button'
import { Field, FieldLabel, FieldLegend, FieldSet } from '@/components/admin/ui/field'
import { Input } from '@/components/admin/ui/input'
import { Checkbox } from '@/components/admin/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/select'
import {
  imageEndpointPresets,
  imageProtocolHelp,
  imageProtocolLabels,
  type AIProtocol,
  type EndpointInput,
} from '@/lib/ai-settings'
import styles from './ai-endpoint-editor.module.css'

export type EndpointEditing = { id?: string; input: EndpointInput }

export function AiEndpointEditor({
  editing,
  busy,
  error,
  onChange,
  onClose,
  onSubmit,
  returnFocus,
}: {
  editing: EndpointEditing | null
  busy: boolean
  error: string
  onChange: (patch: Partial<EndpointInput>) => void
  onClose: () => void
  onSubmit: (event: FormEvent) => void
  returnFocus: RefObject<HTMLElement | null>
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const advancedRef = useRef<HTMLDetailsElement>(null)
  const prefix = useId()
  const input = editing?.input
  const isImage = input?.purpose === 'image'

  return (
    <Dialog
      open={!!editing}
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <DialogContent
        ref={dialogRef}
        className={styles.dialog}
        showCloseButton={false}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          returnFocus.current?.focus()
        }}
      >
        {editing && input && (
          <form
            key={editing.id ?? input.purpose}
            className={styles.form}
            onSubmit={(event) => {
              if (busy) event.preventDefault()
              else onSubmit(event)
            }}
            onInvalidCapture={(event) => {
              if (advancedRef.current?.contains(event.target as Node)) {
                advancedRef.current.open = true
              }
            }}
          >
            <div className={styles.header}>
              <DialogHeader>
                <DialogTitle>
                  {editing.id ? '编辑' : '添加'}
                  {isImage ? '生图渠道' : '提示词服务'}
                </DialogTitle>
                <DialogDescription>
                  {isImage
                    ? '验证连接后，在「模型与定价」绑定并上架模型。'
                    : '为 AI 帮写和图片识别配置上游服务。'}
                </DialogDescription>
              </DialogHeader>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="关闭编辑"
                disabled={busy}
                onClick={onClose}
              >
                <X aria-hidden="true" />
              </Button>
            </div>

            {error && (
              <div className={styles.error}>
                <Alert variant="destructive" role="alert">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              </div>
            )}

            <div className={styles.body}>
              {!editing.id && isImage && (
                <FieldSet className={styles.presets} disabled={busy}>
                  <FieldLegend>选择服务类型，快速填写</FieldLegend>
                  <div>
                    {imageEndpointPresets.map((preset) => (
                      <Button
                        key={preset.id}
                        type="button"
                        variant="outline"
                        onClick={() =>
                          onChange({
                            name: preset.name,
                            protocol: preset.protocol,
                            baseUrl: preset.baseUrl,
                            apiKey: '',
                            model: '',
                          })
                        }
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </div>
                  <p>切换类型会清空未保存的密钥和测试模型，请重新填写。</p>
                </FieldSet>
              )}

              <FieldSet className={styles.section} disabled={busy}>
                <FieldLegend className={styles.legend}>连接服务</FieldLegend>
                <div className={styles.connectionGrid}>
                  <Field className={styles.field}>
                    <FieldLabel htmlFor={`${prefix}-name`}>
                      <span>名称</span>
                    </FieldLabel>
                    <Input
                      id={`${prefix}-name`}
                      autoFocus
                      required
                      maxLength={120}
                      value={input.name}
                      placeholder={isImage ? '例如：官方生图渠道' : '例如：提示词助手'}
                      onChange={(event) => onChange({ name: event.target.value })}
                    />
                    <small>仅用于后台区分服务，不是模型 ID。</small>
                  </Field>
                  <Field className={styles.field}>
                    <FieldLabel htmlFor={`${prefix}-protocol`}>
                      <span>接口协议</span>
                    </FieldLabel>
                    <Select
                      value={input.protocol}
                      disabled={busy}
                      onValueChange={(value) => onChange({ protocol: value as AIProtocol })}
                    >
                      <SelectTrigger id={`${prefix}-protocol`} size="lg" aria-label="接口协议">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent
                        portalContainer={dialogRef.current}
                        className={styles.selectContent}
                      >
                        <SelectGroup>
                          {(isImage
                            ? ['openai_images', 'openai_chat', 'gemini_native']
                            : ['openai_chat']
                          ).map((protocol) => (
                            <SelectItem key={protocol} value={protocol}>
                              {isImage
                                ? imageProtocolLabels[protocol as AIProtocol]
                                : 'OpenAI 兼容对话接口'}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <small>
                      {isImage
                        ? imageProtocolHelp[input.protocol].description
                        : '供应商需兼容 Chat Completions；图片识别还需模型支持图片输入。'}
                    </small>
                  </Field>
                </div>
                <Field className={styles.field}>
                  <FieldLabel htmlFor={`${prefix}-url`}>
                    <span>API 地址（Base URL）</span>
                  </FieldLabel>
                  <Input
                    id={`${prefix}-url`}
                    type="url"
                    required
                    spellCheck={false}
                    value={input.baseUrl}
                    placeholder={
                      isImage
                        ? imageProtocolHelp[input.protocol].baseUrl
                        : 'https://api.example.com/v1'
                    }
                    onChange={(event) => onChange({ baseUrl: event.target.value })}
                  />
                  <small>
                    填写接口根地址，保留 /v1 或 /v1beta；无需追加 /images/generations 或
                    /chat/completions。
                  </small>
                </Field>
                <Field className={styles.field}>
                  <FieldLabel htmlFor={`${prefix}-key`}>
                    <span>API Key</span>
                  </FieldLabel>
                  <Input
                    id={`${prefix}-key`}
                    type="text"
                    autoComplete="new-password"
                    spellCheck={false}
                    required={!editing.id}
                    value={input.apiKey ?? ''}
                    placeholder={editing.id ? '留空保留现有密钥' : '填写供应商提供的 API Key'}
                    onChange={(event) => onChange({ apiKey: event.target.value })}
                  />
                  <small>
                    {editing.id
                      ? '修改后保存即可替换；留空保留现有密钥。'
                      : '密钥加密保存，仅管理员可查看，不会展示给前台用户。'}
                  </small>
                </Field>
              </FieldSet>

              <FieldSet className={styles.section} disabled={busy}>
                <FieldLegend className={styles.legend}>
                  {isImage ? '启用渠道' : '选择模型与用途'}
                </FieldLegend>
                {!isImage && (
                  <Field className={styles.field}>
                    <FieldLabel htmlFor={`${prefix}-model`}>
                      <span>上游模型 ID</span>
                    </FieldLabel>
                    <Input
                      id={`${prefix}-model`}
                      required
                      maxLength={200}
                      value={input.model}
                      spellCheck={false}
                      placeholder="填写供应商提供的模型 ID"
                      onChange={(event) => onChange({ model: event.target.value })}
                    />
                    <small>实际调用的模型名称，必须与供应商的模型 ID 一致。</small>
                  </Field>
                )}
                <div className={styles.options}>
                  <label className={styles.option}>
                    <Checkbox
                      className="mt-0.5"
                      checked={input.enabled}
                      onCheckedChange={(checked) =>
                        onChange({
                          enabled: checked === true,
                          isDefault: checked === true && input.isDefault,
                        })
                      }
                    />
                    <span>
                      <strong>{isImage ? '启用渠道' : '启用服务'}</strong>
                      <small>
                        {isImage
                          ? '启用后可供前台模型绑定；仅保存渠道不会自动上架模型。'
                          : '停用后，此服务不再接收新请求。'}
                      </small>
                    </span>
                  </label>
                  {!isImage && (
                    <>
                      <label className={styles.option}>
                        <Checkbox
                          className="mt-0.5"
                          checked={input.isDefault}
                          disabled={busy || !input.enabled}
                          onCheckedChange={(checked) => onChange({ isDefault: checked === true })}
                        />
                        <span>
                          <strong>设为默认提示词服务</strong>
                          <small>AI 帮写和服装规划使用默认服务；图片反推可单独选择服务。</small>
                          <small>
                            首个启用服务会自动成为默认；有启用服务时，系统会保留一个默认服务。
                          </small>
                        </span>
                      </label>
                      <label className={styles.option}>
                        <Checkbox
                          className="mt-0.5"
                          checked={!!input.capabilities.vision}
                          onCheckedChange={(checked) =>
                            onChange({
                              capabilities: { ...input.capabilities, vision: checked === true },
                            })
                          }
                        />
                        <span>
                          <strong>支持图片识别</strong>
                          <small>
                            确认模型支持图片输入后再勾选。图片反推需要此能力，勾选本身不会改变模型能力。
                          </small>
                        </span>
                      </label>
                    </>
                  )}
                </div>
              </FieldSet>

              <details ref={advancedRef} className={styles.advanced}>
                <summary>
                  <span>
                    <strong>{isImage ? '测试与高级设置' : '高级设置'}</strong>
                    <small>
                      {isImage ? '测试模型、请求超时，可稍后配置' : '请求超时，通常保留默认值即可'}
                    </small>
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </summary>
                <FieldSet className={styles.advancedFields} disabled={busy}>
                  <FieldLegend className="sr-only">请求设置</FieldLegend>
                  {isImage && (
                    <Field className={styles.field}>
                      <FieldLabel htmlFor={`${prefix}-test-model`}>
                        <span>测试模型 ID（可选）</span>
                      </FieldLabel>
                      <Input
                        id={`${prefix}-test-model`}
                        maxLength={200}
                        spellCheck={false}
                        value={input.model}
                        placeholder="需要在渠道页测试生图时填写"
                        onChange={(event) => onChange({ model: event.target.value })}
                      />
                      <small>
                        仅用于此页的生图测试。正式生成使用「模型与定价」中绑定的上游模型 ID。
                      </small>
                    </Field>
                  )}
                  <Field className={styles.field}>
                    <FieldLabel htmlFor={`${prefix}-timeout`}>
                      <span>请求超时（秒）</span>
                    </FieldLabel>
                    <Input
                      id={`${prefix}-timeout`}
                      className={styles.timeout}
                      type="number"
                      min={1}
                      max={600}
                      step={1}
                      required
                      value={input.timeoutSeconds}
                      onChange={(event) => onChange({ timeoutSeconds: Number(event.target.value) })}
                    />
                    <small>
                      等待上游响应的最长时间，范围 1–600 秒。
                      {!isImage && '图片反推使用其单独设置的分析超时。'}
                    </small>
                  </Field>
                </FieldSet>
              </details>
            </div>

            <footer className={styles.footer}>
              <DialogActions className={styles.actions}>
                <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                  取消
                </Button>
                <Button type="submit" disabled={busy}>
                  <Save aria-hidden="true" />
                  {busy ? '保存中…' : isImage ? '保存渠道' : '保存服务'}
                </Button>
              </DialogActions>
            </footer>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
