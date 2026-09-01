import { cp, mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

const projectRoot = process.cwd()
const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'waoowaoo-self-hosted-export-'))
const exportRoot = path.join(temporaryRoot, 'source')

const excludedTopLevel = new Set([
  '.git',
  '.generated',
  '.next',
  '.next-verify',
  '.official-content',
  '.runtime',
  'data',
  'docker-logs',
  'ee',
  'logs',
  'node_modules',
  'reports',
  'tmp',
])

function shouldCopy(source) {
  const relative = path.relative(projectRoot, source)
  if (!relative) return true
  const [topLevel] = relative.split(path.sep)
  if (excludedTopLevel.has(topLevel)) return false
  if (topLevel.startsWith('.next')) return false
  if (topLevel.startsWith('.env') && topLevel !== '.env.example') return false
  return true
}

function run(command, args, env) {
  const result = spawnSync(command, args, {
    cwd: exportRoot,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} exited with ${String(result.status)}`)
  }
}

const selfHostedEnvironment = {
  HUSKY: '0',
  NODE_ENV: 'test',
  DEPLOYMENT_EDITION: 'self-hosted',
  PROVIDER_CREDENTIAL_MODE: 'user-key',
  BILLING_MODE: 'OFF',
  STORAGE_TYPE: 'local',
  NEXTAUTH_URL: 'http://localhost:3000',
  NEXTAUTH_SECRET: 'self-hosted-export-verification-secret',
  API_ENCRYPTION_KEY: 'self-hosted-export-verification-key',
  PLATFORM_DEFAULT_ASSISTANT_MODEL: 'openrouter::openai/gpt-5.6-luna',
  PLATFORM_DEFAULT_ANALYSIS_MODEL: 'openrouter::openai/gpt-5.6-luna',
  PLATFORM_DEFAULT_CHARACTER_MODEL: 'openrouter::openai/gpt-image-2',
  PLATFORM_DEFAULT_LOCATION_MODEL: 'openrouter::openai/gpt-image-2',
  PLATFORM_DEFAULT_EDIT_MODEL: 'openrouter::openai/gpt-image-2',
  PLATFORM_DEFAULT_VIDEO_MODEL: 'ark::doubao-seedance-2-0-260128',
  PLATFORM_DEFAULT_MUSIC_MODEL: 'elevenlabs::music_v2',
}

try {
  await cp(projectRoot, exportRoot, { recursive: true, filter: shouldCopy })
  if (existsSync(path.join(exportRoot, 'ee'))) {
    throw new Error('Self-hosted export unexpectedly contains ee/')
  }

  run('npm', ['ci'], selfHostedEnvironment)
  run('npm', ['run', 'check:edition-boundaries'], selfHostedEnvironment)
  run('npm', ['run', 'typecheck:available-editions'], selfHostedEnvironment)
  run('npm', ['run', 'build:verify'], selfHostedEnvironment)
  run('npm', ['run', 'runtime:self-hosted:smoke'], selfHostedEnvironment)
  process.stdout.write('Self-hosted export verified with ee/ physically absent.\n')
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
