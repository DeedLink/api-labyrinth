import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVICE_MAP: Record<string, string> = {
  'user-service': process.env.USER_SERVICE_URL || 'http://3.22.114.51:5000',
  'deed-service': process.env.DEED_SERVICE_URL || 'http://3.22.114.51:5005',
  'pinata-service': process.env.PINATA_SERVICE_URL || 'http://3.22.114.51:5002',
  'survey-plan': process.env.SURVEY_PLAN_SERVICE_URL || 'http://3.22.114.51:5003',
  'transaction-service': process.env.TRANSACTION_SERVICE_URL || 'http://3.22.114.51:5004',
};

const SERVICE_MAP_PASSWORD = process.env.SERVICE_MAP_PASSWORD || 'Y26hngoEzg8QVCVuYDUa9wD7';

// Helper function to set CORS headers
function setCorsHeaders(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-service-map-password');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Set CORS headers for ALL requests
  setCorsHeaders(res);

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    console.log('OPTIONS request received - sending CORS headers');
    return res.status(200).end();
  }

  console.log('Request received:', {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'present' : 'missing',
      'x-service-map-password': req.headers['x-service-map-password'] ? 'present' : 'missing',
    }
  });

  try {
    // Verify password
    const providedPassword = req.headers['x-service-map-password'];
    
    if (!providedPassword) {
      console.error('Missing x-service-map-password header');
      return res.status(401).json({ 
        error: 'Unauthorized: Missing service map password',
        hint: 'Add x-service-map-password header to your request'
      });
    }

    if (providedPassword !== SERVICE_MAP_PASSWORD) {
      console.error('Invalid password provided');
      return res.status(401).json({ 
        error: 'Unauthorized: Invalid service map password'
      });
    }

    // Extract path segments
    const { path, ...queryParams } = req.query;
    
    if (!path || !Array.isArray(path) || path.length === 0) {
      console.error('Invalid path:', path);
      return res.status(400).json({ 
        error: 'Invalid path',
        hint: 'URL should be like /api/proxy/service-name/endpoint'
      });
    }

    // First segment is the service name
    const serviceName = path[0];
    const targetService = SERVICE_MAP[serviceName];

    if (!targetService) {
      console.error('Service not found:', serviceName);
      return res.status(404).json({ 
        error: `Service not found: ${serviceName}`,
        availableServices: Object.keys(SERVICE_MAP)
      });
    }

    // Reconstruct the remaining path
    const remainingPath = path.slice(1).join('/');
    const targetUrl = `${targetService}/${remainingPath}`;

    // Build query string (exclude 'path' from query params)
    const queryString = new URLSearchParams(queryParams as Record<string, string>).toString();
    const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

    console.log(`Proxying ${req.method} to: ${fullUrl}`);

    // Prepare headers for backend request
    const headers: Record<string, string> = {};
    
    // Forward content-type
    if (req.headers['content-type']) {
      headers['Content-Type'] = req.headers['content-type'] as string;
    }

    // Forward Authorization header
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization as string;
    }

    // Prepare fetch options
    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    // Add body for non-GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      if (typeof req.body === 'string') {
        fetchOptions.body = req.body;
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    // Make request to backend
    const response = await fetch(fullUrl, fetchOptions);
    
    console.log(`Backend responded with status: ${response.status}`);

    // Get response data
    const data = await response.text();

    // Set response status
    res.status(response.status);
    
    // Forward content-type from backend
    const contentType = response.headers.get('content-type');
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Try to parse as JSON, otherwise send as text
    try {
      const jsonData = JSON.parse(data);
      return res.json(jsonData);
    } catch {
      return res.send(data);
    }

  } catch (error: any) {
    console.error('Proxy error:', error);
    
    // Make sure CORS headers are set even for errors
    setCorsHeaders(res);
    
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};