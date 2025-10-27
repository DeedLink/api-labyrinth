import type { VercelRequest, VercelResponse } from '@vercel/node';

const SERVICE_MAP: Record<string, string> = {
  'user-service': process.env.USER_SERVICE_URL || 'http://3.22.114.51:5000',
  'deed-service': process.env.DEED_SERVICE_URL || 'http://3.22.114.51:5005',
  'pinata-service': process.env.PINATA_SERVICE_URL || 'http://3.22.114.51:5002',
  'survey-plan': process.env.SURVEY_PLAN_SERVICE_URL || 'http://3.22.114.51:5003',
  'transaction-service': process.env.TRANSACTION_SERVICE_URL || 'http://3.22.114.51:5004',
};

const SERVICE_MAP_PASSWORD = process.env.SERVICE_MAP_PASSWORD || 'Y26hngoEzg8QVCVuYDUa9wD7';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Enable CORS for all origins - MUST be set before any other logic
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-service-map-password');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight requests IMMEDIATELY
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Verify password - but allow OPTIONS through
    const providedPassword = req.headers['x-service-map-password'];
    if (!providedPassword || providedPassword !== SERVICE_MAP_PASSWORD) {
      console.error('Password mismatch:', { providedPassword, expected: SERVICE_MAP_PASSWORD });
      return res.status(401).json({ error: 'Unauthorized: Invalid service map password' });
    }

    // Extract path segments
    const { path } = req.query;
    
    if (!path || !Array.isArray(path) || path.length === 0) {
      return res.status(400).json({ error: 'Invalid path' });
    }

    // First segment is the service name
    const serviceName = path[0];
    const targetService = SERVICE_MAP[serviceName];

    if (!targetService) {
      return res.status(404).json({ error: `Service not found: ${serviceName}` });
    }

    // Reconstruct the remaining path
    const remainingPath = path.slice(1).join('/');
    const targetUrl = `${targetService}/${remainingPath}`;

    // Build query string
    const queryString = new URLSearchParams(req.query as Record<string, string>).toString();
    const fullUrl = queryString ? `${targetUrl}?${queryString}` : targetUrl;

    console.log(`Proxying ${req.method} request to: ${fullUrl}`);

    // Forward the request
    const headers: Record<string, string> = {
      'Content-Type': req.headers['content-type'] || 'application/json',
    };

    // Forward Authorization header if present
    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization as string;
    }

    const fetchOptions: RequestInit = {
      method: req.method,
      headers,
    };

    // Add body for non-GET requests
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.headers['content-type']?.includes('multipart/form-data')) {
        // For multipart, we need to pass the body as-is
        // Note: This requires special handling in serverless functions
        fetchOptions.body = JSON.stringify(req.body);
      } else {
        fetchOptions.body = JSON.stringify(req.body);
      }
    }

    const response = await fetch(fullUrl, fetchOptions);
    const data = await response.text();

    // Set response headers
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
    return res.status(500).json({ 
      error: 'Internal server error', 
      message: error.message 
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