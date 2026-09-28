'use client'

import { LockKeyhole, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense, useState, type FormEvent } from 'react'

import { RegMark } from '@/components/brand'
import { apiBaseUrl } from '@/lib/api'

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
      if (!response.ok || !data.accessToken) throw new Error(data.message ?? '登录失败')
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
      <form className="gate-card" onSubmit={submit}>
        <span className="reg reg-tl" aria-hidden="true" />
        <span className="reg reg-tr" aria-hidden="true" />
        <span className="reg reg-bl" aria-hidden="true" />
        <span className="reg reg-br" aria-hidden="true" />

        <div className="gate-head">
          <RegMark />
          <h1>{register ? '建立你的账号' : '回到工作台'}</h1>
          <p>{register ? '注册后即可开始生成与归档。' : '登录后继续之前未完成的工单。'}</p>
        </div>

        <div className="gate-form">
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

          {notice && (
            <p className="notice notice-error" role="alert">
              {notice}
            </p>
          )}

          <button className="btn btn-signal btn-lg btn-block" type="submit">
            {register ? '创建并进入' : '登录'}
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
              {register ? '已有账号？直接登录' : '还没有账号？现在创建'}
            </button>
            <Link className="gate-switch" href="/">
              先看看工作台
            </Link>
          </div>
        </div>
      </form>
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
