// @filename: utils/assets.ts
import type { Asset } from '~/types/operational';

import { BlobSASPermissions, BlobServiceClient, BlockBlobClient, ContainerClient } from '@azure/storage-blob';
import { nanoid } from 'nanoid';

import { createItem, readItem, queryItems, deleteItem,  } from '~/utils/cosmos/utils';
import { updateAssetProcessingState } from '~/utils/cosmos/helpers';

// Cache for blob service client
let blobServiceClient: BlobServiceClient | null = null;
let containerClient: ContainerClient | null = null;

/**
 * Get or create an instance of the Blob Service client
 */
export function getBlobServiceClient(): BlobServiceClient {
  if (!blobServiceClient) {
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    
    // Validate connection string exists
    if (!connectionString) {
      console.error('Azure Storage connection string not found in environment variables');
      throw new Error('Azure Storage connection string not configured');
    }
    
    console.log('Initializing Azure Blob Storage client');
    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  }
  return blobServiceClient;
}

/**
 * Get or create a container client for the assets container
 */
export function getAssetsContainerClient(): ContainerClient {
  if (!containerClient) {
    const containerName = process.env.ASSETS_CONTAINER_NAME || 'assets';
    containerClient = getBlobServiceClient().getContainerClient(containerName);
  }
  return containerClient;
}

/**
 * Get a block blob client for a specific blob
 * @param blobName The name of the blob
 */
export function getBlockBlobClient(blobName: string): BlockBlobClient {
  return getAssetsContainerClient().getBlockBlobClient(blobName);
}

/**
 * Generates a unique blob name for an asset in a specific project
 * @param projectId Project ID
 * @param fileName Original file name
 */
export function generateAssetBlobName(projectId: string, fileName: string): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
  const uniqueId = nanoid(10);
  return `${projectId}/${uniqueId}${extension ? `.${extension}` : ''}`;
}

/**
 * Creates a new asset record in the database
 * @param asset Asset information
 * @returns The created asset or null if failed
 */
export async function createAssetRecord(asset: Asset): Promise<Asset | null> {
  try {
    console.log(`Creating asset record for '${asset.name}' in project '${asset.projectId}'`);
    return await createItem<Asset>('assets', asset);
  } catch (error) {
    console.error(`Failed to create asset record: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Generates a SAS URL for uploading a file directly to blob storage
 * @param projectId Project ID
 * @param fileName Original file name
 * @param contentType MIME type of the file
 * @param expiryMinutes Minutes until the SAS URL expires
 * @returns Object with upload URL and blob name
 */
export async function generateUploadUrl(
  projectId: string,
  fileName: string,
  contentType: string,
  expiryMinutes: number = 15
): Promise<{ uploadUrl: string, blobName: string } | null> {
  try {
    console.log(`Generating upload URL for '${fileName}' in project '${projectId}'`);
    
    // Generate unique blob name
    const blobName = generateAssetBlobName(projectId, fileName);
    
    // Get block blob client
    const blockBlobClient = getBlockBlobClient(blobName);
    
    // Generate SAS URL
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);
    
    const sasUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.from({
        write: true,
        create: true,
      }),
      expiresOn,
      contentType
    });
    
    console.log(`Upload URL generated for blob '${blobName}'`);
    return {
      uploadUrl: sasUrl,
      blobName
    };
  } catch (error) {
    console.error(`Failed to generate upload URL: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Generates a SAS URL for downloading a file from blob storage
 * @param blobName Blob name
 * @param expiryMinutes Minutes until the SAS URL expires
 * @returns Download URL
 */
export async function generateDownloadUrl(
  blobName: string,
  expiryMinutes: number = 60
): Promise<string | null> {
  try {
    console.log(`Generating download URL for blob '${blobName}'`);
    
    // Get block blob client
    const blockBlobClient = getBlockBlobClient(blobName);
    
    // Check if blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      console.error(`Blob '${blobName}' does not exist`);
      return null;
    }
    
    // Generate SAS URL
    const expiresOn = new Date();
    expiresOn.setMinutes(expiresOn.getMinutes() + expiryMinutes);
    
    const sasUrl = await blockBlobClient.generateSasUrl({
      permissions: BlobSASPermissions.from({
        read: true,
      }),
      expiresOn
    });
    
    console.log(`Download URL generated for blob '${blobName}'`);
    return sasUrl;
  } catch (error) {
    console.error(`Failed to generate download URL: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Deletes a blob from storage
 * @param blobName Blob name
 * @returns True if successful, false otherwise
 */
export async function deleteAssetBlob(blobName: string): Promise<boolean> {
  try {
    console.log(`Deleting blob '${blobName}'`);
    
    // Get block blob client
    const blockBlobClient = getBlockBlobClient(blobName);
    
    // Check if blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      console.warn(`Blob '${blobName}' does not exist`);
      return true; // Consider this a success since the blob doesn't exist
    }
    
    // Delete blob
    await blockBlobClient.delete();
    
    console.log(`Blob '${blobName}' deleted successfully`);
    return true;
  } catch (error) {
    console.error(`Failed to delete blob: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return false;
  }
}