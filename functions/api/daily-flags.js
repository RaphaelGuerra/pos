// Cloudflare Pages Function: Deterministic daily flags (no LLM)
// Route: POST /api/daily-flags
// Body JSON: { receipts: [...], extract: {...}, context?: {...} }

import { computeDailyFlags } from '../../src/lib/dailyFlags.js'

export async function onRequest(context) {
  const { request } = context
  const method = (request.method || 'GET').toUpperCase()

  if (method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'POST' },
    })
  }

  try {
    const text = await request.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const receipts = Array.isArray(body?.receipts) ? body.receipts : []
    const extract = body?.extract && typeof body.extract === 'object' ? body.extract : {}
    const contextData = body?.context && typeof body.context === 'object' ? body.context : {}

    const verdict = computeDailyFlags({ receipts, extract, context: contextData })

    return new Response(JSON.stringify(verdict), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Error', message: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

