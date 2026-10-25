import { ESLint } from 'eslint'
import { describe, expect, it } from 'vitest'

// Vérifie que le garde-fou d'architecture (eslint.config.mjs) bloque bien les
// imports interdits : si quelqu'un l'affaiblit, ce test échoue
// (docs/adr/0002-architecture-hexagonale.md).

const eslint = new ESLint()

async function restrictedImports(filePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath })
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports')
    .map((message) => message.message)
}

describe("garde-fou d'architecture", () => {
  it.each([
    ['un driver', "import { Pool } from 'pg'"],
    ['le framework', "import type { NextRequest } from 'next/server'"],
    ["l'infrastructure", "import { withUserScope } from '@/lib/db'"],
    ['la couche application', "import type { ExpenseNoteRepository } from '@/application/ports/ExpenseNoteRepository'"],
  ])('interdit au domaine d’importer %s', async (_label, code) => {
    expect(await restrictedImports('src/domain/Example.ts', `${code}\n`)).toHaveLength(1)
  }, 30_000)

  it.each([
    ["l'infrastructure", "import { PostgresExpenseNoteRepository } from '@/infrastructure/postgres/PostgresExpenseNoteRepository'"],
    ["l'infrastructure (chemin relatif)", "import { toExpenseNote } from '../infrastructure/postgres/expenseNoteRow'"],
    ['lib', "import { withUserScope } from '@/lib/db'"],
    ['Next.js', "import type { NextRequest } from 'next/server'"],
    ['pg', "import type { PoolClient } from 'pg'"],
  ])('interdit à la couche application d’importer %s', async (_label, code) => {
    expect(await restrictedImports('src/application/Example.ts', `${code}\n`)).toHaveLength(1)
  }, 30_000)

  it('laisse la couche application dépendre du domaine et de ses ports', async () => {
    const code = [
      "import type { ExpenseNote } from '@/domain/ExpenseNote'",
      "import type { ExpenseNoteRepository } from './ports/ExpenseNoteRepository'",
      '',
    ].join('\n')
    expect(await restrictedImports('src/application/Example.ts', code)).toEqual([])
  }, 30_000)
})
