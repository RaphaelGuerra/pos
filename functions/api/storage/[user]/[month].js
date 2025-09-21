// Cloudflare Pages Function for syncing month data via KV
// Route: /api/storage/:user/:month
// Bind a KV namespace named POS in your Pages project settings.

export async function onRequest(context) {
  const { request, params, env } = context
  const { user, month } = params
  const key = `${user}/${month}`
  const method = request.method.toUpperCase()

  // Require the space to be pre-provisioned: `space:<SyncID>` must exist.
  const spaceMarkerKey = `space:${user}`
  const spaceExists = await env.POS.get(spaceMarkerKey)
  if (!spaceExists) return new Response('Not Found', { status: 404 })

  if (method === 'GET') {
    const val = await env.POS.get(key)
    return new Response(val || 'null', { headers: { 'Content-Type': 'application/json' } })
  }

  if (method === 'PUT') {
    const text = await request.text()
    try {
      const parsed = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object') throw new Error('Invalid')
    } catch { return new Response('Invalid JSON', { status: 400 }) }
    await env.POS.put(key, text)
    return new Response('', { status: 204 })
  }

  return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, PUT' } })
}
