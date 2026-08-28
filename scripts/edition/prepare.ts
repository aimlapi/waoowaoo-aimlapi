import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readDeploymentEdition } from '../../src/lib/deployment/edition'

async function main(): Promise<void> {
  const projectRoot = process.cwd()
  const outputDirectory = path.join(projectRoot, '.generated', 'edition')
  const edition = readDeploymentEdition()
  const implementationPath = edition === 'cloud'
    ? 'ee/src/edition/*'
    : 'src/editions/self-hosted/*'

  function createCompilerOptions() {
    return {
      baseUrl: '../..',
      paths: {
        '@/*': ['src/*'],
        '@edition-implementation/*': [implementationPath],
        ...(edition === 'cloud' ? { '@ee/*': ['ee/src/*'] } : {}),
      },
    }
  }

  const applicationConfig = {
    extends: '../../tsconfig.json',
    compilerOptions: createCompilerOptions(),
    include: [
      '../../src/**/*.ts',
      '../../src/**/*.tsx',
      '../../tests/**/*.ts',
      '../../tests/**/*.tsx',
      ...(edition === 'cloud' ? ['../../ee/**/*.ts', '../../ee/**/*.tsx'] : []),
      '../../.next-verify/types/**/*.ts',
      '../../.next/types/**/*.ts',
      '../../next-env.d.ts',
    ],
    exclude: [
      '../../node_modules',
      '../../.next',
      '../../.next-golden',
      '../../.next-security',
      '../../scripts',
      '../../tmp',
      ...(edition === 'self-hosted' ? ['../../ee'] : []),
    ],
  }

  const runtimeScriptsConfig = {
    extends: '../../tsconfig.runtime-scripts.json',
    compilerOptions: createCompilerOptions(),
  }

  const manifest = {
    schemaVersion: 1,
    edition,
    implementationPath,
    source: 'DEPLOYMENT_EDITION',
    nextConfig: edition === 'cloud'
      ? {
          scriptOrigins: ['https://js.stripe.com'],
          frameOrigins: ['https://js.stripe.com', 'https://hooks.stripe.com'],
          imageRemotePatterns: [
            { protocol: 'https', hostname: '**.googleusercontent.com' },
            { protocol: 'https', hostname: '**.ggpht.com' },
          ],
        }
      : {
          scriptOrigins: [],
          frameOrigins: [],
          imageRemotePatterns: [],
        },
  }

  await mkdir(outputDirectory, { recursive: true })
  await Promise.all([
    writeFile(
      path.join(outputDirectory, 'tsconfig.json'),
      `${JSON.stringify(applicationConfig, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(outputDirectory, 'tsconfig.runtime-scripts.json'),
      `${JSON.stringify(runtimeScriptsConfig, null, 2)}\n`,
      'utf8',
    ),
    writeFile(
      path.join(outputDirectory, 'manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    ),
  ])

  process.stdout.write(`Prepared ${edition} edition binding.\n`)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack || error.message : String(error)
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
