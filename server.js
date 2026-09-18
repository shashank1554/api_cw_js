import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { URL } from 'node:url';
import handler from './api/cw-bypass.js';

const port = Number(process.env.PORT) || 3000;
const indexPath = new URL('./public/index.html', import.meta.url);

function createResponseAdapter(response) {
  return {
    setHeader: (name, value) => response.setHeader(name, value),
    status: (code) => {
      response.statusCode = code;
      return {
        end: () => response.end(),
        json: (body) => {
          response.setHeader('Content-Type', 'application/json');
          response.end(JSON.stringify(body));
        },
      };
    },
  };
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);

  if (request.method === 'GET' && requestUrl.pathname === '/') {
    try {
      const page = await readFile(indexPath, 'utf8');
      response.statusCode = 200;
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      return response.end(page);
    } catch (error) {
      console.error('Failed to serve the frontend:', error);
      response.statusCode = 500;
      return response.end('Frontend unavailable');
    }
  }

  if (request.method === 'GET' && requestUrl.pathname === '/health') {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'application/json');
    return response.end(JSON.stringify({ status: 'ok' }));
  }

  if (!['/api/cw-bypass', '/api/cw-bypass.js'].includes(requestUrl.pathname)) {
    response.statusCode = 404;
    return response.end('Not found');
  }

  const adaptedRequest = {
    ...request,
    query: Object.fromEntries(requestUrl.searchParams.entries()),
  };

  handler(adaptedRequest, createResponseAdapter(response)).catch((error) => {
    console.error(error);
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify({ success: false, error: 'Internal server error' }));
    }
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});