// @filename: utils/assets.ts
import type { Asset } from '~/types/operational';
import { BlobSASPermissions, BlobServiceClient, BlockBlobClient, ContainerClient } from '@azure/storage-blob';
import { createItem } from '~/utils/cosmos/utils';
import { nanoid } from 'nanoid';

// Cache for blob service client and container clients
let blobServiceClient: BlobServiceClient | null = null;
const containerClients: Record<string, ContainerClient> = {};

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
 * Generates a container name for a specific project
 * @param projectId Project ID
 */
export function getProjectContainerName(projectId: string): string {
  // Create a safe container name (lowercase, alphanumeric + dash)
  // Container names must be lowercase, between 3-63 characters
  return `assets-${projectId.toLowerCase()}`.replace(/[^a-z0-9-]/g, '');
}

/**
 * Get or create a container client for a specific project's assets
 * @param projectId Project ID
 */
export async function getProjectContainerClient(projectId: string): Promise<ContainerClient> {
  const containerName = getProjectContainerName(projectId);
  
  if (!containerClients[containerName]) {
    const client = getBlobServiceClient().getContainerClient(containerName);
    
    // Check if container exists, create if it doesn't
    const exists = await client.exists();
    if (!exists) {
      console.log(`Creating container '${containerName}' for project '${projectId}'`);
      await client.create();
    }
    
    containerClients[containerName] = client;
  }
  
  return containerClients[containerName];
}

/**
 * Get a block blob client for a specific blob in a project container
 * @param projectId Project ID
 * @param blobName The name of the blob
 */
export async function getBlockBlobClient(projectId: string, blobName: string): Promise<BlockBlobClient> {
  const containerClient = await getProjectContainerClient(projectId);
  return containerClient.getBlockBlobClient(blobName);
}

/**
 * Generates a unique blob name for an asset 
 * @param fileName Original file name
 */
export function generateAssetBlobName(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.split('.').pop() : '';
  const uniqueId = nanoid(10);
  return `${uniqueId}${extension ? `.${extension}` : ''}`;
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
    const blobName = generateAssetBlobName(fileName);
    
    // Get block blob client for this project
    const blockBlobClient = await getBlockBlobClient(projectId, blobName);
    
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
    
    console.log(`Upload URL generated for blob '${blobName}' in project '${projectId}'`);
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
 * @param projectId Project ID
 * @param blobName Blob name
 * @param expiryMinutes Minutes until the SAS URL expires
 * @returns Download URL
 */
export async function generateDownloadUrl(
  projectId: string,
  blobName: string,
  expiryMinutes: number = 60
): Promise<string | null> {
  try {
    console.log(`Generating download URL for blob '${blobName}' in project '${projectId}'`);
    
    // Get block blob client
    const blockBlobClient = await getBlockBlobClient(projectId, blobName);
    
    // Check if blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      console.error(`Blob '${blobName}' does not exist in project '${projectId}'`);
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
    
    console.log(`Download URL generated for blob '${blobName}' in project '${projectId}'`);
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
 * @param projectId Project ID
 * @param blobName Blob name
 * @returns True if successful, false otherwise
 */
export async function deleteAssetBlob(projectId: string, blobName: string): Promise<boolean> {
  try {
    console.log(`Deleting blob '${blobName}' from project '${projectId}'`);
    
    // Get block blob client
    const blockBlobClient = await getBlockBlobClient(projectId, blobName);
    
    // Check if blob exists
    const exists = await blockBlobClient.exists();
    if (!exists) {
      console.warn(`Blob '${blobName}' does not exist in project '${projectId}'`);
      return true; // Consider this a success since the blob doesn't exist
    }
    
    // Delete blob
    await blockBlobClient.delete();
    
    console.log(`Blob '${blobName}' deleted successfully from project '${projectId}'`);
    return true;
  } catch (error) {
    console.error(`Failed to delete blob: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return false;
  }
}