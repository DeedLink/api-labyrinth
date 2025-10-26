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

    console.log('Proxying:', { serviceKey, targetUrl })

    const headers = { ...req.headers }
    delete headers.host
    delete headers.connection
    delete headers['content-length']
    delete headers['x-service-map-password']

    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: ['GET', 'HEAD'].includes(req.method) ? undefined : req,
    })

    res.status(response.status)
    response.headers.forEach((value, key) => res.setHeader(key, value))

    const buffer = Buffer.from(await response.arrayBuffer())
    res.send(buffer)
  } catch (err) {
    console.error('Proxy error:', err)
    res.status(502).json({
      error: 'Upstream request failed',
      details: err.message,
    })
  }
}
