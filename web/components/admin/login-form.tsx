'use client'
import { useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'next/navigation'
import { ArrowLeft, LoaderCircle, ShieldCheck } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { apiBaseUrl, readApiError } from '@/lib/api'
import { safeReturnPath } from '@/lib/navigation'
import { Button } from './ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './ui/card'
import { Field, FieldGroup, FieldLabel } from './ui/field'
import { Input } from './ui/input'
import { Alert, AlertDescription } from './ui/alert'

export function LoginForm() {
  const query = useSearchParams()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (pending.current) return
    pending.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`${apiBaseUrl}/v1/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) throw new Error(await readApiError(response, '登录失败'))
      const data = (await response.json()) as { accessToken?: string }
      if (!data.accessToken) throw new Error('登录响应不完整')
      window.localStorage.setItem('istudio-admin-token', data.accessToken)
      const next = safeReturnPath(query.get('next'))
      window.location.href =
        (next === '/admin' || next.startsWith('/admin/')) && !next.startsWith('/admin/login')
          ? next
          : '/admin'
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法连接后台服务')
    } finally {
      pending.current = false
      setBusy(false)
    }
  }
  return (
    <main className="admin-auth min-h-dvh">
      <header className="flex items-center justify-between p-6">
        <Button variant="ghost" asChild>
          <a href="/">
            <ArrowLeft data-icon="inline-start" />
            返回 iStudio
          </a>
        </Button>
        <ThemeToggle />
      </header>
      <div className="admin-login-content">
        <div className="mb-6 flex items-center justify-center gap-2 text-lg font-semibold">
          <ShieldCheck />
          iStudio Admin
        </div>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-xl">登录管理后台</CardTitle>
            <CardDescription>使用独立管理员账号管理 AI 服务、模型与平台运营。</CardDescription>
          </CardHeader>
          <CardContent>
            <form id="admin-login" onSubmit={submit} aria-busy={busy}>
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="username">用户名</FieldLabel>
                  <Input
                    id="username"
                    name="admin-username"
                    autoComplete="username"
                    required
                    minLength={3}
                    maxLength={32}
                    pattern="[A-Za-z0-9_]{3,32}"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={busy}
                    placeholder="管理员用户名"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="password">密码</FieldLabel>
                  <Input
                    id="password"
                    name="admin-password"
                    type="password"
                    autoComplete="current-password"
                    required
                    minLength={6}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    placeholder="6–128 位"
                  />
                </Field>
                {error && (
                  <Alert variant="destructive">
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
              </FieldGroup>
            </form>
          </CardContent>
          <CardFooter>
            <Button className="w-full" type="submit" form="admin-login" disabled={busy}>
              {busy && <LoaderCircle className="animate-spin" data-icon="inline-start" />}
              {busy ? '登录中…' : '登录'}
            </Button>
          </CardFooter>
        </Card>
        <p className="mt-6 text-center text-xs text-muted-foreground">
          仅向管理员开放 · 业务权限由 Go API 验证
        </p>
      </div>
    </main>
  )
}
