'use client'

import { FolderOpen, ImagePlus, Plus } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AuthenticatedImage, downloadProtectedAsset } from '@/components/authenticated-image'
import { apiBaseUrl, getAccessToken, readApiError } from '@/lib/api'

type Project = { id: string; name: string }
type Asset = { id: string; filename: string; sizeBytes: number; width: number; height: number; contentPath: string }

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [assets, setAssets] = useState<Asset[]>([])
  const [name, setName] = useState('')
  const [progress, setProgress] = useState(0)
  const [notice, setNotice] = useState('')
  const token = useMemo(() => typeof window === 'undefined' ? '' : getAccessToken(), [])

  const load = useCallback(async () => {
    if (!token) return
    const headers = { Authorization: `Bearer ${token}` }
    const [projectsResponse, assetsResponse] = await Promise.all([
      fetch(`${apiBaseUrl}/v1/projects`, { headers }),
      fetch(`${apiBaseUrl}/v1/assets`, { headers }),
    ])
    if (projectsResponse.status === 401 || assetsResponse.status === 401) {
      router.replace('/login')
      return
    }
    if (!projectsResponse.ok || !assetsResponse.ok) throw new Error('项目与资产加载失败')
    const [projectData, assetData] = await Promise.all([projectsResponse.json(), assetsResponse.json()]) as [
      { projects?: Project[] },
      { assets?: Asset[] },
    ]
    setProjects(projectData.projects ?? [])
    setAssets(assetData.assets ?? [])
  }, [router, token])

  useEffect(() => {
    if (!token) {
      router.replace('/login')
      return
    }
    void load().catch((error: unknown) => setNotice(error instanceof Error ? error.message : '加载失败'))
  }, [load, router, token])

  async function createProject() {
    if (!name.trim()) return
    setNotice('')
    const response = await fetch(`${apiBaseUrl}/v1/projects`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (!response.ok) {
      setNotice(await readApiError(response, '项目创建失败'))
      return
    }
    setName('')
    await load()
  }

  function upload(file: File) {
    setNotice('')
    const request = new XMLHttpRequest()
    const data = new FormData()
    data.append('file', file)
    request.open('POST', `${apiBaseUrl}/v1/assets`)
    request.setRequestHeader('Authorization', `Bearer ${token}`)
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100))
    }
    request.onload = () => {
      if (request.status < 200 || request.status >= 300) {
        try {
          setNotice((JSON.parse(request.responseText) as { message?: string }).message ?? '上传失败')
        } catch {
          setNotice('上传失败')
        }
      } else {
        void load()
      }
      window.setTimeout(() => setProgress(0), 500)
    }
    request.onerror = () => {
      setNotice('上传失败，请检查 API 服务')
      setProgress(0)
    }
    setProgress(1)
    request.send(data)
  }

  return <main className="projects-page">
    <div className="projects-head"><div><Link href="/" className="auth-back">← 返回首页</Link><h1>项目与资产</h1><p>管理你的创作项目和上传素材。</p></div><div className="project-create"><input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="新项目名称" /><button type="button" onClick={() => void createProject()}><Plus size={16} />创建项目</button></div></div>
    {notice && <p className="auth-notice" role="alert">{notice}</p>}
    <section className="project-list"><h2><FolderOpen size={18} />项目</h2><div className="project-grid">{projects.map((project) => <Link href={`/workbench?mode=commerce&task=scene&projectId=${project.id}`} key={project.id} className="project-item"><strong>{project.name}</strong><span>打开工作台</span></Link>)}{projects.length === 0 && <p className="empty-state">暂无项目，先创建一个项目。</p>}</div></section>
    <section className="asset-list"><div className="asset-head"><h2><ImagePlus size={18} />资产</h2><label className="upload-button"><ImagePlus size={16} />上传图片<input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = '' }} /></label></div>{progress > 0 && <div className="upload-progress"><span style={{ width: `${progress}%` }} /></div>}<div className="asset-grid">{assets.map((asset) => <article key={asset.id} className="asset-item"><AuthenticatedImage className="asset-placeholder" path={asset.contentPath} alt={asset.filename} /><strong>{asset.filename}</strong><span>{asset.width && asset.height ? `${asset.width} × ${asset.height}` : '尺寸待解析'} · {(asset.sizeBytes / 1024 / 1024).toFixed(2)} MB</span><button type="button" onClick={() => void downloadProtectedAsset(asset.contentPath, asset.filename).catch(() => setNotice('下载失败'))}>下载</button></article>)}{assets.length === 0 && <p className="empty-state">暂无资产，上传第一张图片开始创作。</p>}</div></section>
  </main>
}
