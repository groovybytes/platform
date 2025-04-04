// @filename: functions/AssetManagement/endpoints/get.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { readItem } from '~/utils/cosmos/utils';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { generateDownloadUrl } from '~/utils/assets';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get an asset by ID
 * GET /api/v1/assets/{id}
 */
const GetAssetHandler = secureEndpoint(
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
      
      // Get asset ID from route parameters
      const req = request as HttpRequest;
      const assetId = req.params.id;
      
      if (!assetId) {
        return badRequest('Asset ID is required');
      }
      
      // Get asset from database
      const asset = await readItem<Asset>('assets', assetId, project.id);
      
      if (!asset) {
        return notFound('Asset', assetId);
      }
      
      // Generate download URL if asset is ready
      let downloadUrl = null;
      if (asset.status === 'active' && 
          (asset.processingState === 'processed' || asset.processingState === 'validating')) {
        downloadUrl = await generateDownloadUrl(project.id, asset.url);
      }
      
      return ok({
        asset,
        downloadUrl,
        ...(downloadUrl && { expiresIn: '60 minutes' })
      });
    } catch (error) {
      context.error('Error getting asset:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'GetAsset',
  Route: 'v1/assets/{id}',
  Handler: GetAssetHandler,
  Methods: ['GET'] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as { asset: Asset, downloadUrl?: string, expiresIn?: string },
};