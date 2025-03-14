import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { app } from '@azure/functions';

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_SAS_CONNECTION_STRING = process.env.AZURE_STORAGE_SAS_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER;

/**
 * HTTP Trigger to delete a document
 * DELETE /api/documents/{fileName}
 */
const DeleteDocumentHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
        const fileName = request.params.fileName;
        if (!fileName) {
            return { status: 400, jsonBody: { error: "File name is required" } };
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_SAS_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
        const blobClient = containerClient.getBlobClient(fileName);

        await blobClient.deleteIfExists();

        return { status: 200, jsonBody: { message: "File deleted successfully" } };
    } catch (error) {
        context.error("Error deleting document:", error);
        return { status: 500, jsonBody: { error: "Failed to delete document" } };
    }
};

// Register the HTTP trigger
app.http("DeleteDocument", {
    route: "documents/{fileName}",
    methods: ["DELETE"],
    authLevel: "anonymous",
    handler: DeleteDocumentHandler,
});
