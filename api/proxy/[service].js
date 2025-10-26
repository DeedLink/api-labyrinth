export const config = { runtime: 'edge' }

function getServiceMap() {
  try {
    return JSON.parse(process.env.SERVICE_MAP || '{}')
  } catch (error) {
    console.error('Failed to parse SERVICE_MAP:', error)
    return {}
  }
}

export default async function (req) {
  const url = new URL(req.url)
  const pathParts = url.pathname.split('/').filter(Boolean)

  if (pathParts.length < 3 || pathParts[0] !== 'api' || pathParts[1] !== 'proxy') {
    return new Response('Invalid path format. Expected: /api/proxy/{serviceKey}/...', { status: 400 })
  }

  const serviceKey = pathParts[2]
  const servicePath = pathParts.slice(3).join('/')

  const password = req.headers.get('x-service-map-password') || ''
  if (process.env.SERVICE_MAP_PASSWORD && password !== process.env.SERVICE_MAP_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { 'content-type': 'application/json' } 
    })
  }

  const serviceMap = getServiceMap()
  const baseUrl = serviceMap[serviceKey]
  if (!baseUrl) {
    return new Response(JSON.stringify({ 
      error: 'No mapping found', 
      serviceKey,
      availableServices: Object.keys(serviceMap)
    }), { 
      status: 404, 
      headers: { 'content-type': 'application/json' } 
    })
  }

  const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
  const cleanServicePath = servicePath.replace(/^\/+/, '')
  const targetUrl = cleanServicePath 
    ? `${cleanBaseUrl}/${cleanServicePath}${url.search}`
    : `${cleanBaseUrl}${url.search}`

  console.log('Proxying request:', { serviceKey, targetUrl })

  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('content-length')
  headers.delete('x-service-map-password')

  const body = ['GET', 'HEAD'].includes(req.method) 
    ? undefined 
    : await req.arrayBuffer().catch(() => undefined)

  try {
    const res = await fetch(targetUrl, { 
      method: req.method, 
      headers,
      body 
    })
    
    const respHeaders = new Headers(res.headers)
    const respBody = await res.arrayBuffer().catch(() => null)
    
    return new Response(respBody, { 
      status: res.status, 
      statusText: res.statusText, 
      headers: respHeaders 
    })
  } catch (err) {
    console.error('Proxy error:', err)
    return new Response(JSON.stringify({ 
      error: 'Upstream request failed', 
      details: err.message,
      targetUrl 
    }), { 
      status: 502, 
      headers: { 'content-type': 'application/json' } 
    })
  }
}