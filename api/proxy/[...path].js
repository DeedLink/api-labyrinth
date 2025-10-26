export const config = { runtime: 'edge' }

function getServiceMap() {
  try {
    return JSON.parse(process.env.SERVICE_MAP || '{}')
  } catch (error) {
    console.error('Failed to parse SERVICE_MAP:', error)
    return {}
  }
}

export default async function handler(req) {
  const url = new URL(req.url)
  
  // Extract path after /api/proxy/
  const fullPath = url.pathname.replace('/api/proxy/', '')
  const pathParts = fullPath.split('/').filter(Boolean)

  if (pathParts.length === 0) {
    return new Response('Service key missing in path', { status: 400 })
  }

  const serviceKey = pathParts[0]
  const servicePath = pathParts.slice(1).join('/')

  // Password check
  const password = req.headers.get('x-service-map-password') || ''
  if (process.env.SERVICE_MAP_PASSWORD && password !== process.env.SERVICE_MAP_PASSWORD) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { 
      status: 401, 
      headers: { 'content-type': 'application/json' } 
    })
  }

  // Get service mapping
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

  // Construct target URL
  const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
  const cleanServicePath = servicePath.replace(/^\/+/, '')
  const targetUrl = cleanServicePath 
    ? `${cleanBaseUrl}/${cleanServicePath}${url.search}`
    : `${cleanBaseUrl}${url.search}`

  console.log('Proxying:', { serviceKey, targetUrl })

  // Prepare headers
  const headers = new Headers(req.headers)
  headers.delete('host')
  headers.delete('connection')
  headers.delete('content-length')
  headers.delete('x-service-map-password')

  // Prepare body
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