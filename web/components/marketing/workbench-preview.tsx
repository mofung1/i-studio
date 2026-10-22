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
          <p>
            描述、参考图、模型与参数集中在一处，生成后可下载或载入历史继续调整。可用比例与清晰度随所选模型变化。
          </p>
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
      <p className="workbench-device-note">
        <Monitor size={16} aria-hidden="true" />
        电脑端可同时查看创作参数与生成结果。
      </p>
    </section>
  )
}
