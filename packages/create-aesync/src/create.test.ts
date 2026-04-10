import { existsSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TEMPLATES, getTemplateDir, scaffold } from './index.js'

function makeTmpDir(): string {
  const dir = join(
    tmpdir(),
    `create-aesync-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  return dir
}

describe('CLI arg parsing', () => {
  it('should parse project name from positional arg', async () => {
    const { parseArgs } = await import('./cli.js')
    const result = parseArgs(['node', 'create-aesync', 'my-project'])
    expect(result.projectName).toBe('my-project')
    expect(result.template).toBeUndefined()
  })

  it('should parse --template flag', async () => {
    const { parseArgs } = await import('./cli.js')
    const result = parseArgs([
      'node',
      'create-aesync',
      'my-project',
      '--template',
      'dex',
    ])
    expect(result.projectName).toBe('my-project')
    expect(result.template).toBe('dex')
  })

  it('should parse -t shorthand', async () => {
    const { parseArgs } = await import('./cli.js')
    const result = parseArgs([
      'node',
      'create-aesync',
      'my-project',
      '-t',
      'token-tracker',
    ])
    expect(result.projectName).toBe('my-project')
    expect(result.template).toBe('token-tracker')
  })

  it('should return undefined for missing args', async () => {
    const { parseArgs } = await import('./cli.js')
    const result = parseArgs(['node', 'create-aesync'])
    expect(result.projectName).toBeUndefined()
    expect(result.template).toBeUndefined()
  })
})

describe('package manager detection', () => {
  it('should detect pnpm', async () => {
    const { detectPackageManager } = await import('./cli.js')
    const original = process.env.npm_config_user_agent
    process.env.npm_config_user_agent = 'pnpm/8.0.0 node/v18.0.0'
    expect(detectPackageManager()).toBe('pnpm')
    process.env.npm_config_user_agent = original
  })

  it('should detect yarn', async () => {
    const { detectPackageManager } = await import('./cli.js')
    const original = process.env.npm_config_user_agent
    process.env.npm_config_user_agent = 'yarn/1.22.0 node/v18.0.0'
    expect(detectPackageManager()).toBe('yarn')
    process.env.npm_config_user_agent = original
  })

  it('should default to npm', async () => {
    const { detectPackageManager } = await import('./cli.js')
    const original = process.env.npm_config_user_agent
    delete process.env.npm_config_user_agent
    expect(detectPackageManager()).toBe('npm')
    process.env.npm_config_user_agent = original
  })
})

describe('scaffold', () => {
  let targetDir: string

  beforeEach(() => {
    targetDir = makeTmpDir()
  })

  afterEach(() => {
    if (existsSync(targetDir)) {
      rmSync(targetDir, { recursive: true, force: true })
    }
  })

  it('should create expected files for empty template', async () => {
    await scaffold({
      projectName: 'test-project',
      template: 'empty',
      targetDir,
    })

    expect(existsSync(join(targetDir, 'package.json'))).toBe(true)
    expect(existsSync(join(targetDir, 'aesync.config.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'schema.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(targetDir, 'src', 'index.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'src', 'api', 'index.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'abis', 'MyContract.json'))).toBe(true)
    expect(existsSync(join(targetDir, '.env.example'))).toBe(true)
    expect(existsSync(join(targetDir, '.gitignore'))).toBe(true)
    expect(existsSync(join(targetDir, 'README.md'))).toBe(true)
    expect(existsSync(join(targetDir, 'aesync-env.d.ts'))).toBe(true)
  })

  it('should replace project name placeholder', async () => {
    await scaffold({
      projectName: 'my-cool-dapp',
      template: 'empty',
      targetDir,
    })

    const pkg = readFileSync(join(targetDir, 'package.json'), 'utf-8')
    expect(pkg).toContain('"name": "my-cool-dapp"')
    expect(pkg).not.toContain('{{PROJECT_NAME}}')

    const readme = readFileSync(join(targetDir, 'README.md'), 'utf-8')
    expect(readme).toContain('my-cool-dapp')
    expect(readme).not.toContain('{{PROJECT_NAME}}')

    const env = readFileSync(join(targetDir, '.env.example'), 'utf-8')
    expect(env).toContain('my-cool-dapp')
    expect(env).not.toContain('{{PROJECT_NAME}}')
  })

  it('should create expected files for dex template', async () => {
    await scaffold({ projectName: 'dex-indexer', template: 'dex', targetDir })

    expect(existsSync(join(targetDir, 'src', 'factory.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'src', 'pair.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'abis', 'PairFactory.json'))).toBe(true)
    expect(existsSync(join(targetDir, 'abis', 'Pair.json'))).toBe(true)
  })

  it('should create expected files for token-tracker template', async () => {
    await scaffold({
      projectName: 'tracker',
      template: 'token-tracker',
      targetDir,
    })

    expect(existsSync(join(targetDir, 'src', 'index.ts'))).toBe(true)
    expect(existsSync(join(targetDir, 'abis', 'Token.json'))).toBe(true)
    expect(existsSync(join(targetDir, 'schema.ts'))).toBe(true)
  })

  it('should produce valid JSON in template files', async () => {
    for (const template of TEMPLATES) {
      const dir = makeTmpDir()
      try {
        await scaffold({ projectName: 'json-test', template, targetDir: dir })

        const pkg = readFileSync(join(dir, 'package.json'), 'utf-8')
        expect(() => JSON.parse(pkg)).not.toThrow()

        const tsconfig = readFileSync(join(dir, 'tsconfig.json'), 'utf-8')
        expect(() => JSON.parse(tsconfig)).not.toThrow()
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
  })

  it('should throw for unknown template', async () => {
    await expect(
      scaffold({ projectName: 'test', template: 'nonexistent', targetDir }),
    ).rejects.toThrow('Template "nonexistent" not found')
  })

  it('should verify all template directories exist', () => {
    for (const template of TEMPLATES) {
      const dir = getTemplateDir(template)
      expect(existsSync(dir)).toBe(true)
    }
  })
})
