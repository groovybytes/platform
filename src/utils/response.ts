// @filename: response.ts
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import type { BodyInit as UndiciBodyInit } from 'undici-types';
import type { HttpResponseInit } from '@azure/functions';
import { Readable } from 'node:stream';

/**
 * Standard API success response format
 */
export interface ApiResponse<T = any> {
  data: T;
  meta?: {
    count?: number;
    total?: number;
    page?: number;
    pageSize?: number;
    [key: string]: any;
  };
  links?: {
    self?: string;
    next?: string;
    prev?: string;
    [key: string]: any;
  };
}

export interface ApiResponseOptions<T = any> {
  status?: number;
  headers?: HeadersInit;
  meta?: ApiResponse['meta'];
  links?: ApiResponse['links'];
}

/**
 * Create a standard success response
 * @param data Response data
 * @param meta Optional metadata
 * @param links Optional navigation links
 * @param status HTTP status code (defaults to 200)
 */
export function createResponse<T = any>(
  data: T,
  opts: ApiResponseOptions = {},
): HttpResponseInit {
  const {
    status = 200,
    headers = {},
    meta,
    links,
  } = opts;

  const response: ApiResponse<T> = {
    data,
    ...(meta && { meta }),
    ...(links && { links })
  };

  // Add default headers
  const _headers = new Headers(headers);
  if (!_headers.get('Content-Type')) {
    _headers.set('Content-Type', 'application/json');
  }

  return {
    status,
    jsonBody: response,
    headers: _headers
  };
}

/**
 * Create a 200 OK response
 * @param data Response data
 * @param meta Optional metadata
 */
export function ok<T = any>(data: T, meta?: ApiResponse['meta']): HttpResponseInit {
  return createResponse(data, { meta });
}

/**
 * Create a 201 Created response
 * @param data Created resource data
 * @param location Optional URL to the created resource
 */
export function created<T = any>(data: T, location?: string): HttpResponseInit {
  return createResponse(data, { 
    status: 201, 
    headers: location ? { Location: location } : {} 
  });
}

/**
 * Create a 202 Accepted response
 * @param message Optional acceptance message
 * @param data Optional data about the accepted request
 */
export function accepted(message: string = 'Request accepted', data?: any): HttpResponseInit {
  return createResponse({
    message,
    ...(data && { data })
  }, { status: 202 });
}

/**
 * Create a 204 No Content response
 */
export function noContent(): HttpResponseInit {
  return createResponse(null, { status: 204 });
}

/**
 * Create a response for paginated collections
 * @param items Collection items
 * @param total Total number of items
 * @param page Current page number
 * @param pageSize Items per page
 * @param baseUrl Base URL for pagination links
 */
export function paginated<T = any>(
  items: T[],
  total: number,
  page: number,
  pageSize: number,
  baseUrl?: string
): HttpResponseInit {
  const meta = {
    count: items.length,
    total,
    page,
    pageSize,
    pageCount: Math.ceil(total / pageSize)
  };

  let links: ApiResponse<T>['links'] = {};
  if (baseUrl) {
    links = {
      self: `${baseUrl}?page=${page}&pageSize=${pageSize}`
    };

    if (page > 1) {
      links.prev = `${baseUrl}?page=${page - 1}&pageSize=${pageSize}`;
    }

    if (page < meta.pageCount) {
      links.next = `${baseUrl}?page=${page + 1}&pageSize=${pageSize}`;
    }
  }

  return createResponse(items, { meta, links });
}

/**
 * Create a 200 OK response with a file download
 * @param content File content
 * @param filename Suggested download filename
 * @param contentType MIME type of the file
 */
export function file(
  content: string | Buffer | Uint8Array,
  filename: string,
  contentType: string
): HttpResponseInit {
  return {
    status: 200,
    body: content,
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  };
}

/**
 * Create a 303 See Other redirect response
 * @param location URL to redirect to
 */
export function redirect(location: string): HttpResponseInit {
  return createResponse(null, {
    status: 303,
    headers: {
      Location: location
    }
  });

}

/**
 * Create a 200 OK response with cache headers
 * @param data Response data
 * @param maxAge Max age in seconds for the cache
 * @param etag Optional ETag for the resource
 */
export function cached<T = any>(
  data: T,
  maxAge: number = 3600,
  etag?: string
): HttpResponseInit {
  return createResponse(data, {
    status: 200,
    headers: {
      'Cache-Control': `max-age=${maxAge}, public`,
      ...(etag && { ETag: etag })
    }
  });
}

/**
 * Create a 304 Not Modified response
 * @param etag Optional ETag for the resource
 */
export function notModified(etag?: string): HttpResponseInit {
  return createResponse(null, {
    status: 304,
    headers: {
      ...(etag && { ETag: etag })
    }
  });
}

/**
 * Create a streaming response
 * @param stream Response stream (Node.js Readable stream, AsyncIterable, Web ReadableStream)
 * @param contentType MIME type of the stream
 */
export function stream(
  stream: Readable | AsyncIterable<Uint8Array> | Iterable<Uint8Array> | ReadableStream<Uint8Array>,
  contentType: string = 'application/octet-stream'
): HttpResponseInit {
  let body: UndiciBodyInit;
  
  // Handle different stream types
  if (stream instanceof ReadableStream) {
    // Convert Web ReadableStream to Node.js Readable
    body = Readable.fromWeb(stream as unknown as NodeReadableStream);
  } else if (stream instanceof Readable) {
    // Use Node.js Readable directly
    body = stream;
  } else {
    // AsyncIterable/Iterable is already compatible with BodyInit
    body = stream;
  }
  
  return {
    status: 200,
    body,
    headers: {
      'Content-Type': contentType,
      'Transfer-Encoding': 'chunked'
    }
  };
}