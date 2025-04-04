// @filename: functions/AssetManagement/endpoints/complete-upload.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { readItem, patchItem } from '~/utils/cosmos/utils';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { getBlockBlobClient } from '~/utils/assets';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to complete an asset upload process
 * POST /api/v1/assets/{id}/complete
 */
const CompleteUploadHandler = secureEndpoint(
  {
    permissions: "project:*:assets:update:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID and project ID from request context
      const { request: { userId }, project } = await getRequestContext(request);
      
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
      
      // Check if asset is in uploading state
      if (asset.processingState !== 'uploading') {
        return badRequest(`Asset is not in 'uploading' state. Current state: ${asset.processingState}`);
      }
      
      // Verify the blob exists and get its properties
      const blockBlobClient = await getBlockBlobClient(project.id, asset.url);
      const exists = await blockBlobClient.exists();
      
      if (!exists) {
        return notFound('Asset blob', asset.url);
      }
      
      // Get blob properties to update the size
      const properties = await blockBlobClient.getProperties();
      
      // Update asset in database
      const now = new Date().toISOString();
      const updatedAsset = await patchItem<Asset>(
        'assets',
        assetId,
        [
          { op: 'replace', path: '/size', value: properties.contentLength },
          { op: 'replace', path: '/processingState', value: 'validating' },
          { op: 'replace', path: '/processingProgress', value: 100 },
          { op: 'replace', path: '/modifiedAt', value: now },
          { op: 'replace', path: '/modifiedBy', value: userId }
        ],
        project.id
      );
      
      // Trigger enrichment process (this would typically be done via an event)
      // For now, we'll just return success
      
      return ok({
        message: 'Upload completed successfully',
        asset: updatedAsset
      });
    } catch (error) {
      context.error('Error completing upload:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'CompleteUpload',
  Route: 'v1/assets/{id}/complete',
  Handler: CompleteUploadHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as { message: string, asset: Asset },
};