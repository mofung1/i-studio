// Re-encode already generated local assets; never generates or downloads imagery.
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const nextRequire = createRequire(require.resolve('next/package.json'))
const sharp = nextRequire('sharp')
const root = path.resolve(__dirname, '../..')

async function main() {
  const plan = JSON.parse(
    await fs.readFile(path.join(root, 'docs/marketing-visuals/prompts.json'), 'utf8'),
  )
  const sources = JSON.parse(
    await fs.readFile(path.join(root, 'docs/marketing-visuals/sources.json'), 'utf8'),
  )
  const originalDir = path.join(root, sources.archive)
  const outputDir = path.join(root, 'web/public/images/marketing')
  await fs.mkdir(originalDir, { recursive: true })
  const entries = []
  for (const asset of plan.assets) {
    const source = sources.assets.find((entry) => entry.id === asset.id)
    if (!source?.source) throw new Error(`Missing generated source: ${asset.id}`)
    const input = await fs.readFile(source.source).catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return fs.readFile(path.join(originalDir, `${asset.id}.png`))
    })
    await fs.writeFile(path.join(originalDir, `${asset.id}.png`), input)
    const destination = path.join(outputDir, asset.destination)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    const landscape = asset.id === 'ai-story-city'
    const info = await sharp(input)
      .resize(asset.width || (landscape ? 1664 : 1120), asset.height || (landscape ? 936 : 1400), {
        fit: 'cover',
      })
      .webp({ quality: landscape ? 88 : 84, effort: 6 })
      .toFile(destination)
    entries.push({
      id: asset.id,
      src: `/images/marketing/${asset.destination}`,
      width: info.width,
      height: info.height,
      bytes: info.size,
      sourceSha256: crypto.createHash('sha256').update(input).digest('hex'),
      original: `${sources.archive}/${asset.id}.png`,
      referenceId: asset.referenceId || null,
      mode: asset.referenceId ? 'reference-image-edit' : 'new-generation',
      disclosure: plan.disclosure,
    })
  }
  const city = path.join(
    outputDir,
    plan.assets.find((asset) => asset.id === 'ai-story-city').destination,
  )
  const variants = [
    {
      id: 'gallery-city',
      destination: 'sunny/gallery/coastal-detail.webp',
      width: 840,
      height: 1050,
      position: 'centre',
      crop: { left: 660, top: 0, width: 748, height: 936 },
    },
    {
      id: 'social-cover',
      destination: 'sunny/hero/coastal-og.webp',
      width: 1200,
      height: 630,
      position: 'centre',
    },
  ]
  for (const variant of variants) {
    const destination = path.join(outputDir, variant.destination)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    const pipeline = sharp(city)
    if (variant.crop) pipeline.extract(variant.crop)
    const info = await pipeline
      .resize(variant.width, variant.height, { fit: 'cover', position: variant.position })
      .webp({ quality: 84, effort: 6 })
      .toFile(destination)
    entries.push({
      id: variant.id,
      src: `/images/marketing/${variant.destination}`,
      width: info.width,
      height: info.height,
      bytes: info.size,
      derivedFrom: 'ai-story-city',
      ...(variant.crop ? { crop: variant.crop } : {}),
      mode: 'resize-and-crop',
      disclosure: plan.disclosure,
    })
  }
  await fs.writeFile(
    path.join(root, 'docs/marketing-visuals/manifest.json'),
    JSON.stringify(
      {
        tool: sources.tool,
        started: sources.started,
        completed: sources.completed,
        assets: entries,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(
    JSON.stringify(
      {
        count: entries.length,
        totalBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
        assets: entries.map(({ id, bytes, width, height }) => ({ id, bytes, width, height })),
      },
      null,
      2,
    ),
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
