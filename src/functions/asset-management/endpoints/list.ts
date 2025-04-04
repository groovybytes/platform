// @filename: asset-management/endpoints/list.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { getAssetsByProject } from '~/utils/cosmos/helpers';
import { badRequest, handleApiError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list all assets for a project
 * GET /api/v1/assets
 */
const ListAssetsHandler = secureEndpoint(
  {
    permissions: "project:*:assets:read:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get project ID from request context
      const { project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Get assets from database
      const assets = await getAssetsByProject(project.id);
      
      return ok({
        count: assets.length,
        assets: assets
      });
    } catch (error) {
      context.error('Error listing assets:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'ListAssets',
  Route: 'v1/assets',
  Handler: ListAssetsHandler,
  Methods: ['GET'] as HttpMethod[],
  Input: {} as Record<string, never>,
  Output: {} as { count: number, assets: Asset[] },
};