import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { JSDOM } from 'jsdom'

const { values } = parseArgs({
  options: {
    'base-url': { type: 'string' },
    mode: { type: 'string', default: 'preview' },
    'site-origin': { type: 'string' },
  },
})
assert(values['base-url'], 'Pass --base-url for the running Next.js server')
assert(['preview', 'production'].includes(values.mode), 'Use preview or production mode')
const base = new URL(values['base-url']).origin
const production = values.mode === 'production'
const origin = values['site-origin'] && new URL(values['site-origin']).origin
assert(
  !production || origin?.startsWith('https://'),
  'Production checks need --site-origin=https://…',
)
const paths = [
  '/',
  '/tools/ai-image-generator',
  '/tools/image-to-prompt',
  '/tools/ai-product-photo',
  '/tools/product-retouch',
  '/tools/ai-fashion-model',
]
const privatePaths = [
  '/studio',
  '/workbench',
  '/account',
  '/assets',
  '/tasks',
  '/prompts',
  '/settings',
  '/login',
  '/admin/login',
  '/inspiration',
]
const bot =
  'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
const normalize = (text) => text.replace(/\s+/g, ' ').trim()
async function read(path, userAgent = 'Mozilla/5.0 L08-Marketing-Acceptance') {
  const response = await fetch(new URL(path, base), { headers: { 'User-Agent': userAgent } })
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`)
  return new JSDOM(await response.text()).window.document
}
const meta = (doc, name) => doc.querySelector(`meta[name="${name}"]`)?.content
const property = (doc, name) => doc.querySelector(`meta[property="${name}"]`)?.content
const titles = new Set()
const descriptions = new Set()
const checks = []
for (const path of paths) {
  const doc = await read(path)
  const main = doc.querySelector('main')
  assert(main, `${path}: missing main`)
  assert.equal(doc.documentElement.lang, 'zh-CN')
  assert.equal(doc.querySelectorAll('h1').length, 1, `${path}: one H1 required`)
  assert(normalize(main.textContent).length > 200, `${path}: missing server-rendered copy`)
  assert(doc.title && meta(doc, 'description'), `${path}: missing title/description`)
  titles.add(doc.title)
  descriptions.add(meta(doc, 'description'))
  assert(doc.querySelector('a[href="#marketing-main"]'), `${path}: missing skip link`)
  assert.equal(main.tabIndex, -1, `${path}: main must accept skip-link focus`)
  const ids = [...doc.querySelectorAll('[id]')].map((el) => el.id)
  assert.equal(ids.length, new Set(ids).size, `${path}: duplicate IDs`)
  for (const link of doc.querySelectorAll('a[href^="#"]')) {
    assert(doc.getElementById(link.hash.slice(1)), `${path}: missing anchor ${link.hash}`)
  }
  for (const img of doc.querySelectorAll('main img')) {
    assert(img.alt.trim(), `${path}: image missing descriptive alt`)
    assert(
      (Number(img.width) > 0 && Number(img.height) > 0) || img.dataset.nimg === 'fill',
      `${path}: image needs dimensions or a reserved fill container`,
    )
  }
  for (const target of paths.slice(1)) {
    assert(
      doc.querySelector(`footer a[href="${target}"]`),
      `${path}: missing footer link ${target}`,
    )
  }
  let level = 0
  for (const heading of main.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const next = Number(heading.tagName.slice(1))
    assert(next <= level + 1, `${path}: skipped heading level at ${heading.textContent}`)
    level = next
  }
  const robots = meta(doc, 'robots')
  const canonical = doc.querySelector('link[rel="canonical"]')?.href
  if (production) {
    assert.equal(robots, 'index, follow', `${path}: production robots`)
    assert.equal(canonical, new URL(path, origin).href)
    assert.equal(new URL(property(doc, 'og:url')).href, canonical)
    const share = property(doc, 'og:image')
    assert(share?.startsWith(`${origin}/images/marketing/`), `${path}: share image origin`)
    assert.equal(meta(doc, 'twitter:image'), share)
  } else {
    assert.equal(robots, 'noindex, nofollow', `${path}: preview robots`)
    assert.equal(canonical, undefined, `${path}: preview canonical must be absent`)
    assert.equal(property(doc, 'og:url'), undefined)
    assert.equal(property(doc, 'og:image'), undefined)
    assert.equal(doc.querySelector('script[type="application/ld+json"]'), null)
  }
  const mobile = await read(path, bot)
  assert.equal(mobile.title, doc.title, `${path}: mobile title differs`)
  assert.equal(meta(mobile, 'robots'), robots, `${path}: mobile robots differs`)
  assert.equal(meta(mobile, 'description'), meta(doc, 'description'))
  assert.equal(
    normalize(mobile.querySelector('main').textContent),
    normalize(main.textContent),
    `${path}: primary copy differs for smartphone crawler`,
  )
  checks.push({
    path,
    h1: normalize(main.querySelector('h1').textContent),
    faqs: main.querySelectorAll('details').length,
    canonical: canonical ?? null,
    robots,
  })
}
assert.equal(titles.size, paths.length, 'Marketing titles must be unique')
assert.equal(descriptions.size, paths.length, 'Marketing descriptions must be unique')
for (const path of privatePaths) {
  const doc = await read(path)
  assert.equal(meta(doc, 'robots'), 'noindex, nofollow', `${path}: private robots`)
  assert.equal(doc.querySelector('link[rel="canonical"]'), null, `${path}: private canonical`)
}
const robotsText = await (await fetch(`${base}/robots.txt`)).text()
const sitemapText = await (await fetch(`${base}/sitemap.xml`)).text()
const sitemap = new JSDOM(sitemapText, { contentType: 'text/xml' }).window.document
const urls = [...sitemap.querySelectorAll('loc')].map((el) => el.textContent)
if (production) {
  assert(robotsText.includes(`Sitemap: ${origin}/sitemap.xml`))
  assert(robotsText.includes('Disallow: /admin') && robotsText.includes('Disallow: /account'))
  assert.deepEqual(urls.sort(), paths.map((path) => new URL(path, origin).href).sort())
  const home = await read('/')
  const graph = JSON.parse(home.querySelector('script[type="application/ld+json"]').textContent)
  assert.deepEqual(
    graph['@graph'].map((item) => item['@type']),
    ['Organization', 'WebSite'],
  )
  assert(graph['@graph'].every((item) => item.url === origin))
  const share = new URL(property(home, 'og:image'))
  assert.equal((await fetch(`${base}${share.pathname}`)).status, 200, 'Share image must exist')
} else {
  assert(robotsText.includes('Disallow: /\n'), 'Preview must disallow all crawling')
  assert.equal(urls.length, 0, 'Preview sitemap must be empty')
}
const legacy = await fetch(`${base}/?mode=commerce&task=product-main`, { redirect: 'manual' })
assert.equal(legacy.status, 307)
assert.equal(legacy.headers.get('location'), '/studio?mode=commerce&task=product-main')
console.log(
  JSON.stringify(
    {
      mode: values.mode,
      base,
      origin: origin ?? null,
      marketing: checks,
      privateNoindex: privatePaths,
      sitemap: urls,
      legacyRedirect: 'passed',
    },
    null,
    2,
  ),
)
