// @filename: functions/AssetManagement/endpoints/delete.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { deleteItem, readItem } from '~/utils/cosmos/utils';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { deleteAssetBlob } from '~/utils/assets';
import { noContent } from '~/utils/response';

/**
 * HTTP Trigger to delete an asset
 * DELETE /api/v1/assets/{id}
 */
const DeleteAssetHandler = secureEndpoint(
  {
    permissions: "project:*:assets:delete:allow",
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
      
      // Get asset to check if it exists and to get blob name
      const asset = await readItem<Asset>('assets', assetId, project.id);
      
      if (!asset) {
        return notFound('Asset', assetId);
      }
      
      // Delete blob from storage
      const blobDeleted = await deleteAssetBlob(project.id, asset.url);
      
      if (!blobDeleted) {
        context.warn(`Failed to delete asset blob, but continuing with database deletion`);
      }
      
      // Delete from database
      await deleteItem('assets', assetId, project.id);
      
      return noContent();
    } catch (error) {
      context.error('Error deleting asset:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'DeleteAsset',
  Route: 'v1/assets/{id}',
  Handler: DeleteAssetHandler,
  Methods: ['DELETE'] as HttpMethod[],
  Input: {} as { id: string },
  Output: void 0 as void,
};