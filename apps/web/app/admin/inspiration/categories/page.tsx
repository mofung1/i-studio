import { InspirationCategoryManager } from '@/components/inspiration-category-manager'
import Link from 'next/link'
export default function Page() { return <><div className="ops-admin-links"><Link className="settings-command" href="/inspire">查看发现灵感</Link><Link className="settings-command" href="/admin/inspiration">管理提示词</Link><Link className="settings-command" href="/admin/inspiration/categories">分类管理</Link></div><InspirationCategoryManager /></> }
