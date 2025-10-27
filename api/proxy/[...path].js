export const config = { runtime: 'nodejs' }

function getServiceMap() {
  try {
    return JSON.parse(process.env.SERVICE_MAP || '{}')
  } catch (error) {
    console.error('Failed to parse SERVICE_MAP:', error)
    return {}
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-service-map-password')
  res.setHeader('Access-Control-Max-Age', '86400')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const url = new URL(req.url, `http://${req.headers.host}`)
    const fullPath = url.pathname.replace('/api/proxy/', '')
    const pathParts = fullPath.split('/').filter(Boolean)

    if (pathParts.length === 0) {
      return res.status(400).json({ error: 'Service key missing in path' })
    }

    const serviceKey = pathParts[0]
    const servicePath = pathParts.slice(1).join('/')
    const password = req.headers['x-service-map-password'] || ''

    if (process.env.SERVICE_MAP_PASSWORD && password !== process.env.SERVICE_MAP_PASSWORD) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const serviceMap = getServiceMap()
    const baseUrl = serviceMap[serviceKey]

    if (!baseUrl) {
      return res.status(404).json({
        error: 'No mapping found',
        serviceKey,
        availableServices: Object.keys(serviceMap),
      })
    }

    const cleanBaseUrl = baseUrl.replace(/\/+$/, '')
    const cleanServicePath = servicePath.replace(/^\/+/, '')
    const targetUrl = cleanServicePath
      ? `${cleanBaseUrl}/${cleanServicePath}${url.search}`
      : `${cleanBaseUrl}${url.search}`

    console.log('Proxying:', { serviceKey, method: req.method, targetUrl })

    const forwardHeaders = {}
    const skipHeaders = ['host', 'connection', 'content-length', 'x-service-map-password']
    
    Object.keys(req.headers).forEach(key => {
      if (!skipHeaders.includes(key.toLowerCase())) {
        forwardHeaders[key] = req.headers[key]
      }
    })

    let body = undefined
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.body && Object.keys(req.body).length > 0) {
        body = JSON.stringify(req.body)
        forwardHeaders['content-type'] = 'application/json'
      } else {
        body = await new Promise((resolve) => {
          let data = ''
          req.on('data', chunk => {
            data += chunk
          })
          req.on('end', () => {
            resolve(data || undefined)
          })
        })
      }
    }

    const response = await fetch(targetUrl, {
      method: req.method,
      headers: forwardHeaders,
      body,
    })

    console.log('Response:', { status: response.status, statusText: response.statusText })

    const corsHeaders = ['access-control-allow-origin', 'access-control-allow-methods', 'access-control-allow-headers', 'access-control-max-age']
    response.headers.forEach((value, key) => {
      if (!corsHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value)
      }
    })

    const buffer = Buffer.from(await response.arrayBuffer())
    res.status(response.status).send(buffer)

  } catch (err) {
    console.error('Proxy error:', err)
    res.status(502).json({
      error: 'Upstream request failed',
      details: err.message,
    })
  }
}