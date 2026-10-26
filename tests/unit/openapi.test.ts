import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Contract first (CLAUDE.md §10) : chaque route Next.js et chacune de ses
// méthodes figurent dans docs/api/openapi.yaml, et réciproquement.

const ROOT = join(__dirname, '..', '..')
const API_DIR = join(ROOT, 'src', 'app', 'api')
const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return routeFiles(path)
    return name === 'route.ts' ? [path] : []
  })
}

function implemented(): string[] {
  return routeFiles(API_DIR)
    .filter((file) => !file.includes(`${sep}auth${sep}`)) // NextAuth, hors contrat
    .flatMap((file) => {
      const path = '/' + relative(join(ROOT, 'src', 'app'), file).split(sep).slice(0, -1).join('/')
      const openApiPath = path.replace(/\[(\w+)\]/g, '{$1}')
      const source = readFileSync(file, 'utf8')
      return METHODS.filter((method) =>
        new RegExp(`export (const|async function|function) ${method.toUpperCase()}\\b`).test(source)
      ).map((method) => `${method.toUpperCase()} ${openApiPath}`)
    })
    .sort()
}

function documented(): string[] {
  const spec = readFileSync(join(ROOT, 'docs', 'api', 'openapi.yaml'), 'utf8')
  const operations: string[] = []
  let currentPath: string | null = null
  for (const line of spec.split('\n')) {
    const path = /^ {2}(\/api\/\S+):\s*$/.exec(line)
    if (path) currentPath = path[1]
    else if (/^\S/.test(line)) currentPath = null
    const method = /^ {4}(get|post|put|patch|delete):\s*$/.exec(line)
    if (currentPath && method) operations.push(`${method[1].toUpperCase()} ${currentPath}`)
  }
  return operations.sort()
}

describe('contrat OpenAPI', () => {
  it('documente exactement les routes implémentées', () => {
    expect(documented()).toEqual(implemented())
  })
})
