import { Suspense } from 'react'
import { LoginForm } from '@/components/login-form'
export default function LoginPage() {
  return (
    <Suspense fallback={<main className="auth-page" aria-label="登录页加载中" />}>
      <LoginForm />
    </Suspense>
  )
}
