export const config = { runtime: 'edge' }

function getServiceMap() {
  try {
    return JSON.parse(process.env.SERVICE_MAP)
  } catch {
    return {}
  }
}

export default async function (req) {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)

  if (pathParts.length < 2)
    return new Response('Service key missing in path', { status: 400 })

  const serviceKey = pathParts[1]
  const servicePath = pathParts.slice(2).join('/')

  const password = req.headers.get('x-service-map-password') || ''
  if (process.env.SERVICE_MAP_PASSWORD && password !== process.env.SERVICE_MAP_PASSWORD)
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { 'content-type': 'application/json' } 
    })

  const serviceMap = getServiceMap()
  const baseUrl = serviceMap[serviceKey]
  if (!baseUrl)
    return new Response(JSON.stringify({ error: 'No mapping found', serviceKey }), { 
      status: 502, 
      headers: { 'content-type': 'application/json' } 
    })

  const targetUrl = [baseUrl.replace(/\/$/, ''), servicePath.replace(/^\/+/, '')].join('/') + url.search

  const headers = Object.fromEntries(req.headers)
  delete headers['host']
  delete headers['connection']
  delete headers['content-length']

  const body = ['GET','HEAD'].includes(req.method) ? undefined : await req.arrayBuffer().catch(() => undefined)

  try {
    const res = await fetch(targetUrl, { method: req.method, headers, body })
    const respHeaders = new Headers(res.headers)
    const respBody = await res.arrayBuffer().catch(() => null)
    return new Response(respBody === null ? null : respBody, { 
      status: res.status, 
      statusText: res.statusText, 
      headers: respHeaders 
    })
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Upstream request failed', details: String(err) }), { 
      status: 502, 
      headers: { 'content-type': 'application/json' } 
    })
  }
}
