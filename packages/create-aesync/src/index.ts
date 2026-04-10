import {
  cpSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export interface ScaffoldOptions {
  projectName: string
  template: string
  targetDir: string
}

const __dirname = fileURLToPath(new URL('.', import.meta.url))

export const TEMPLATES = ['empty', 'dex', 'token-tracker'] as const
export type TemplateName = (typeof TEMPLATES)[number]

export function getTemplatesDir(): string {
  return resolve(__dirname, '..', 'templates')
}

export function getTemplateDir(template: string): string {
  return join(getTemplatesDir(), template)
}

function replaceInFile(
  filePath: string,
  replacements: Record<string, string>,
): void {
  let content = readFileSync(filePath, 'utf-8')
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replaceAll(placeholder, value)
  }
  writeFileSync(filePath, content)
}

function walkDir(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      files.push(...walkDir(full))
    } else {
      files.push(full)
    }
  }
  return files
}

export async function scaffold(options: ScaffoldOptions): Promise<void> {
  const { projectName, template, targetDir } = options
  const templateDir = getTemplateDir(template)

  if (!existsSync(templateDir)) {
    throw new Error(`Template "${template}" not found at ${templateDir}`)
  }

  cpSync(templateDir, targetDir, { recursive: true })

  const files = walkDir(targetDir)
  for (const file of files) {
    replaceInFile(file, {
      '{{PROJECT_NAME}}': projectName,
    })
  }
}
