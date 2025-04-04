// @filename: query-api/endpoints/queries/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SavedQuery } from '~/types/operational';

import { badRequest, handleApiError } from '~/utils/error';
import { secureEndpoint, type EnhacedLogContext } from '~/utils/protect';

import { getRequestContext } from '~/utils/context';
import { complexQuery } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

interface ListSavedQueriesResponse {
  items: SavedQuery[];
  count: number;
  continuationToken?: string;
}

/**
 * HTTP Trigger to list saved queries for a project
 * GET /api/v1/query/saved
 */
const SavedQueriesHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:data:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
            
    // Get user ID from request context
    const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required');
      }
      
      // Get query parameters
      const limit = parseInt(request.query.get('limit') || '50', 10);
      const continuationToken = request.query.get('continuationToken');
      const category = request.query.get('category');
      
      // Build query
      let query = `SELECT * FROM c WHERE c.projectId = @projectId`;
      const queryParams = [{ name: '@projectId', value: project.id }];
      
      if (category) {
        query += ` AND c.category = @category`;
        queryParams.push({ name: '@category', value: category });
      }
      
      // Add sorting
      query += ` ORDER BY c.lastRunAt DESC`;
      
      // Execute query
      const result = await complexQuery<SavedQuery>('queries', query, queryParams, {
        maxItemCount: limit,
        continuationToken: continuationToken ?? undefined,
      });
      
      // Prepare response
      const response: ListSavedQueriesResponse = {
        items: result.resources,
        count: result.resources.length,
        continuationToken: result.continuationToken
      };

      return ok(response);
    } catch (error) {
      context.error('Error listing saved queries:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "SavedQueries",
  Route: "v1/query/saved",
  Handler: SavedQueriesHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { category?: string, limit?: number, continuationToken?: string },
  Output: {} as ListSavedQueriesResponse,
};