import { useAdminAccount } from '@/components/account-provider'
import { AdminMonitoring } from '@/components/admin/monitoring'
import { AdminPageHeader } from '@/components/admin/page-header'
import styles from '@/components/admin/overview.module.css'
import { useAdminMonitoring } from '@/hooks/use-admin-monitoring'

export default function MonitoringPage() {
  const { account } = useAdminAccount()
  const monitoring = useAdminMonitoring()

  return (
    <main className={styles.monitorPage}>
      <AdminPageHeader title="运行监控" />
      <AdminMonitoring {...monitoring} unit={account.creditName} />
    </main>
  )
}
