import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { app } from '@azure/functions';

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_SAS_CONNECTION_STRING = process.env.AZURE_STORAGE_SAS_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER;

/**
 * HTTP Trigger to upload a document
 * POST /api/documents/upload
 */
const UploadDocumentHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_SAS_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);

        const formData = await request.formData();
        const file = formData.get("file") as Blob;
        if (!file) {
            return { status: 400, jsonBody: { error: "No file provided" } };
        }

        const blobName = file.name;
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);

        await blockBlobClient.uploadData(await file.arrayBuffer(), {
            blobHTTPHeaders: { blobContentType: file.type }
        });

        return {
            status: 201,
            jsonBody: { message: "File uploaded successfully", fileName: blobName }
        };
    } catch (error) {
        context.error("Error uploading document:", error);
        return { status: 500, jsonBody: { error: "Failed to upload document" } };
    }
};

// Register the HTTP trigger
app.http("UploadDocument", {
    route: "documents/upload",
    methods: ["POST"],
    authLevel: "anonymous",
    handler: UploadDocumentHandler,
});
