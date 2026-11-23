import Link from '@/routing/link'
import { useState } from 'react'
import { Activity, ArrowUpRight, ChartNoAxesColumnIncreasing } from 'lucide-react'
import type { AdminTrendDay, OperationalMonitoring } from '@/lib/admin'
import { creditScale, formatCredits } from '@/lib/credits'
import { monitoringDuration } from '@/hooks/use-admin-monitoring'
import styles from './overview.module.css'

const wholeNumber = new Intl.NumberFormat('zh-CN')
const compactNumber = new Intl.NumberFormat('zh-CN', { notation: 'compact', maximumFractionDigits: 1 })
const tickCount = 4
type Mode = 'tasks' | 'credits'

function tickStep(max: number) {
  const target = Math.max(1, max / tickCount)
  const magnitude = 10 ** Math.floor(Math.log10(target))
  const multiplier = [1, 2, 2.5, 5, 10].find((value) => value * magnitude >= target) ?? 10
  return Math.ceil(multiplier * magnitude)
}

function dateLabel(date: string) {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8, 10))}`
}

function chartValues(day: AdminTrendDay, mode: Mode, unit: string) {
  return mode === 'credits'
    ? [{ key: 'charged', label: `已结算${unit}`, value: day.charged }]
    : [
        { key: 'completed', label: '成功', value: day.completed },
        { key: 'failed', label: '失败', value: day.failed },
        { key: 'other', label: '其他状态', value: Math.max(day.submitted - day.completed - day.failed, 0) },
      ]
}

export function TaskTrendChart({ days, unit }: { days?: AdminTrendDay[]; unit: string }) {
  const [mode, setMode] = useState<Mode>('tasks')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [hoverDate, setHoverDate] = useState<string | null>(null)
  const selected = days?.find((day) => day.date === selectedDate) ?? days?.at(-1)
  const preview = days?.find((day) => day.date === hoverDate) ?? selected
  const formatValue = mode === 'credits' ? formatCredits : wholeNumber.format

  return (
    <section className={styles.panel} aria-labelledby="overview-trend-title">
      <header className={styles.chartHeading}>
        <div>
          <h2 id="overview-trend-title">近 7 天趋势</h2>
          <p>北京时间 · 含今天</p>
        </div>
        {selected && (
          <div className={styles.chartModes} role="group" aria-label="趋势指标">
            <button type="button" aria-pressed={mode === 'tasks'} onClick={() => setMode('tasks')}>
              生成任务
            </button>
            <button type="button" aria-pressed={mode === 'credits'} onClick={() => setMode('credits')}>
              {unit}消耗
            </button>
          </div>
        )}
      </header>

      {days?.length && selected && preview ? (
        <>
          <div className={styles.chartReadout}>
            <div className={styles.chartTotal}>
              <time dateTime={preview.date}>{dateLabel(preview.date)}{preview.date === days.at(-1)?.date && ' · 今日'}</time>
              <span>
                <strong>{formatValue(mode === 'tasks' ? preview.submitted : preview.charged)}</strong>
                <small>{mode === 'tasks' ? '项提交' : unit}</small>
              </span>
            </div>
            <ul className={styles.chartLegend} aria-label="所选日期数据">
              {chartValues(preview, mode, unit).map((item) => (
                <li key={item.key}>
                  <i data-series={item.key} aria-hidden="true" />
                  <span>{item.label}</span>
                  <strong>{formatValue(item.value)}</strong>
                </li>
              ))}
            </ul>
          </div>
          <DailyBars
            days={days}
            mode={mode}
            unit={unit}
            selected={selected.date}
            preview={preview.date}
            onHover={setHoverDate}
            onSelect={setSelectedDate}
          />
          <p className={styles.chartNote}>
            {mode === 'tasks'
              ? '按提交日期统计，柱内颜色表示任务当前状态。'
              : '按结算日期统计站内消耗。'}
          </p>
        </>
      ) : (
        <div className={styles.chartEmpty} role="status">
          <ChartNoAxesColumnIncreasing size={23} aria-hidden="true" />
          <p>暂无法读取趋势数据</p>
        </div>
      )}
    </section>
  )
}

function DailyBars({
  days,
  mode,
  unit,
  selected,
  preview,
  onHover,
  onSelect,
}: {
  days: AdminTrendDay[]
  mode: Mode
  unit: string
  selected: string
  preview: string
  onHover: (date: string | null) => void
  onSelect: (date: string) => void
}) {
  const scale = tickStep(Math.max(...days.map((day) => mode === 'tasks' ? day.submitted : day.charged)))
  const maximum = tickCount * scale
  const ticks = Array.from({ length: tickCount + 1 }, (_, index) => (tickCount - index) * scale)

  return (
    <div className={styles.chartPlot}>
      <div className={styles.chartAxis} aria-hidden="true">
        {ticks.map((tick, index) => {
          const value = mode === 'credits' ? tick / creditScale : tick
          return (
            <span key={tick} style={{ top: `${index * 100 / tickCount}%` }}>
              {mode === 'credits' && value < 1000 ? formatCredits(tick) : compactNumber.format(value)}
            </span>
          )
        })}
      </div>
      <div className={styles.chartArea}>
        <div className={styles.chartGridlines} aria-hidden="true">
          {ticks.map((tick, index) => <span key={tick} style={{ top: `${index * 100 / tickCount}%` }} />)}
        </div>
        <div className={styles.chartDays} role="group" aria-label="选择日期" onPointerLeave={() => onHover(null)}>
          {days.map((day) => {
            const values = chartValues(day, mode, unit)
            const label = mode === 'tasks'
              ? `${day.date}，提交 ${day.submitted} 项，${values.map((item) => `${item.label} ${item.value} 项`).join('，')}`
              : `${day.date}，消耗 ${formatCredits(day.charged)} ${unit}`
            return (
              <button
                key={day.date}
                type="button"
                className={styles.chartDay}
                aria-label={label}
                aria-pressed={selected === day.date}
                data-preview={preview === day.date}
                onPointerEnter={(event) => {
                  if (event.pointerType === 'mouse') onHover(day.date)
                }}
                onFocus={() => onHover(day.date)}
                onBlur={() => onHover(null)}
                onClick={() => onSelect(day.date)}
              >
                <span className={styles.chartBar} aria-hidden="true">
                  {values.filter((item) => item.value > 0).map((item) => (
                    <span key={item.key} data-series={item.key} style={{ height: `${item.value / maximum * 100}%` }} />
                  ))}
                </span>
                <span className={styles.chartDayLabel}>{dateLabel(day.date)}</span>
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function QueueSnapshot({ data, error }: { data: OperationalMonitoring | null; error: string }) {
  const queue = data ? [
    { name: '生图', count: data.generationQueued, overdue: data.generationOverdue, wait: data.oldestGenerationWaitSeconds },
    { name: '图片反推', count: data.reverseQueued, overdue: data.reverseOverdue, wait: data.oldestReverseWaitSeconds },
  ] : []
  const count = queue.reduce((sum, row) => sum + row.count, 0)
  const overdue = queue.reduce((sum, row) => sum + row.overdue, 0)
  const maximum = Math.max(1, ...queue.map((row) => row.count))

  return (
    <section className={`${styles.panel} ${styles.queuePanel}`} aria-labelledby="overview-queue-title">
      <header className={styles.chartHeading}>
        <div>
          <h2 id="overview-queue-title">实时队列</h2>
          <p>{error ? (data ? '上次成功快照' : '队列状态待确认') : '每 30 秒更新'}</p>
        </div>
        <span className={styles.queueIcon}><Activity size={18} aria-hidden="true" /></span>
      </header>
      {data ? (
        <>
          <div className={styles.queueTotal}>
            <span><strong>{wholeNumber.format(count)}</strong> 项排队中</span>
            {overdue > 0 && <span className={styles.queueWarning}>{wholeNumber.format(overdue)} 项超时</span>}
          </div>
          <dl className={styles.queueRows}>
            {queue.map((row) => (
              <div key={row.name} className={styles.queueRow}>
                <dt>{row.name}</dt>
                <dd>
                  <strong>{wholeNumber.format(row.count)} 项</strong>
                  <div className={styles.queueTrack} aria-hidden="true">
                    <span data-series="queued" style={{ width: `${Math.max(row.count - row.overdue, 0) / maximum * 100}%` }} />
                    <span data-series="failed" style={{ width: `${row.overdue / maximum * 100}%` }} />
                  </div>
                  <small>超时 {wholeNumber.format(row.overdue)} 项{row.count > 0 && ` · 最久 ${monitoringDuration(row.wait)}`}</small>
                </dd>
              </div>
            ))}
          </dl>
        </>
      ) : <p className={styles.queuePending} role="status">{error ? '暂无法读取队列' : '正在读取队列…'}</p>}
      <Link className={styles.queueLink} href="/admin/monitoring">
        查看运行监控 <ArrowUpRight size={14} aria-hidden="true" />
      </Link>
    </section>
  )
}
