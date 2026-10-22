'use client'

import { ThemeToggle } from '@/components/theme-toggle'

import { ArrowLeft, LockKeyhole, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { apiBaseUrl } from '@/lib/api'
import { safeReturnPath } from '@/lib/navigation'

export function LoginForm({ admin = false }: { admin?: boolean }) {
  const searchParams = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [registrationEnabled, setRegistrationEnabled] = useState(false)
  const [inviteRequired, setInviteRequired] = useState(false)
  const [inviteCode, setInviteCode] = useState('')
  useEffect(() => {
    if (admin) return
    fetch(`${apiBaseUrl}/v1/operation-settings`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => {
        setRegistrationEnabled(data.registrationEnabled === true)
        setInviteRequired(data.registrationInviteRequired === true)
      })
      .catch(() => setRegistrationEnabled(false))
  }, [admin])
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
      const response = await fetch(
        `${apiBaseUrl}/v1/${admin ? 'admin/auth/login' : `auth/${register ? 'register' : 'login'}`}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ username, password, ...(register ? { inviteCode } : {}) }),
        },
      )
      const data = (await response.json()) as { accessToken?: string; message?: string }
      if (!response.ok || !data.accessToken) throw new Error(data.message ?? '登录失败')
      window.localStorage.setItem(
        admin ? 'istudio-admin-token' : 'istudio-access-token',
        data.accessToken,
      )
      const next = safeReturnPath(searchParams.get('next'))
      window.location.href = admin
        ? (next === '/admin' || next.startsWith('/admin/')) && next !== '/admin/login'
          ? next
          : '/admin'
        : next.startsWith('/admin')
          ? '/'
          : next
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '请求失败，请稍后重试')
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <ThemeToggle />
      <form className="auth-card" onSubmit={submit} aria-busy={isSubmitting}>
        <Link href="/" className="auth-back">
          <ArrowLeft size={16} aria-hidden="true" />
          返回首页
        </Link>
        <div className="auth-mark">
          <UserRound size={20} aria-hidden="true" />
        </div>
        <h1>{admin ? '运营后台登录' : register ? '创建账号' : '欢迎回来'}</h1>
        <p>
          {admin
            ? '使用独立管理员账号登录。'
            : register
              ? '使用账号密码开始创作。'
              : '登录后继续你的创作。'}
        </p>
        <label>
          用户名
          <div className="auth-input">
            <UserRound size={17} aria-hidden="true" />
            <input
              name={admin ? 'admin-username' : 'username'}
              autoComplete="username"
              spellCheck={false}
              required
              minLength={3}
              maxLength={32}
              pattern="[A-Za-z0-9_]{3,32}"
              disabled={isSubmitting}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="3–32 位字母、数字或下划线"
            />
          </div>
        </label>
        <label>
          密码
          <div className="auth-input">
            <LockKeyhole size={17} aria-hidden="true" />
            <input
              name={admin ? 'admin-password' : 'password'}
              type="password"
              autoComplete={register ? 'new-password' : 'current-password'}
              required
              minLength={8}
              maxLength={128}
              disabled={isSubmitting}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8–128 位"
            />
          </div>
        </label>
        {register && inviteRequired && (
          <label>
            邀请码
            <div className="auth-input">
              <UserRound size={17} aria-hidden="true" />
              <input
                name="inviteCode"
                required
                autoComplete="off"
                maxLength={64}
                disabled={isSubmitting}
                value={inviteCode}
                onChange={(event) => setInviteCode(event.target.value)}
                placeholder="请输入管理员提供的邀请码"
              />
            </div>
          </label>
        )}
        {notice && (
          <p className="auth-notice" role="alert">
            {notice}
          </p>
        )}
        <button className="auth-submit" type="submit" disabled={isSubmitting}>
          {isSubmitting ? '提交中…' : register ? '创建并登录' : '登录'}
        </button>
        {!admin &&
          (registrationEnabled ? (
            <button
              className="auth-switch"
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setRegister(!register)
                setNotice('')
              }}
            >
              {register ? '已有账号？登录' : '没有账号？创建账号'}
            </button>
          ) : (
            <p className="auth-registration-closed">暂未开放注册</p>
          ))}
      </form>
    </main>
  )
}
