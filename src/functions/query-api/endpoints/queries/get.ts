// @filename: query-api/endpoints/queries/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { SavedQuery } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { secureEndpoint } from '~/utils/protect';
import { readItem } from '~/utils/cosmos/utils';

import { ok } from '~/utils/response';
import { getRequestContext } from '~/utils/context';

/**
 * HTTP Trigger to get a saved query by ID
 * GET /api/v1/query/saved/{id}
 */
const GetSavedQueryHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:data:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const queryId = request.params.id;
                  
      // Get user ID from request context
      const { project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required');
      }
      
      if (!queryId) {
        return badRequest('Query ID is required');
      }

      // Get saved query from Cosmos DB
      const savedQuery = await readItem<SavedQuery>('queries', queryId);
      
      if (!savedQuery) {
        return notFound('Saved query', queryId);
      }
      
      // Verify the query belongs to the specified project
      if (savedQuery.projectId !== project.id) {
        return notFound('Saved query', queryId);
      }

      return ok(savedQuery);
    } catch (error) {
      context.error('Error getting saved query:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetSavedQuery",
  Route: "v1/query/saved/{id}",
  Handler: GetSavedQueryHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string, id: string },
  Output: {} as SavedQuery,
};