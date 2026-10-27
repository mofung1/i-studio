import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'

const args = process.argv.slice(2)

if (args[0] === 'compose') {
  process.stdout.write(readFileSync('/opt/istudio/compose.yml', 'utf8'))
  process.exit(0)
}

if (args[0] === 'setup') {
  const image = args[1] || 'mofugn1/istudio:latest'
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._/:@-]*$/.test(image)) {
    console.error('Usage: setup [docker-hub-account/image:tag]')
    process.exit(2)
  }
  console.log([
    `ISTUDIO_IMAGE=${image}`,
    'WEB_PORT=8080',
    'BIND_ADDRESS=0.0.0.0',
    `POSTGRES_PASSWORD=${randomBytes(32).toString('hex')}`,
    'ADMIN_USERNAME=admin',
    `ADMIN_PASSWORD=${randomBytes(24).toString('hex')}`,
    'INSTALL_INSPIRATION=true',
    'SITE_ENV=preview',
    'NEXT_PUBLIC_SITE_URL=',
    '',
  ].join('\n'))
  process.exit(0)
}

const env = { ...process.env }
env.AUTH_TRUSTED_PROXY_CIDRS ??= '127.0.0.1/32'
if (!env.DATABASE_URL && env.POSTGRES_PASSWORD) {
  const database = new URL(`postgresql://${env.POSTGRES_HOST || 'postgres'}:5432/${env.POSTGRES_DB || 'istudio'}`)
  database.username = env.POSTGRES_USER || 'istudio'
  database.password = env.POSTGRES_PASSWORD
  database.searchParams.set('sslmode', 'disable')
  env.DATABASE_URL = database.href
}

const children = new Set()
let stopping = false
let shutdownTimer

function start(command, commandArgs) {
  const child = spawn(command, commandArgs, { env, stdio: 'inherit' })
  children.add(child)
  child.once('error', () => {
    console.error(`Unable to start ${command}`)
    stop(1)
  })
  child.once('exit', (code, signal) => {
    children.delete(child)
    if (!stopping) {
      console.error(`${command} exited (${signal || code}); stopping the application`)
      stop(code || 1)
    }
    if (stopping && children.size === 0) {
      clearTimeout(shutdownTimer)
      process.exit(process.exitCode || 0)
    }
  })
  return child
}

function stop(code) {
  if (stopping) return
  stopping = true
  process.exitCode = code
  for (const child of children) child.kill('SIGTERM')
  if (children.size === 0) process.exit(code)
  shutdownTimer = setTimeout(() => {
    for (const child of children) child.kill('SIGKILL')
    process.exit(code)
  }, 15000)
}

process.once('SIGTERM', () => stop(0))
process.once('SIGINT', () => stop(0))

if (!env.DATABASE_URL) {
  console.error('Set DATABASE_URL or POSTGRES_PASSWORD before starting iStudio')
  process.exit(1)
}

if (args.length) {
  const child = spawn('istudio-server', args, { env, stdio: 'inherit' })
  children.add(child)
  child.once('error', () => {
    console.error('Unable to start istudio-server')
    process.exit(1)
  })
  child.once('exit', (code) => process.exit(stopping ? 0 : (code ?? 1)))
} else {
  if (env.INSTALL_INSPIRATION !== 'false') {
    console.log('Checking the bundled public inspiration library…')
    const bootstrap = spawn('istudio-server', [
      'bootstrap-inspiration', '--catalog', '/opt/istudio/inspiration/catalog.json',
      '--images', '/opt/istudio/inspiration/images',
    ], { env, stdio: 'inherit' })
    children.add(bootstrap)
    bootstrap.once('error', () => {
      console.error('Unable to initialize the bundled inspiration library')
      stop(1)
    })
    const [code] = await once(bootstrap, 'exit')
    children.delete(bootstrap)
    if (stopping || code !== 0) process.exit(stopping ? (process.exitCode || 0) : 1)
  }
  console.log('Starting iStudio API, web and gateway…')
  start('istudio-server', [])
  start(process.execPath, ['/app/server.js'])
  start('caddy', ['run', '--config', '/etc/caddy/Caddyfile', '--adapter', 'caddyfile'])
}
