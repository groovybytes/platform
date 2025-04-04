// @filename: functions/AssetManagement/endpoints/initiate-upload.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Asset } from '~/types/operational';

import { badRequest, handleApiError, serverError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { generateUploadUrl, createAssetRecord } from '~/utils/assets';
import { created } from '~/utils/response';
import { nanoid } from 'nanoid';

/**
 * HTTP Trigger to initiate the upload of a new asset
 * POST /api/v1/assets/upload
 */
const InitiateUploadHandler = secureEndpoint(
  {
    permissions: "project:*:assets:create:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID and project ID from request context
      const { request: { userId }, project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Parse request body
      const data = await request.json() as InitiateUploadInput;
      context.log('Received data:', data);
      
      // Validate required fields
      if (!data.fileName) {
        return badRequest('fileName is required');
      }
      
      // Set default content type if not provided
      const contentType = data.contentType || 'application/octet-stream';
      
      // Generate upload URL for this specific project
      const uploadInfo = await generateUploadUrl(
        project.id,
        data.fileName,
        contentType
      );
      
      if (!uploadInfo) {
        return serverError('Failed to generate upload URL');
      }
      
      // Create timestamp for audit fields
      const timestamp = new Date().toISOString();
      
      // Create asset record in database
      const assetRecord: Asset = {
        id: nanoid(),
        projectId: project.id,
        name: data.fileName,
        type: contentType,
        size: 0, // Will be updated after upload is complete
        url: uploadInfo.blobName, // Store just the blob name (container is derived from projectId)
        status: "active",
        processingState: "uploading",
        processingProgress: 0,
        createdAt: timestamp,
        createdBy: userId,
        modifiedAt: timestamp,
        modifiedBy: userId
      };
      
      const createdAsset = await createAssetRecord(assetRecord);
      
      if (!createdAsset) {
        return serverError('Failed to create asset record');
      }
      
      return created({
        message: 'Upload initiated successfully',
        asset: createdAsset,
        uploadUrl: uploadInfo.uploadUrl,
        expiresIn: '15 minutes'
      });
    } catch (error) {
      context.error('Error initiating upload:', error);
      return handleApiError(error);
    }
  }
);

/**
 * Input for initiating an upload
 */
export interface InitiateUploadInput {
  fileName: string;
  contentType?: string;
}

// Register the HTTP trigger
export default {
  Name: 'InitiateUpload',
  Route: 'v1/assets/upload',
  Handler: InitiateUploadHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as InitiateUploadInput,
  Output: {} as { message: string, asset: Asset, uploadUrl: string, expiresIn: string },
};