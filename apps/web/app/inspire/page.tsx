import { InspirationGallery } from '@/components/inspiration-gallery'
import { TopNavigation } from '@/components/top-navigation'

/** 灵感瀑布流：独立页面，不再放在工作台里。 */
export default function InspirePage() {
  return (
    <div className="site-shell">
      <TopNavigation />
      <main className="content-page">
        <div className="library-content">
          <InspirationGallery />
        </div>
      </main>
    </div>
  )
}
