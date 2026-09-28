import { BentoFeatures } from './home/bento-features'
import { CreativeCommandBar } from './home/creative-command-bar'
import { HeroSection } from './home/hero-section'
import { ProductShowcase } from './home/product-showcase'
import { WorkflowSection } from './home/workflow-section'
import { TopNavigation } from './top-navigation'

export function HomePage() {
  return (
    <div className="site-shell ist-home">
      <TopNavigation variant="home" />
      <main>
        <HeroSection />
        <ProductShowcase />
        <CreativeCommandBar />
        <BentoFeatures />
        <WorkflowSection />
      </main>
    </div>
  )
}

