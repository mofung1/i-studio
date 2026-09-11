'use client'

import { ArrowLeft, LockKeyhole, UserRound } from 'lucide-react'
import Link from 'next/link'
import { FormEvent, useState } from 'react'

export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [register, setRegister] = useState(false)
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setNotice('')
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000'}/v1/auth/${register ? 'register' : 'login'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password }) })
      const data = await response.json() as { accessToken?: string; message?: string }
      if (!response.ok || !data.accessToken) throw new Error(data.message ?? '登录失败')
      window.localStorage.setItem('istudio-access-token', data.accessToken)
      window.location.href = '/workbench?mode=general'
    } catch (error) { setNotice(error instanceof Error ? error.message : '请求失败，请稍后重试') }
  }

  return <main className="auth-page"><form className="auth-card" onSubmit={submit}><Link href="/" className="auth-back"><ArrowLeft size={16} />返回首页</Link><div className="auth-mark"><UserRound size={20} /></div><h1>{register ? '创建账号' : '欢迎回来'}</h1><p>{register ? '使用账号密码开始创作。' : '登录后继续你的创作。'}</p><label>用户名<div className="auth-input"><UserRound size={17} /><input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="3-32 位字母、数字或下划线" /></div></label><label>密码<div className="auth-input"><LockKeyhole size={17} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 8 位" /></div></label>{notice && <p className="auth-notice">{notice}</p>}<button className="auth-submit" type="submit">{register ? '创建并登录' : '登录'}</button><button className="auth-switch" type="button" onClick={() => { setRegister(!register); setNotice('') }}>{register ? '已有账号？登录' : '没有账号？创建账号'}</button></form></main>
}
