import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// Garde-fous de l'étape « contrat et front » (ADR 0008), vérifiés à chaque CI :
// - aucune règle ESLint désactivée dans le code ;
// - aucun type de l'API redéclaré côté front : les DTO vivent dans
//   `src/interface/http/dto.ts` et le front les importe.

const ROOT = join(__dirname, '..', '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sourceFiles(path)
    return /\.(ts|tsx|mjs)$/.test(name) ? [path] : []
  })
}

const read = (path: string) => readFileSync(path, 'utf8')
const rel = (path: string) => relative(ROOT, path)

describe('garde-fous du front', () => {
  it('aucun `eslint-disable` dans src/', () => {
    const offenders = sourceFiles(join(ROOT, 'src')).filter((file) => read(file).includes('eslint-disable'))
    expect(offenders.map(rel)).toEqual([])
  })

  it('aucun type de l’API redéclaré dans src/components ou src/app', () => {
    const apiTypeNames = [...read(join(ROOT, 'src/interface/http/dto.ts')).matchAll(/export interface (\w+)/g)].map(
      (match) => match[1]
    )
    const shapes = [...apiTypeNames, 'ExpenseNote', 'CompanyUser', 'Notification', 'ReceiptSuggestion']
    const declaration = new RegExp(`^\\s*(export\\s+)?(interface|type)\\s+(${shapes.join('|')})\\b`, 'm')

    const front = [...sourceFiles(join(ROOT, 'src/components')), ...sourceFiles(join(ROOT, 'src/app'))].filter(
      (file) => !file.includes(`${join('src', 'app', 'api')}`)
    )
    expect(front.filter((file) => declaration.test(read(file))).map(rel)).toEqual([])
  })

  it('le front n’importe de `interface/http` que des types', () => {
    const front = [...sourceFiles(join(ROOT, 'src/components')), ...sourceFiles(join(ROOT, 'src/app'))].filter(
      (file) => !file.includes(join('src', 'app', 'api'))
    )
    const valueImport = /^import\s+(?!type\b)[^;]*from\s+'@\/interface\/http\//m
    expect(front.filter((file) => valueImport.test(read(file))).map(rel)).toEqual([])
  })
})
