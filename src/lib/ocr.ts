import path from 'node:path'
import { createWorker } from 'tesseract.js'

const SUPPORTED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const TESSDATA_PATH = path.join(process.cwd(), 'tessdata')

const AMOUNT_KEYWORD_PATTERN = /total|montant|ttc|à payer|net à/i
const CURRENCY_HINT_PATTERN = /€|eur\b/i
const DECIMAL_AMOUNT_PATTERN = /\b\d{1,3}(?:[ .]\d{3})*[.,]\d{2}/g
const INTEGER_AMOUNT_PATTERN = /\b\d{1,5}\b/g

const DATE_PATTERNS = [
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/,
  /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/,
  /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})\b/,
]

const FRENCH_MONTHS: Record<string, number> = {
  janvier: 1,
  fevrier: 2,
  mars: 3,
  avril: 4,
  mai: 5,
  juin: 6,
  juillet: 7,
  aout: 8,
  septembre: 9,
  octobre: 10,
  novembre: 11,
  decembre: 12,
}
const FRENCH_TEXTUAL_DATE_PATTERN = new RegExp(
  `\\b(\\d{1,2})\\s+(${Object.keys(FRENCH_MONTHS).join('|')})\\s+(\\d{4})\\b`,
  'i'
)

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

export interface ExpenseNoteSuggestion {
  amount?: number
  expenseDate?: string
}

function parseAmount(text: string): number | undefined {
  const lines = text.split('\n')
  const keywordLine = lines.find((line) => AMOUNT_KEYWORD_PATTERN.test(line))
  const candidateLines = keywordLine ? [keywordLine] : lines

  const decimalAmounts: number[] = []
  for (const line of candidateLines) {
    for (const match of line.matchAll(DECIMAL_AMOUNT_PATTERN)) {
      const value = Number.parseFloat(match[0].replace(/[ .](?=\d{3})/g, '').replace(',', '.'))
      if (Number.isFinite(value) && value > 0) decimalAmounts.push(value)
    }
  }
  if (decimalAmounts.length > 0) return Math.max(...decimalAmounts)

  const integerAmounts: number[] = []
  for (const line of lines) {
    if (!AMOUNT_KEYWORD_PATTERN.test(line) && !CURRENCY_HINT_PATTERN.test(line)) continue
    for (const match of line.matchAll(INTEGER_AMOUNT_PATTERN)) {
      const value = Number.parseInt(match[0], 10)
      if (Number.isFinite(value) && value > 0) integerAmounts.push(value)
    }
  }
  return integerAmounts.length > 0 ? Math.max(...integerAmounts) : undefined
}

function toIsoDate(year: number, month: number, day: number): string | undefined {
  const date = new Date(Date.UTC(year, month - 1, day))
  const isValid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  return isValid ? date.toISOString().slice(0, 10) : undefined
}

function parseExpenseDate(text: string): string | undefined {
  const ddmmyyyy = text.match(DATE_PATTERNS[0])
  if (ddmmyyyy) {
    const [, day, month, year] = ddmmyyyy
    const iso = toIsoDate(Number(year), Number(month), Number(day))
    if (iso) return iso
  }
  const yyyymmdd = text.match(DATE_PATTERNS[1])
  if (yyyymmdd) {
    const [, year, month, day] = yyyymmdd
    const iso = toIsoDate(Number(year), Number(month), Number(day))
    if (iso) return iso
  }
  const ddmmyy = text.match(DATE_PATTERNS[2])
  if (ddmmyy) {
    const [, day, month, year] = ddmmyy
    const iso = toIsoDate(2000 + Number(year), Number(month), Number(day))
    if (iso) return iso
  }
  const textual = stripAccents(text).match(FRENCH_TEXTUAL_DATE_PATTERN)
  if (textual) {
    const [, day, monthName, year] = textual
    const iso = toIsoDate(Number(year), FRENCH_MONTHS[monthName.toLowerCase()], Number(day))
    if (iso) return iso
  }
  return undefined
}

// Un seul worker Tesseract pour tout le process, créé à la première analyse
// puis réutilisé (charger le modèle coûte plus cher que reconnaître un
// ticket). Les analyses passent l'une après l'autre : au plus un cœur CPU est
// occupé par l'OCR, quel que soit le nombre de demandes (SEC-08, ADR 0007).

type TesseractWorker = Awaited<ReturnType<typeof createWorker>>

let sharedWorker: Promise<TesseractWorker> | null = null
let queue: Promise<unknown> = Promise.resolve()

/** Taille maximale d'une image analysée, en octets (5 Mo). */
export const MAX_OCR_BYTES = 5 * 1024 * 1024

function getWorker(): Promise<TesseractWorker> {
  if (!sharedWorker) {
    sharedWorker = createWorker('fra', undefined, { langPath: TESSDATA_PATH, cacheMethod: 'none' })
    // Si la création échoue, la prochaine analyse retentera.
    sharedWorker.catch(() => {
      sharedWorker = null
    })
  }
  return sharedWorker
}

/** Exécute `task` quand les analyses précédentes sont terminées (concurrence : 1). */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const result = queue.then(task, task)
  queue = result.catch(() => undefined)
  return result
}

/**
 * Reconnaît montant et date sur un reçu.
 * Type non supporté ou image trop grande : suggestion vide, sans analyse.
 * @throws si Tesseract échoue (panne technique) : à l'appelant de décider
 *   s'il retente.
 */
export async function recognizeReceipt(receipt: {
  data: Buffer
  mimeType: string
}): Promise<ExpenseNoteSuggestion> {
  if (!SUPPORTED_MIME_TYPES.includes(receipt.mimeType) || receipt.data.length > MAX_OCR_BYTES) {
    return {}
  }
  return enqueue(async () => {
    const worker = await getWorker()
    try {
      const {
        data: { text },
      } = await worker.recognize(receipt.data)
      return { amount: parseAmount(text), expenseDate: parseExpenseDate(text) }
    } catch (error) {
      // Un worker en erreur n'est pas réutilisé.
      sharedWorker = null
      await worker.terminate().catch(() => {})
      throw error
    }
  })
}

/**
 * Variante tolérante, pour l'ancienne route synchrone : une panne renvoie
 * une suggestion vide plutôt qu'une erreur.
 */
export async function suggestFields(receipt: {
  data: Buffer
  mimeType: string
}): Promise<ExpenseNoteSuggestion> {
  try {
    return await recognizeReceipt(receipt)
  } catch (error) {
    console.error('[ocr] Extraction échouée, suggestion vide renvoyée', error)
    return {}
  }
}
