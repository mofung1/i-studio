import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { marketingAssets } from '@/lib/marketing-assets'

const workbenchShot = marketingAssets.workbench

export function WorkbenchPreview() {
  return (
    <section className="marketing-section workbench-section" aria-labelledby="workbench-title">
      <div className="workbench-intro">
        <div className="workbench-title">
          <h2 id="workbench-title">
            从一个想法，
            <br />
            到一张好图。
          </h2>
        </div>
        <div className="workbench-lead">
          <p>在一处设置描述、参考图与模型参数，生成后下载作品，或载入历史继续调整。</p>
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
    </section>
  )
}
