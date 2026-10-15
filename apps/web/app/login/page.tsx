'use client'

import { ThemeToggle } from '@/components/theme-toggle'

import { ArrowLeft, LockKeyhole, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type FormEvent, Suspense, useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '@/lib/api'
import { safeReturnPath } from '@/lib/navigation'

function LoginForm() {
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  useEffect(() => { fetch(`${apiBaseUrl}/v1/operation-settings`).then(response => response.ok ? response.json() : Promise.reject()).then(data => setRegistrationEnabled(data.registrationEnabled === true)).catch(() => setRegistrationEnabled(false)) }, [])
  const [register, setRegister] = useState(false)
  const [notice, setNotice] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submittingRef = useRef(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current) return
    submittingRef.current = true
    setIsSubmitting(true)
    setNotice('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await response.json() as { accessToken?: string; message?: string }
      if (!response.ok || !data.accessToken) throw new Error(data.message ?? '登录失败')
      window.localStorage.setItem('istudio-access-token', data.accessToken)
      window.location.href = safeReturnPath(searchParams.get('next'))
    } catch (error) { setNotice(error instanceof Error ? error.message : '请求失败，请稍后重试') }
    finally { submittingRef.current = false; setIsSubmitting(false) }
  }

  return <main className="auth-page"><ThemeToggle />
    <form className="auth-card" onSubmit={submit} aria-busy={isSubmitting}>
      <Link href="/" className="auth-back"><ArrowLeft size={16} aria-hidden="true" />返回首页</Link>
      <div className="auth-mark"><UserRound size={20} aria-hidden="true" /></div>
      <h1>{register ? '创建账号' : '欢迎回来'}</h1>
      <p>{register ? '使用账号密码开始创作。' : '登录后继续你的创作。'}</p>
      <label>用户名<div className="auth-input"><UserRound size={17} aria-hidden="true" />
        <input name="username" autoComplete="username" spellCheck={false} required minLength={3} maxLength={32} pattern="[A-Za-z0-9_]{3,32}" disabled={isSubmitting} value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3–32 位字母、数字或下划线" />
      </div></label>
      <label>密码<div className="auth-input"><LockKeyhole size={17} aria-hidden="true" />
        <input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={8} maxLength={128} disabled={isSubmitting} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="8–128 位" />
      </div></label>
      {notice && <p className="auth-notice" role="alert">{notice}</p>}
      <button className="auth-submit" type="submit" disabled={isSubmitting}>{isSubmitting ? '提交中…' : register ? '创建并登录' : '登录'}</button>
      {registrationEnabled ? <button className="auth-switch" type="button" disabled={isSubmitting} onClick={() => { setRegister(!register); setNotice('') }}>{register ? '已有账号？登录' : '没有账号？创建账号'}</button>: <p className="auth-registration-closed">暂未开放注册</p>}
    </form>
  </main>
}

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-page" aria-label="登录页加载中" />}><LoginForm /></Suspense>
}
