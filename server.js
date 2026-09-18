import http from 'node:http';
import { URL } from 'node:url';
import handler from './api/cw-bypass.js';

const port = Number(process.env.PORT) || 3000;

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

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
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