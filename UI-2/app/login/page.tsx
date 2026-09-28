'use client'

import { ArrowRight, LockKeyhole, Sparkles, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'

import { BrandTile } from '@/components/brand'
import { apiBaseUrl } from '@/lib/api'

const artShots = ['/images/showcase-main.jpg', '/images/showcase-lifestyle.jpg', '/images/showcase-editorial.jpg', '/images/showcase-campaign.jpg']

function Gate() {
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/${register ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = (await response.json()) as { accessToken?: string; message?: string }
      if (!response.ok || !data.accessToken) throw new Error(data.message ?? (register ? '注册失败' : '登录失败'))
      window.localStorage.setItem('istudio-access-token', data.accessToken)
      const requested = searchParams.get('next')
      const next = requested?.startsWith('/') && !requested.startsWith('//') ? requested : '/'
      window.location.href = next
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '请求失败，请稍后重试')
    }
  }

  return (
    <main className="gate">
      <div className="gate-shell">
        <form className="gate-form" onSubmit={submit}>
          <div className="gate-head">
            <BrandTile large />
            <h1>{register ? '创建你的账号' : '欢迎回到 iStudio'}</h1>
            <p>{register ? '注册后即可开始生成与归档商品图。' : '登录后继续之前没做完的工单。'}</p>
          </div>

          <div className="seg" role="group" aria-label="登录或注册">
            <button type="button" aria-pressed={!register} onClick={() => { setRegister(false); setNotice('') }}>
              登录
            </button>
            <button type="button" aria-pressed={register} onClick={() => { setRegister(true); setNotice('') }}>
              注册
            </button>
          </div>

          <div className="gate-fields">
            <label className="gate-field">
              <span>用户名</span>
              <div>
                <UserRound size={16} aria-hidden="true" />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="3-32 位字母、数字或下划线"
                  autoComplete="username"
                />
              </div>
            </label>
            <label className="gate-field">
              <span>密码</span>
              <div>
                <LockKeyhole size={16} aria-hidden="true" />
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="至少 8 位"
                  autoComplete={register ? 'new-password' : 'current-password'}
                />
              </div>
            </label>
          </div>

          {notice && (
            <p className="toast toast-error" role="alert">
              {notice}
            </p>
          )}

          <button className="btn btn-grad btn-lg btn-block" type="submit">
            <Sparkles size={16} aria-hidden="true" />
            {register ? '创建并进入' : '登录'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>

          <div className="gate-foot">
            <button
              className="gate-switch"
              type="button"
              onClick={() => {
                setRegister((value) => !value)
                setNotice('')
              }}
            >
              {register ? '已有账号？直接登录' : '还没有账号？免费注册'}
            </button>
            <Link className="gate-switch" href="/">
              先随便看看
            </Link>
          </div>

          <p className="gate-legal">继续即表示同意服务条款与隐私政策。账号仅用于保存你的生成记录与素材。</p>
        </form>

        {/* 右侧装饰面板：渐变底 + 作品拼贴 + 一条数据卡 */}
        <aside className="gate-art" aria-hidden="true">
          <span className="art-chip">
            <Sparkles size={13} />
            今日已生成 1,284 张
          </span>
          <p className="art-headline">把商品图<br />做成能卖的样子</p>
          <div className="art-collage">
            {artShots.map((src) => (
              <div className="art-shot" key={src}>
                <img src={src} alt="" />
              </div>
            ))}
          </div>
          <div className="art-stat">
            <span className="art-stat-ico">
              <Sparkles size={16} />
            </span>
            <span>
              <strong>主图 · 详情页 · 爆款复刻</strong>
              <span>一份原图，四种平台规格</span>
            </span>
          </div>
        </aside>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="gate" aria-busy="true" aria-label="登录页加载中" />}>
      <Gate />
    </Suspense>
  )
}
