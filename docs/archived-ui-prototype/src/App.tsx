import { useEffect, useState, type ReactNode } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import * as Tooltip from '@radix-ui/react-tooltip'
import {
  ArrowRight, Bell, Box, Check, ChevronDown, Clock3, Coins, Crop, Download, Heart,
  Image as ImageIcon, Maximize2, Menu, Minus, Palette, PanelLeft, PanelRight, Plus,
  RefreshCw, Search, Send, Sparkles, Upload, WandSparkles, X,
} from 'lucide-react'

type ToolId = 'general' | 'white' | 'scene' | 'selling' | 'detail'
type CommerceToolId = Exclude<ToolId, 'general'>
type ResultState = 'preview' | 'generating' | 'done' | 'failed'
type HomeMode = 'general' | 'commerce'
type ViewId = 'home' | 'creation' | 'inspiration' | 'assets'
type ConfigSide = 'left' | 'right'

const images = {
  headphones: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1400&q=88',
  chair: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1400&q=88',
  skincare: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=1400&q=88',
  shoes: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1400&q=88',
  watch: 'https://images.unsplash.com/photo-1434494878577-86c23bcb06b9?auto=format&fit=crop&w=1400&q=88',
  bottle: 'https://images.unsplash.com/photo-1602143407151-7111542de6e8?auto=format&fit=crop&w=1400&q=88',
}

const tools: Array<{ id: CommerceToolId; title: string; subtitle: string; image: string; accent: string }> = [
  { id: 'white', title: '白底精修', subtitle: '生成干净规范的上架主图', image: images.bottle, accent: 'mint' },
  { id: 'scene', title: '商品场景图', subtitle: '把商品自然放入真实场景', image: images.headphones, accent: 'yellow' },
  { id: 'selling', title: '卖点主图', subtitle: '生成有信息留白的主视觉', image: images.shoes, accent: 'coral' },
  { id: 'detail', title: '详情页单页', subtitle: '围绕单一主题表达商品信息', image: images.skincare, accent: 'blue' },
]

const detailModules = ['首屏主视觉', '核心卖点', '使用场景', '多角度', '尺寸 / 参数', '材质 / 成分', '配件清单']
const insightTags = [['构图', '中心聚焦'], ['色彩', '暖灰 + 琥珀'], ['材质', '哑光金属'], ['光影', '柔和侧光'], ['风格', '现代极简'], ['氛围', '安静专注']]
const inspirationItems = [
  { title: '晨光下的护肤仪式', category: '美妆', image: images.skincare, tall: true },
  { title: '安静的居家办公', category: '数码', image: images.headphones, tall: false },
  { title: '现代主义客厅', category: '家居', image: images.chair, tall: false },
  { title: '城市跑者', category: '鞋服', image: images.shoes, tall: true },
  { title: '精密时间美学', category: '配饰', image: images.watch, tall: true },
  { title: '轻盈水杯', category: '生活', image: images.bottle, tall: false },
]
const projectItems = [
  { name: 'Aero H1 秋季上新', meta: '场景图 · 12 个资产', image: images.headphones, time: '刚刚' },
  { name: 'Mori 护肤套装', meta: '详情页 · 24 个资产', image: images.skincare, time: '昨天' },
  { name: 'Nordic 单椅', meta: '主图 · 8 个资产', image: images.chair, time: '9 月 4 日' },
  { name: 'Runway 鞋款 A/B', meta: '场景图 · 16 个资产', image: images.shoes, time: '9 月 2 日' },
]

function IconButton({ label, children, onClick, className = '', pressed }: { label: string; children: ReactNode; onClick?: () => void; className?: string; pressed?: boolean }) {
  return <Tooltip.Root><Tooltip.Trigger asChild><button className={`icon-button ${className}`} aria-label={label} aria-pressed={pressed} onClick={onClick}>{children}</button></Tooltip.Trigger><Tooltip.Portal><Tooltip.Content className="tooltip" sideOffset={8}>{label}</Tooltip.Content></Tooltip.Portal></Tooltip.Root>
}

function Button({ children, variant = 'primary', onClick, disabled = false, className = '' }: { children: ReactNode; variant?: 'primary' | 'secondary' | 'ghost' | 'dark'; onClick?: () => void; disabled?: boolean; className?: string }) {
  return <button className={`button button-${variant} ${className}`} onClick={onClick} disabled={disabled}>{children}</button>
}

function Brand({ onClick }: { onClick: () => void }) {
  return <button className="brand" aria-label="返回通用生图" onClick={onClick}><span className="brand-mark"><i /><i /></span><strong>iStudio</strong></button>
}

function TopNav({ view, mode, onGeneral, onCommerce, onNavigate }: { view: ViewId; mode: HomeMode; onGeneral: () => void; onCommerce: () => void; onNavigate: (view: ViewId) => void }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [navToast, setNavToast] = useState('')
  useEffect(() => { if (!navToast) return; const timer = window.setTimeout(() => setNavToast(''), 1800); return () => window.clearTimeout(timer) }, [navToast])
  const closeAnd = (action: () => void) => { action(); setMobileOpen(false) }
  return <header className="top-nav"><Brand onClick={onGeneral} /><nav className={mobileOpen ? 'open' : ''}><button className={view === 'home' && mode === 'general' ? 'active' : ''} onClick={() => closeAnd(onGeneral)}>AI 图片</button><button className={view === 'home' && mode === 'commerce' ? 'active' : ''} onClick={() => closeAnd(onCommerce)}>电商工具</button><button className={view === 'inspiration' ? 'active' : ''} onClick={() => closeAnd(() => onNavigate('inspiration'))}>发现灵感</button><button className={view === 'creation' ? 'active' : ''} onClick={() => closeAnd(() => onNavigate('creation'))}>项目</button><button className={view === 'assets' ? 'active' : ''} onClick={() => closeAnd(() => onNavigate('assets'))}>资产</button></nav><div className="nav-actions"><span className="credit-chip"><Coins size={15} />1,280</span><IconButton label="通知" onClick={() => setNavToast('暂无新通知')}><Bell size={19} /><span className="notification-dot" /></IconButton><button className="avatar-button" aria-label="账户菜单" onClick={() => setNavToast('账户菜单将在正式开发中接入')}>M</button><button className="mobile-menu-button" aria-label="打开导航" onClick={() => setMobileOpen((value) => !value)}>{mobileOpen ? <X size={20} /> : <Menu size={20} />}</button></div>{navToast && <div className="toast"><Check size={16} />{navToast}</div>}</header>
}

function ModelMenu({ compact = false }: { compact?: boolean }) {
  const [model, setModel] = useState('Auto · 推荐')
  const models = ['Auto · 推荐', 'GPT Image 2', 'Nano Banana Pro', 'Seedream 5.0']
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className={`control-pill model-control ${compact ? 'compact' : ''}`}><Sparkles size={16} /><span>{model}</span><ChevronDown size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content" sideOffset={7} align="start">{models.map((item) => <DropdownMenu.Item key={item} className="dropdown-item" onSelect={() => setModel(item)}>{item}{model === item && <Check size={15} />}</DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}

function SettingsMenu() {
  const [ratio, setRatio] = useState('1:1')
  const [quality, setQuality] = useState('2K')
  const [count, setCount] = useState('1 张')
  return <DropdownMenu.Root><DropdownMenu.Trigger asChild><button className="control-pill settings-control"><span>{ratio} · {quality} · {count}</span><ChevronDown size={15} /></button></DropdownMenu.Trigger><DropdownMenu.Portal><DropdownMenu.Content className="dropdown-content settings-menu" sideOffset={7} align="start"><p>画面比例</p><div className="mini-options">{['1:1', '3:4', '4:3', '16:9'].map((item) => <button key={item} className={ratio === item ? 'selected' : ''} onClick={() => setRatio(item)}>{item}</button>)}</div><p>输出质量</p><div className="mini-options three">{['1K', '2K', '4K'].map((item) => <button key={item} className={quality === item ? 'selected' : ''} onClick={() => setQuality(item)}>{item}</button>)}</div><p>生成数量</p><div className="mini-options three">{['1 张', '2 张', '4 张'].map((item) => <button key={item} className={count === item ? 'selected' : ''} onClick={() => setCount(item)}>{item}</button>)}</div></DropdownMenu.Content></DropdownMenu.Portal></DropdownMenu.Root>
}

function Composer({ onCreate, onReference }: { onCreate: () => void; onReference: () => void }) {
  const [prompt, setPrompt] = useState('柔和晨光中的极简静物摄影，构图干净，材质细节清晰。')
  return <div className="composer-wrap"><div className="composer"><button className="composer-upload" aria-label="添加参考图片" onClick={onReference}><Plus size={23} /></button><textarea aria-label="创作描述" value={prompt} onChange={(event) => setPrompt(event.target.value)} /><div className="composer-footer"><div><ModelMenu /><SettingsMenu /></div><button className="send-button" aria-label="开始生成" disabled={!prompt.trim()} onClick={onCreate}><Send size={19} /></button></div></div></div>
}

function WorkspaceHome({ onOpenTool, onModeChange, onNavigate }: { onOpenTool: (tool: ToolId, start?: boolean) => void; onModeChange: (mode: HomeMode) => void; onNavigate: (view: ViewId) => void }) {
  return <main className="workspace-home"><section className="create-hero"><span className="workspace-kicker"><Sparkles size={16} />通用生图</span><h1>描述你的想法，生成一张<span>好图</span></h1><p>输入画面描述，可选参考图，再选择模型、比例和生成数量。</p><Composer onCreate={() => { onModeChange('general'); onOpenTool('general', true) }} onReference={() => { onModeChange('general'); onOpenTool('general') }} /></section>
    <section className="workspace-section tools-section" id="commerce-tools"><div className="section-title-row"><div><span className="section-icon"><Box size={18} /></span><div><h2>电商创作工具</h2><p>选择创作目标，系统会加载对应的商品图参数。</p></div></div></div><div className="tool-card-grid">{tools.map((tool) => <button className={`tool-card accent-${tool.accent}`} key={tool.id} onClick={() => { onModeChange('commerce'); onOpenTool(tool.id) }}><div className="tool-card-copy"><h3>{tool.title}</h3><p>{tool.subtitle}</p><span className="tool-arrow"><ArrowRight size={18} /></span></div><img src={tool.image} alt={`${tool.title}示例`} /></button>)}</div></section>
    <section className="workspace-section recent-section"><div className="section-title-row"><div><span className="section-icon"><Clock3 size={18} /></span><div><h2>最近项目</h2><p>继续上次未完成的创作。</p></div></div><button className="text-button" onClick={() => onNavigate('creation')}>查看全部 <ArrowRight size={15} /></button></div><div className="recent-task"><img src={projectItems[0].image} alt={projectItems[0].name} /><div><strong>{projectItems[0].name}</strong><span>{projectItems[0].meta}</span></div><span>{projectItems[0].time}</span><Button variant="secondary" onClick={() => { onModeChange('commerce'); onOpenTool('scene') }}>继续创作</Button></div></section>
    <section className="workspace-section inspiration-section"><div className="section-title-row"><div><span className="section-icon"><Palette size={18} /></span><div><h2>发现灵感</h2><p>精选可复用的构图和视觉方向。</p></div></div><button className="text-button" onClick={() => onNavigate('inspiration')}>浏览全部 <ArrowRight size={15} /></button></div><div className="inspiration-grid">{inspirationItems.map((item) => <article className={item.tall ? 'tall' : ''} key={item.title}><div className="inspiration-image"><img src={item.image} alt={item.title} /><div className="inspiration-actions"><Button variant="secondary" onClick={() => { onModeChange('general'); onOpenTool('general') }}>用于创作</Button></div></div><div><div><strong>{item.title}</strong><span>{item.category}</span></div></div></article>)}</div></section>
  </main>
}

function ToolEditor({ initialTool, shouldStart, onBack }: { initialTool: ToolId; shouldStart: boolean; onBack: (mode: HomeMode) => void }) {
  const [tool, setTool] = useState<ToolId>(initialTool)
  const [count, setCount] = useState(1)
  const [module, setModule] = useState('核心卖点')
  const [insights, setInsights] = useState(() => insightTags.map(([key]) => key))
  const [resultState, setResultState] = useState<ResultState>(shouldStart ? 'generating' : 'preview')
  const [toast, setToast] = useState('')
  const [hasImage, setHasImage] = useState(true)
  const [configSide, setConfigSide] = useState<ConfigSide>(() => window.localStorage.getItem('istudio-config-side-v2') === 'right' ? 'right' : 'left')
  const [prompts, setPrompts] = useState({
    general: '柔和晨光中的极简静物摄影，构图干净，材质细节清晰。',
    commerce: '突出长效续航、舒适佩戴与沉浸降噪。画面干净克制，适合高端数码品牌。',
  })
  const isCommerce = tool !== 'general'
  const prompt = isCommerce ? prompts.commerce : prompts.general
  const activeTool = isCommerce ? tools.find((item) => item.id === tool) ?? tools[0] : { title: '通用生图', subtitle: '从文字描述或参考图生成画面' }

  useEffect(() => { if (resultState !== 'generating') return; const timer = window.setTimeout(() => setResultState('done'), 2600); return () => window.clearTimeout(timer) }, [resultState])
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 2200); return () => window.clearTimeout(timer) }, [toast])
  useEffect(() => { window.localStorage.setItem('istudio-config-side-v2', configSide) }, [configSide])

  const toggleInsight = (key: string) => setInsights((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key])
  const setPrompt = (value: string) => setPrompts((current) => ({ ...current, [isCommerce ? 'commerce' : 'general']: value }))
  const switchMode = (nextTool: ToolId) => {
    setTool(nextTool)
    setResultState('preview')
  }
  const improvePrompt = () => {
    setPrompt(isCommerce ? '突出长效续航、舒适佩戴与沉浸降噪，保持商品外观与材质准确，使用克制的高端商业摄影风格。' : '柔和晨光照入极简空间，主体居中偏左，保留自然阴影与细腻材质，高级商业静物摄影。')
    setToast('已优化画面描述')
  }

  return <main className={`tool-editor commerce-editor unified-editor ${isCommerce ? 'commerce-tool' : 'general-tool'} config-${configSide}`}>
    <aside className="commerce-rail"><span className="rail-brand"><span className="brand-mark"><i /><i /></span></span><button className={!isCommerce ? 'active' : ''} onClick={() => switchMode('general')}><WandSparkles size={21} /><span>通用</span></button><button className={isCommerce ? 'active' : ''} onClick={() => { if (!isCommerce) switchMode('white') }}><Box size={21} /><span>商品</span></button></aside>
    <div className="tool-subnav"><div>{isCommerce ? tools.map((item) => <button key={item.id} className={tool === item.id ? 'active' : ''} onClick={() => switchMode(item.id)}>{item.id === 'white' && <Box size={16} />}{item.id === 'scene' && <ImageIcon size={16} />}{item.id === 'selling' && <Sparkles size={16} />}{item.id === 'detail' && <Palette size={16} />}{item.title}</button>) : <span className="general-subnav-label"><WandSparkles size={17} />通用生图</span>}</div><IconButton label="关闭生成工作台" onClick={() => onBack(isCommerce ? 'commerce' : 'general')}><X size={20} /></IconButton></div>
    <div className="editor-layout"><section className="editor-canvas">{isCommerce && <div className="canvas-heading"><div><h1>{activeTool.title}</h1><p>{activeTool.subtitle} · 上传商品后由 AI 自动规划画面</p></div></div>}<div className={`canvas-stage state-${resultState}`}>{resultState === 'preview' && <EditorPreview tool={tool} />}{resultState === 'generating' && <GenerationFeedback tool={tool} />}{resultState === 'done' && <EditorResult tool={tool} onToast={setToast} />}{resultState === 'failed' && <div className="failed-state"><RefreshCw size={28} /><h2>生成暂时中断</h2><p>模型响应超时，本次任务未计费。</p><Button variant="dark" onClick={() => setResultState('generating')}><RefreshCw size={16} />重新生成</Button></div>}</div></section>
      <aside className="editor-panel"><div className="panel-layout-bar"><strong>生成配置</strong><div className="layout-toggle" aria-label="配置面板位置"><IconButton label="配置显示在左侧" className={configSide === 'left' ? 'selected' : ''} pressed={configSide === 'left'} onClick={() => setConfigSide('left')}><PanelLeft size={17} /></IconButton><IconButton label="配置显示在右侧" className={configSide === 'right' ? 'selected' : ''} pressed={configSide === 'right'} onClick={() => setConfigSide('right')}><PanelRight size={17} /></IconButton></div></div><div className="panel-scroll"><div className="panel-section"><div className="panel-label"><label>{isCommerce ? '商品原图' : '参考图片'}</label><span>{isCommerce ? '支持 1–3 张，多角度效果更佳' : '可选，最多 4 张'}</span></div><div className="upload-list">{hasImage && <div className="uploaded-thumb"><img src={isCommerce ? images.headphones : images.skincare} alt={isCommerce ? '商品原图' : '创作参考图'} /><span>{isCommerce ? '主图' : '参考'}</span><button aria-label="删除图片" onClick={() => setHasImage(false)}><X size={13} /></button></div>}<button className="add-thumb" onClick={() => setHasImage(true)}><Upload size={19} /><span>{hasImage ? '添加图片' : '选择图片'}</span></button></div></div>
        {isCommerce && <div className="panel-section split-fields"><div><label>上架平台</label><select className="select-control" defaultValue="Amazon"><option>淘宝 / 天猫</option><option>京东</option><option>抖音</option><option>Amazon</option><option>Shopify</option></select></div><div><label>输出语言</label><select className="select-control" defaultValue="English"><option>简体中文</option><option>繁体中文</option><option>English</option></select></div></div>}
        <div className="panel-section"><div className="panel-label"><label>{isCommerce ? '商品卖点与要求' : '画面描述'}</label><button className="ai-write" onClick={improvePrompt}><WandSparkles size={15} />AI 优化</button></div><textarea className="panel-textarea" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></div>
        {!isCommerce && <div className="panel-section split-fields"><div><label>创作风格</label><select className="select-control" defaultValue="不指定"><option>不指定</option><option>摄影棚</option><option>极简</option><option>清新</option><option>科技</option><option>国潮</option></select></div><div><label>参考强度</label><select className="select-control" defaultValue="中" disabled={!hasImage}><option>低</option><option>中</option><option>高</option></select></div></div>}
        {tool === 'detail' && <div className="panel-section"><div className="panel-label stacked"><label>详情页内容模块</label><span>选择本页要表达的一个主题</span></div><div className="module-grid">{detailModules.map((item) => <button key={item} className={module === item ? 'selected' : ''} onClick={() => setModule(item)}>{module === item && <Check size={14} />}{item}</button>)}</div></div>}
        {isCommerce && <div className="panel-section"><div className="panel-label"><label>视觉方向</label><span>取消不希望参考的维度</span></div><div className="reference-insight"><img src={images.chair} alt="视觉参考图" /><div><strong>智能匹配</strong><span>基于商品图推荐当前方向</span></div></div><div className="insight-chips">{insightTags.map(([key, value]) => <button key={key} className={insights.includes(key) ? 'selected' : ''} onClick={() => toggleInsight(key)}><span>{key}</span>{value}{insights.includes(key) && <Check size={12} />}</button>)}</div></div>}
        <div className="panel-section"><div className="panel-label"><label>画面设置</label><span>默认生成 1 张</span></div><div className="settings-row"><select className="select-control" defaultValue="1:1"><option>1:1</option><option>3:4</option><option>4:3</option><option>9:16</option><option>16:9</option></select><select className="select-control" defaultValue="2K"><option>1K</option><option>2K</option><option>4K</option></select><div className="count-stepper"><button aria-label="减少数量" onClick={() => setCount((value) => Math.max(1, value - 1))}><Minus size={15} /></button><strong>{count}</strong><button aria-label="增加数量" onClick={() => setCount((value) => Math.min(4, value + 1))}><Plus size={15} /></button></div></div></div></div>
        <div className="panel-footer"><ModelMenu compact /><Button variant="dark" className="generate-button" disabled={resultState === 'generating' || !prompt.trim() || (isCommerce && !hasImage)} onClick={() => setResultState('generating')}>{resultState === 'generating' ? <><RefreshCw className="spin" size={17} />正在生成</> : <><Sparkles size={17} />生成 {activeTool.title}</>}</Button></div></aside></div>{toast && <div className="toast"><Check size={16} />{toast}</div>}
  </main>
}

function EditorPreview({ tool }: { tool: ToolId }) {
  const productImage = tool === 'white' ? images.bottle : tool === 'selling' ? images.shoes : tool === 'detail' ? images.skincare : images.headphones
  const cards = tool === 'general' ? [['构图参考', images.skincare], ['空间参考', images.chair], ['光影参考', images.watch]] : [['商品原图', productImage], ['主图', productImage], ['卖点解析', images.chair], ['细节特写', images.watch], ['商品规格', images.bottle]]
  return <div className="preview-state"><div className="preview-board">{cards.map(([label, image], index) => <div className={index === 0 ? 'primary-preview' : ''} key={label}><img src={image} alt={label} /><span>{label}</span></div>)}{tool !== 'general' && <span className="preview-flow"><ArrowRight size={19} /></span>}</div>{tool !== 'general' && <div className="preview-dots"><i className="active" /><i /><i /></div>}<div className="preview-copy"><span>生成预览</span><h2>{tool === 'detail' ? '结构清晰的单页详情素材' : tool === 'general' ? '符合描述的完整创意画面' : '符合平台规范的商品图'}</h2><p>完成右侧参数后，生成过程和结果会显示在这里。</p></div></div>
}

function GenerationFeedback({ tool }: { tool: ToolId }) {
  return <div className="generation-feedback"><div className="generating-image"><img src={tool === 'detail' || tool === 'general' ? images.skincare : images.headphones} alt="正在生成的图片" /><div className="scan-line" /><span><Sparkles size={21} /></span></div><h2>正在构建{tool === 'detail' ? '详情页内容' : tool === 'general' ? '创意画面' : '商品画面'}</h2><p>正在匹配构图、光影与创作约束，可以离开当前页面。</p><div className="stage-track"><i /><i className="active" /><i /></div><div className="stage-labels"><span><Check size={13} />理解需求</span><span className="active">生成画面</span><span>自动质检</span></div></div>
}

function EditorResult({ tool, onToast }: { tool: ToolId; onToast: (message: string) => void }) {
  return <div className="editor-result"><div className="result-topline"><div><span className="success-label"><Check size={13} />生成完成</span><h2>{tool === 'detail' ? 'Aero H1 核心卖点页' : tool === 'general' ? '晨光里的静物构图' : 'Aero H1 商品图'}</h2></div><span>耗时 42 秒</span></div><div className="result-image"><img src={tool === 'detail' || tool === 'general' ? images.skincare : images.headphones} alt="AI 生成结果" /><span className="ai-badge">AI 生成</span><div className="result-hover-actions"><IconButton label="放大预览" onClick={() => onToast('已打开预览')}><Maximize2 size={18} /></IconButton></div></div><div className="result-actions"><div><strong>2048 × 2048</strong><span>画面结构清晰</span></div><Button variant="secondary" onClick={() => onToast('已创建裁剪副本')}><Crop size={16} />裁剪</Button><Button variant="dark" onClick={() => onToast('图片已加入下载队列')}><Download size={16} />下载</Button></div></div>
}

function PageHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <div className="page-heading"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div></div>
}

function CreationPage({ onContinue }: { onContinue: () => void }) {
  return <main className="library-page"><PageHeader eyebrow="创作积累" title="你的创作" description="按项目沉淀生成记录和可复用素材。" /><div className="recent-task creation-latest"><img src={images.headphones} alt="Aero H1 最近任务" /><div><strong>Aero H1 居家场景</strong><span>生成完成 · 1 张图片</span></div><span>12 分钟前</span><Button variant="secondary" onClick={onContinue}>继续创作</Button></div><div className="project-grid">{projectItems.map((project) => <article key={project.name}><div className="project-cover"><img src={project.image} alt={project.name} /><div><span>最近更新</span></div></div><div className="project-meta"><div><strong>{project.name}</strong><span>{project.meta}</span></div><time>{project.time}</time></div></article>)}</div></main>
}

function InspirationPage({ onUse }: { onUse: () => void }) {
  const [favorites, setFavorites] = useState<string[]>([])
  const toggleFavorite = (title: string) => setFavorites((current) => current.includes(title) ? current.filter((item) => item !== title) : [...current, title])
  return <main className="library-page"><PageHeader eyebrow="灵感" title="发现视觉方向" description="从精选案例中提取构图与风格，再开始自己的创作。" /><div className="inspiration-grid">{inspirationItems.map((item) => <article className={item.tall ? 'tall' : ''} key={item.title}><div className="inspiration-image"><img src={item.image} alt={item.title} /><div className="inspiration-actions"><IconButton label={favorites.includes(item.title) ? '取消收藏' : '收藏'} onClick={() => toggleFavorite(item.title)}><Heart size={18} fill={favorites.includes(item.title) ? 'currentColor' : 'none'} /></IconButton><Button variant="secondary" onClick={onUse}>用于创作</Button></div></div><div><div><strong>{item.title}</strong><span>{item.category}</span></div></div></article>)}</div></main>
}

function AssetsPage() {
  const [filter, setFilter] = useState('全部')
  const [search, setSearch] = useState('')
  const [toast, setToast] = useState('')
  const assets = inspirationItems.map((item, index) => ({ ...item, assetType: index < 2 ? '上传素材' : index < 5 ? '生成结果' : '收藏' }))
  const visibleAssets = assets.filter((item) => (filter === '全部' || item.assetType === filter) && (!search || item.title.includes(search)))
  useEffect(() => { if (!toast) return; const timer = window.setTimeout(() => setToast(''), 1800); return () => window.clearTimeout(timer) }, [toast])
  return <main className="library-page"><PageHeader eyebrow="资产" title="资产中心" description="集中管理上传素材、生成结果和收藏。" /><div className="asset-toolbar"><div className="category-tabs light">{['全部', '上传素材', '生成结果', '收藏'].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div><div className="search-field small"><Search size={17} /><input aria-label="搜索资产" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索资产" /></div></div><div className="asset-grid">{visibleAssets.map((item) => <article key={item.title} className={item.tall ? 'tall' : ''}><div><img src={item.image} alt={item.title} /><span>{item.assetType}</span><div><IconButton label="下载" onClick={() => setToast(`已将「${item.title}」加入下载队列`)}><Download size={18} /></IconButton></div></div><footer><strong>{item.title}</strong></footer></article>)}</div>{visibleAssets.length === 0 && <div className="empty-state">没有匹配的资产</div>}{toast && <div className="toast"><Check size={16} />{toast}</div>}</main>
}

export function App() {
  const [view, setView] = useState<ViewId>('home')
  const [homeMode, setHomeMode] = useState<HomeMode>('general')
  const [activeTool, setActiveTool] = useState<ToolId | null>(null)
  const [shouldStart, setShouldStart] = useState(false)
  const goHome = (mode: HomeMode = 'general') => {
    setView('home')
    setHomeMode(mode)
    setActiveTool(null)
    setShouldStart(false)
    window.requestAnimationFrame(() => window.scrollTo({ top: mode === 'general' ? 0 : document.getElementById('commerce-tools')?.offsetTop ?? 0, behavior: 'smooth' }))
  }
  const openTool = (tool: ToolId, start = false) => { setActiveTool(tool); setShouldStart(start) }
  const navigate = (nextView: ViewId) => { setView(nextView); setActiveTool(null); setShouldStart(false) }
  const workspaceFocused = view === 'home' && activeTool !== null
  return <Tooltip.Provider delayDuration={300}><div className={`app ${workspaceFocused ? 'workspace-mode' : ''}`}>{!workspaceFocused && <TopNav view={view} mode={homeMode} onGeneral={() => { setView('home'); setHomeMode('general'); openTool('general') }} onCommerce={() => { setView('home'); setHomeMode('commerce'); openTool('white') }} onNavigate={navigate} />}{view === 'home' && activeTool === null && <WorkspaceHome onOpenTool={openTool} onModeChange={setHomeMode} onNavigate={navigate} />}{view === 'home' && activeTool !== null && <ToolEditor key={activeTool} initialTool={activeTool} shouldStart={shouldStart} onBack={goHome} />}{view === 'creation' && <CreationPage onContinue={() => { setView('home'); setHomeMode('commerce'); openTool('scene') }} />}{view === 'inspiration' && <InspirationPage onUse={() => { setView('home'); setHomeMode('general'); openTool('general') }} />}{view === 'assets' && <AssetsPage />}</div></Tooltip.Provider>
}
