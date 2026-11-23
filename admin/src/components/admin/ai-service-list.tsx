'use client'

import {
  ChevronDown,
  Images,
  LoaderCircle,
  Pencil,
  Trash2,
  WandSparkles,
  Zap,
} from 'lucide-react'
import { Button } from './ui/button'
import { AdminStatusBadge } from './status-badge'
import {
  imageProtocolLabels,
  type AIConnectionTest,
  type AIEndpoint,
  type EndpointPurpose,
} from '@/lib/ai-settings'
import styles from './ai-services.module.css'

export type AiServiceTest = { id: string; mode: 'connection' | 'generate' }

export function AiServiceList({
  purpose,
  endpoints,
  canManage,
  busy,
  testing,
  tests,
  onEdit,
  onTest,
  onToggle,
  onDefault,
  onDelete,
}: {
  purpose: EndpointPurpose
  endpoints: AIEndpoint[]
  canManage: boolean
  busy: boolean
  testing?: AiServiceTest
  tests: Record<string, AIConnectionTest & { mode: 'connection' | 'generate' }>
  onEdit: (endpoint: AIEndpoint) => void
  onTest: (endpoint: AIEndpoint, mode?: 'connection' | 'generate') => void
  onToggle: (endpoint: AIEndpoint) => void
  onDefault: (endpoint: AIEndpoint) => void
  onDelete: (endpoint: AIEndpoint) => void
}) {
  const isImage = purpose === 'image'
  return (
    <section className={styles.services} aria-label={isImage ? '生图渠道列表' : '提示词服务列表'}>
      <h2 className="sr-only">{isImage ? '生图渠道' : '提示词与识图服务'}</h2>
      {!endpoints.length ? (
        <div className={styles.empty}>
          {isImage ? (
            <Images size={28} aria-hidden="true" />
          ) : (
            <WandSparkles size={28} aria-hidden="true" />
          )}
          <h3>{isImage ? '暂无生图渠道' : '暂无提示词服务'}</h3>
          <p>
            {isImage
              ? '准备供应商的接口根地址和 API Key，保存后再配置前台模型。'
              : '准备接口地址、API Key 和上游模型 ID。需要识图时，选择支持图片输入的模型。'}
          </p>
          {!canManage && <p>当前账号仅可查看，请联系管理员添加服务。</p>}
        </div>
      ) : (
        <div className={styles.serviceList}>
          {endpoints.map((endpoint) => {
            const result = tests[endpoint.id]
            const activeTest = testing?.id === endpoint.id ? testing.mode : null
            return (
              <article key={endpoint.id} className={styles.service} aria-label={endpoint.name}>
                <div className={styles.serviceMain}>
                  <div className={styles.identity}>
                    <div className={styles.serviceTitle}>
                      <h3>{endpoint.name}</h3>
                      {!isImage && endpoint.isDefault && (
                        <AdminStatusBadge tone="success">默认服务</AdminStatusBadge>
                      )}
                      {!isImage && (
                        <AdminStatusBadge
                          tone={endpoint.capabilities.vision ? 'neutral' : 'warning'}
                        >
                          {endpoint.capabilities.vision ? '支持识图' : '仅文本'}
                        </AdminStatusBadge>
                      )}
                      <AdminStatusBadge tone={endpoint.enabled ? 'success' : 'neutral'}>
                        {endpoint.enabled ? '已启用' : '已停用'}
                      </AdminStatusBadge>
                    </div>
                    <p className={styles.serviceMeta}>
                      {isImage ? imageProtocolLabels[endpoint.protocol] : 'OpenAI 兼容对话接口'}
                      {!isImage && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <strong>{endpoint.model}</strong>
                        </>
                      )}
                    </p>
                  </div>
                  {canManage && (
                    <div className={styles.primaryActions}>
                      {!isImage && endpoint.enabled && !endpoint.isDefault && (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => onDefault(endpoint)}
                        >
                          设为默认
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`编辑 ${endpoint.name}`}
                        disabled={busy}
                        onClick={() => onEdit(endpoint)}
                      >
                        <Pencil size={15} />
                        编辑
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`测试 ${endpoint.name} 连接`}
                        title={
                          endpoint.enabled
                            ? '查询模型列表，验证地址与密钥，不调用生图或识图'
                            : '请先启用服务后再测试'
                        }
                        disabled={busy || !endpoint.enabled}
                        onClick={() => onTest(endpoint)}
                      >
                        {activeTest === 'connection' ? (
                          <LoaderCircle className="settings-spinner" size={15} aria-hidden="true" />
                        ) : (
                          <Zap size={15} />
                        )}
                        测试连接
                      </Button>
                    </div>
                  )}
                </div>
                {activeTest && (
                  <p className={styles.testing} role="status">
                    {activeTest === 'generate' ? '正在进行生图测试…' : '正在测试连接…'}
                  </p>
                )}
                {!activeTest && result && (
                  <div
                    className={styles.testResult}
                    data-success={result.success}
                    data-tone={result.success ? 'success' : 'danger'}
                    role="status"
                  >
                    <strong>
                      {result.mode === 'generate' ? '生图测试' : '连接测试'}
                      {result.success ? '通过' : '失败'}
                    </strong>
                    {result.responseTimeMs > 0 && <span>{result.responseTimeMs} ms</span>}
                    {(!result.success || result.mode === 'generate') && <span>{result.message}</span>}
                    {result.mode === 'connection' && result.success && (
                      <small>仅确认模型列表接口可访问，尚未验证实际生成或识图能力。</small>
                    )}
                  </div>
                )}
                {canManage && (
                  <details className={styles.details}>
                    <summary>
                      连接详情与测试
                      <ChevronDown size={15} aria-hidden="true" />
                    </summary>
                    <div className={styles.detailsBody}>
                      <dl className={styles.connectionFacts}>
                        <div className={styles.address}>
                          <dt>API 地址</dt>
                          <dd>
                            <code>{endpoint.baseUrl}</code>
                          </dd>
                        </div>
                        <div>
                          <dt>API Key</dt>
                          <dd>
                            {endpoint.apiKeyConfigured
                              ? '已配置，可在编辑中查看或更换'
                              : '尚未配置，请编辑补充'}
                          </dd>
                        </div>
                        <div>
                          <dt>请求超时</dt>
                          <dd>{endpoint.timeoutSeconds} 秒</dd>
                        </div>
                        {isImage && (
                          <div>
                            <dt>测试模型 ID</dt>
                            <dd>{endpoint.model || '未填写（不影响模型绑定）'}</dd>
                          </div>
                        )}
                      </dl>
                      <p className={styles.testHelp}>
                        测试连接只查询模型列表，验证地址与密钥，不产生图片。
                        {!endpoint.enabled && '此服务已停用，启用后才能测试。'}
                      </p>
                      {isImage && (
                        <div className={styles.generationTest}>
                          <div>
                            <strong>真实生图测试</strong>
                            <p>
                              {endpoint.model
                                ? '使用上方测试模型生成 1 张图片，可能产生供应商费用。'
                                : '如需在此测试，请先编辑渠道，在“测试与高级设置”填写测试模型 ID。'}
                              正式绑定的模型与参数请在「模型与定价」中测试。
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            disabled={busy || !endpoint.enabled || !endpoint.model.trim()}
                            onClick={() => onTest(endpoint, 'generate')}
                          >
                            测试生图（可能收费）
                          </Button>
                        </div>
                      )}
                      <div className={styles.management}>
                        <div>
                          <label className={styles.enableSwitch}>
                            <input
                              type="checkbox"
                              checked={endpoint.enabled}
                              disabled={busy}
                              onChange={() => onToggle(endpoint)}
                              aria-label={`启用 ${endpoint.name}`}
                            />
                            启用此服务
                          </label>
                          <p>
                            {isImage
                              ? '停用后，以此为主渠道的前台模型将不可用。'
                              : '停用默认服务后，系统会选择其他已启用服务；固定使用此服务的图片反推将不可用。'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className={styles.deleteAction}
                          aria-label={`删除 ${endpoint.name}`}
                          disabled={busy}
                          onClick={() => onDelete(endpoint)}
                        >
                          <Trash2 size={15} />
                          删除服务
                        </Button>
                      </div>
                    </div>
                  </details>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
