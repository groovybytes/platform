// @filename: query-api/endpoints/save-query.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { SavedQuery } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

import { nanoid } from 'nanoid';
import { createItem, readItem, replaceItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to save (create or update) a query
 * POST /api/v1/query/save/{id?}
 */
const SaveQueryHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:data:create:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const body = await request.json() as SaveQueryRequest;
      const queryId = request.params.id ?? body.id;

      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);

      if (!project || !project?.id) {
        return badRequest('Project ID is required');
      }

      if (!body.name) {
        return badRequest('Query name is required');
      }

      if (!body.sql) {
        return badRequest('SQL query is required');
      }

      const timestamp = new Date().toISOString();

      // Check if this is an update or create
      if (queryId) {
        // This is an update - get the existing query
        const existingQuery = await readItem<SavedQuery>('queries', queryId);

        if (!existingQuery) {
          return notFound('Saved query', queryId);
        }

        // Verify the query belongs to the specified project
        if (existingQuery.projectId !== project.id) {
          return notFound('Saved query', queryId);
        }

        // Update the query
        const updatedQuery: SavedQuery = {
          ...existingQuery,
          name: body.name,
          description: body.description,
          sql: body.sql,
          parameters: body.parameters || existingQuery.parameters,
          category: body.category || existingQuery.category,
          isPublic: body.isPublic !== undefined ? body.isPublic : existingQuery.isPublic,
          modifiedAt: timestamp,
          modifiedBy: userId,
        };

        const result = await replaceItem<SavedQuery>('queries', queryId, updatedQuery);

        return ok(result);
      } else {
        // This is a new query
        const newQuery: SavedQuery = {
          id: nanoid(),
          projectId: project.id,
          name: body.name,
          description: body.description,
          sql: body.sql,
          parameters: body.parameters || [],
          category: body.category || 'general',
          isPublic: body.isPublic !== undefined ? body.isPublic : false,
          runCount: 0,
          createdAt: timestamp,
          createdBy: userId,
          modifiedAt: timestamp,
          modifiedBy: userId
        };

        const result = await createItem<SavedQuery>('queries', newQuery);

        return ok(result);
      }
    } catch (error) {
      context.error('Error saving query:', error);
      return handleApiError(error);
    }
  }
);

interface SaveQueryRequest {
  id?: string; // If provided, update existing query
  name: string;
  description?: string;
  sql: string;
  savedQueryId?: string;
  parameters?: Array<{
    name: string;
    value: string | number | boolean;
    type?: string;
  }>;
  category?: string;
  isPublic?: boolean;
  limit?: number;
}

// Register the HTTP trigger
export default {
  Name: "SaveQuery",
  Route: "v1/query/save/{id?}",
  Handler: SaveQueryHandler,
  Methods: ["POST", "PATCH"] as HttpMethod[],
  Input: {} as SaveQueryRequest,
  Output: {} as SavedQuery,
};