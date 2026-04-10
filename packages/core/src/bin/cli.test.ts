import { Command } from 'commander'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { registerCodegen } from './commands/codegen.js'
import { registerDb } from './commands/db.js'
import { registerDev } from './commands/dev.js'
import { registerServe } from './commands/serve.js'
import { registerStart } from './commands/start.js'

function createProgram(): Command {
  const program = new Command()
  program.name('ae-sync').version('0.0.1').exitOverride()
  registerDev(program)
  registerStart(program)
  registerServe(program)
  registerCodegen(program)
  registerDb(program)
  return program
}

describe('CLI', () => {
  describe('command registration', () => {
    it('registers all expected commands', () => {
      const program = createProgram()
      const names = program.commands.map((c) => c.name())
      expect(names).toContain('dev')
      expect(names).toContain('start')
      expect(names).toContain('serve')
      expect(names).toContain('codegen')
      expect(names).toContain('db')
    })

    it('registers db subcommands', () => {
      const program = createProgram()
      const dbCmd = program.commands.find((c) => c.name() === 'db')
      expect(dbCmd).toBeDefined()
      const subNames = dbCmd!.commands.map((c) => c.name())
      expect(subNames).toContain('list')
      expect(subNames).toContain('reset')
    })
  })

  describe('help output', () => {
    it('includes all command names in help', () => {
      const program = createProgram()
      const help = program.helpInformation()
      expect(help).toContain('dev')
      expect(help).toContain('start')
      expect(help).toContain('serve')
      expect(help).toContain('codegen')
      expect(help).toContain('db')
    })

    it('includes program name and description', () => {
      const program = createProgram()
      const help = program.helpInformation()
      expect(help).toContain('ae-sync')
    })
  })

  describe('version output', () => {
    it('outputs version when --version is passed', () => {
      const program = createProgram()
      let versionOutput = ''
      program.configureOutput({
        writeOut: (str) => {
          versionOutput = str
        },
      })
      try {
        program.parse(['--version'], { from: 'user' })
      } catch {
        // exitOverride throws
      }
      expect(versionOutput.trim()).toBe('0.0.1')
    })
  })

  describe('dev command options', () => {
    it('has correct default port', () => {
      const program = createProgram()
      const devCmd = program.commands.find((c) => c.name() === 'dev')
      expect(devCmd).toBeDefined()
      const portOpt = devCmd!.options.find((o) => o.long === '--port')
      expect(portOpt).toBeDefined()
      expect(portOpt!.defaultValue).toBe('42069')
    })

    it('has correct default hostname', () => {
      const program = createProgram()
      const devCmd = program.commands.find((c) => c.name() === 'dev')
      const hostnameOpt = devCmd!.options.find((o) => o.long === '--hostname')
      expect(hostnameOpt).toBeDefined()
      expect(hostnameOpt!.defaultValue).toBe('localhost')
    })

    it('has verbose flag', () => {
      const program = createProgram()
      const devCmd = program.commands.find((c) => c.name() === 'dev')
      const verboseOpt = devCmd!.options.find((o) => o.long === '--verbose')
      expect(verboseOpt).toBeDefined()
    })

    it('has config option', () => {
      const program = createProgram()
      const devCmd = program.commands.find((c) => c.name() === 'dev')
      const configOpt = devCmd!.options.find((o) => o.long === '--config')
      expect(configOpt).toBeDefined()
    })
  })

  describe('start command options', () => {
    it('has correct default hostname for production', () => {
      const program = createProgram()
      const startCmd = program.commands.find((c) => c.name() === 'start')
      const hostnameOpt = startCmd!.options.find((o) => o.long === '--hostname')
      expect(hostnameOpt).toBeDefined()
      expect(hostnameOpt!.defaultValue).toBe('0.0.0.0')
    })
  })

  describe('start command DATABASE_URL check', () => {
    let originalEnv: string | undefined

    beforeEach(() => {
      originalEnv = process.env.DATABASE_URL
    })

    it('rejects when DATABASE_URL is not set', async () => {
      delete process.env.DATABASE_URL
      const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {
        throw new Error('process.exit called')
      }) as never)
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      const { registerStart: register } = await import('./commands/start.js')
      const program = new Command()
      program.exitOverride()
      register(program)

      const startCmd = program.commands.find((c) => c.name() === 'start')
      expect(startCmd).toBeDefined()

      try {
        await startCmd!.parseAsync([], { from: 'user' })
      } catch {
        // Expected — process.exit throws
      }

      expect(exitSpy).toHaveBeenCalledWith(1)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('DATABASE_URL'),
      )

      exitSpy.mockRestore()
      errorSpy.mockRestore()
      if (originalEnv !== undefined) {
        process.env.DATABASE_URL = originalEnv
      }
    })
  })

  describe('serve command', () => {
    it('has correct default port', () => {
      const program = createProgram()
      const serveCmd = program.commands.find((c) => c.name() === 'serve')
      expect(serveCmd).toBeDefined()
      const portOpt = serveCmd!.options.find((o) => o.long === '--port')
      expect(portOpt!.defaultValue).toBe('42069')
    })
  })

  describe('db reset command', () => {
    it('requires --confirm flag', () => {
      const program = createProgram()
      const dbCmd = program.commands.find((c) => c.name() === 'db')
      const resetCmd = dbCmd!.commands.find((c) => c.name() === 'reset')
      expect(resetCmd).toBeDefined()
      const confirmOpt = resetCmd!.options.find((o) => o.long === '--confirm')
      expect(confirmOpt).toBeDefined()
    })
  })
})
