// Optimize already generated local files. No generation, downloads or API credentials.
const fs = require('node:fs/promises')
const path = require('node:path')
const crypto = require('node:crypto')
const { createRequire } = require('node:module')
const sharp = createRequire(require.resolve('next/package.json'))('sharp')
const root = path.resolve(__dirname, '../..')

async function main() {
  const folder = path.join(root, 'docs/marketing-visuals/tool-showcase')
  const plan = JSON.parse(await fs.readFile(path.join(folder, 'prompts.json'), 'utf8'))
  const sources = JSON.parse(await fs.readFile(path.join(folder, 'sources.json'), 'utf8'))
  const archive = path.join(root, sources.archive)
  const output = path.join(root, 'web/public/images/marketing/tool-showcase')
  await fs.mkdir(archive, { recursive: true })
  await fs.mkdir(output, { recursive: true })
  const assets = []
  for (const asset of plan.assets) {
    const entry = sources.assets.find((item) => item.id === asset.id)
    if (!entry) throw new Error(`No generated source for ${asset.id}`)
    const original = path.join(archive, `${asset.id}.png`)
    const input = await fs.readFile(entry.source).catch((error) => {
      if (error.code !== 'ENOENT') throw error
      return fs.readFile(original)
    })
    await fs.writeFile(original, input)
    const metadata = await sharp(input).metadata()
    const info = await sharp(input)
      .resize(1280, 960, { fit: 'cover', position: asset.position || 'centre' })
      .webp({ quality: 84, effort: 6 })
      .toFile(path.join(output, asset.destination))
    assets.push({
      id: asset.id,
      src: `/images/marketing/tool-showcase/${asset.destination}`,
      width: info.width,
      height: info.height,
      bytes: info.size,
      sourceDimensions: [metadata.width, metadata.height],
      sourceSha256: crypto.createHash('sha256').update(input).digest('hex'),
      original: path.relative(root, original),
      referenceId: asset.referenceId || null,
      derivedFrom: asset.derivedFrom || null,
      mode: asset.mode || (asset.referenceId ? 'reference-image-edit' : 'new-generation'),
      disclosure: plan.disclosure,
    })
  }
  await fs.writeFile(
    path.join(folder, 'manifest.json'),
    JSON.stringify({ tool: sources.tool, completed: sources.completed, assets }, null, 2) + '\n',
  )
  console.log(
    JSON.stringify(
      { totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0), assets },
      null,
      2,
    ),
  )
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
