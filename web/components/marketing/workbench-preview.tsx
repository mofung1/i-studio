import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Monitor } from 'lucide-react'
import { marketingAssets } from '@/lib/marketing-assets'

const workbenchShot = marketingAssets.workbench

export function WorkbenchPreview() {
  return (
    <section className="marketing-section workbench-section" aria-labelledby="workbench-title">
      <div className="workbench-intro">
        <div className="workbench-title">
          <span className="workbench-eyebrow">真实工作台</span>
          <h2 id="workbench-title">
            从一个想法，
            <br />
            到一张好图。
          </h2>
        </div>
        <div className="workbench-lead">
          <p>提示词、参考图、模型与画面参数在同一屏。写下的想法，可以直接进入生成。</p>
          <ul className="workbench-facts">
            <li>提示词与参考图同屏</li>
            <li>16:9 · 4K 参数可调</li>
            <li>创作记录自动归档</li>
          </ul>
          <Link className="marketing-text-link" href="/studio">
            打开创作工作台 <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <figure className="workbench-frame">
        <Image
          src={workbenchShot.src}
          alt={workbenchShot.alt}
          width={workbenchShot.width}
          height={workbenchShot.height}
          sizes="(max-width: 760px) 100vw, (max-width: 1300px) calc(100vw - 64px), 1240px"
          loading="lazy"
        />
        <figcaption>
          <span>真实界面截图</span>
          创作设置 · 参考图 · 模型参数 · 生成结果
        </figcaption>
      </figure>
      <div className="workbench-mobile-card">
        <Monitor size={20} aria-hidden="true" />
        <div>
          <strong>工作台在电脑端更完整</strong>
          <p>提示词、参考图与参数同屏，创作时更顺手。移动端可先浏览案例。</p>
          <Link href="/studio">
            仍要打开工作台 <ArrowUpRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  )
}
