// Cloudflare Pages Function for syncing month data via KV
// Route: /api/storage/:user/:month
// Bind a KV namespace named POS in your Pages project settings.

export async function onRequest(context) {
  const { request, params, env } = context
  try {
    const { user, month } = params || {}
    const method = (request.method || 'GET').toUpperCase()

    // Guard: KV binding must be configured as POS
    if (!env || !env.POS || typeof env.POS.get !== 'function') {
      return new Response(JSON.stringify({ error: 'KV binding POS is not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Validate params
    if (!user || !month) {
      return new Response(JSON.stringify({ error: 'Missing user or month' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
    if (!/^\d{4}-\d{2}$/.test(month)) {
      return new Response(JSON.stringify({ error: 'Invalid month format (expected YYYY-MM)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const key = `${user}/${month}`
    const spaceMarkerKey = `space:${user}`

    // Require the space to be pre-provisioned: `space:<SyncID>` must exist.
    const spaceExists = await env.POS.get(spaceMarkerKey)
    if (!spaceExists) {
      return new Response(JSON.stringify({ error: 'Space not provisioned', key: spaceMarkerKey }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (method === 'GET') {
      const val = await env.POS.get(key)
      return new Response(val || 'null', { headers: { 'Content-Type': 'application/json' } })
    }

    if (method === 'PUT') {
      const text = await request.text()
      try {
        const parsed = JSON.parse(text)
        if (!parsed || typeof parsed !== 'object') throw new Error('Invalid')
      } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      await env.POS.put(key, text)
      return new Response('', { status: 204 })
    }

    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', Allow: 'GET, PUT' },
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Internal Error', message: String(err?.message || err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
