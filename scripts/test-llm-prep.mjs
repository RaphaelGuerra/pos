import { prepareDayInput } from '../src/lib/llmPrep.js'
import { parsePtbrAmount } from '../src/lib/money.js'

function print(title, obj) {
  console.log(`\n=== ${title} ===`)
  console.log(JSON.stringify(obj, null, 2))
}

// Case 1: mirrors the README/Python example
{
  const receipts = [
    { id: 'r1', value: 400.0 },
    { id: 'r2', value_raw: '120,00' },
  ]
  const extract = { total_amount_brl: 520.0, transaction_count: 2 }
  const context = { date: '2012-03-11', currency: 'BRL' }
  const prepared = prepareDayInput(receipts, extract, context)
  print('Example parity', prepared)
}

// Case 2: mixed inputs + invalid raw
{
  const receipts = [
    { id: 'a', amount_brl: '1.234,56' },
    { id: 'b', amount_raw: 'R$ abc' }, // invalid
    { id: 'c', value: '89,9' },
    { id: 'd', value: '-10,00' },
  ]
  const extract = { total_amount_brl: '1.314,56', transaction_count: '4' }
  const prepared = prepareDayInput(receipts, extract, { date: '2025-09-20' })
  print('Mixed + invalid', prepared)
}

// Case 3: parser edge cases
{
  const samples = [
    'R$ 1.234,56',
    '12,34',
    '1.234',
    '0,00',
    ' -5,10 ',
    'abc',
  ]
  const results = Object.fromEntries(samples.map(s => [s, parsePtbrAmount(s)]))
  print('Parser samples', results)
}

