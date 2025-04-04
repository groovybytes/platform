// @filename: asset-management/endpoints/update.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { readItem, replaceItem } from '~/utils/cosmos/utils';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

interface UpdateAssetBody {
  name?: string;
  status?: Asset['status'];
  metadata?: Record<string, any>;
}

/**
 * HTTP Trigger to update an asset
 * PATCH /api/v1/assets/{id}
 */
const UpdateAssetHandler = secureEndpoint(
  {
    permissions: "project:*:assets:update:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get project ID from request context
      const { project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Get asset ID from route parameters
      const req = request as HttpRequest;
      const assetId = req.params.id;
      
      if (!assetId) {
        return badRequest('Asset ID is required');
      }
      
      // Parse request body
      const body = await req.json() as UpdateAssetBody;
      
      // Validate request body
      if (!body || Object.keys(body).length === 0) {
        return badRequest('Request body is required with at least one field to update');
      }
      
      // Get existing asset
      const existingAsset = await readItem<Asset>('assets', assetId, project.id);
      
      if (!existingAsset) {
        return notFound('Asset', assetId);
      }
      
      // Update allowed fields
      const now = new Date().toISOString();
      const updatedAsset: Asset = {
        ...existingAsset,
        name: body.name !== undefined ? body.name : existingAsset.name,
        status: body.status !== undefined ? body.status : existingAsset.status,
        metadata: body.metadata !== undefined ? { ...existingAsset.metadata, ...body.metadata } : existingAsset.metadata,
        modifiedAt: now,
        // We should get the user from the auth context in a real implementation
        modifiedBy: 'system' 
      };
      
      // Save updated asset
      const savedAsset = await replaceItem<Asset>('assets', assetId, updatedAsset, project.id);
      
      return ok({
        asset: savedAsset,
        message: 'Asset updated successfully'
      });
    } catch (error) {
      context.error('Error updating asset:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'UpdateAsset',
  Route: 'v1/assets/{id}',
  Handler: UpdateAssetHandler,
  Methods: ['PATCH'] as HttpMethod[],
  Input: {} as { id: string } & UpdateAssetBody,
  Output: {} as { asset: Asset, message: string },
};