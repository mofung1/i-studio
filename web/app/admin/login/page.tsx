import { Suspense } from 'react'
import { LoginForm } from '@/components/admin/login-form'
export default function AdminLoginPage() {
  return (
    <Suspense fallback={<main className="auth-page" aria-label="后台登录页加载中" />}>
      <LoginForm />
    </Suspense>
  )
}
