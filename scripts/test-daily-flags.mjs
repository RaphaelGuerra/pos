import { computeDailyFlags, buildLLMInputs } from '../src/lib/dailyFlags.js'

// Example from spec
const receipts = [
  { id: 'r1', amount_brl: 400.0 },
  { id: 'r2', amount_raw: '120,00' },
]
const extract = { total_amount_brl: 520.0, transaction_count: 2 }
const context = { date: '2012-03-11', currency: 'BRL' }

const verdict = computeDailyFlags({ receipts, extract, context })
console.log(JSON.stringify(verdict, null, 2))

// Show normalized inputs you can feed into your LLM prompt
const llmInputs = buildLLMInputs(receipts, extract, context)
console.log('\n--- LLM INPUTS ---')
console.log(JSON.stringify(llmInputs, null, 2))

