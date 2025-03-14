import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { BlobServiceClient } from '@azure/storage-blob';
import { app } from '@azure/functions';

const AZURE_STORAGE_ACCOUNT_NAME = process.env.AZURE_STORAGE_ACCOUNT_NAME;
const AZURE_STORAGE_SAS_CONNECTION_STRING = process.env.AZURE_STORAGE_SAS_CONNECTION_STRING;
const AZURE_STORAGE_CONTAINER = process.env.AZURE_STORAGE_CONTAINER;

/**
 * HTTP Trigger to download a document
 * GET /api/documents/download/{fileName}
 */
const DownloadDocumentHandler = async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
        const fileName = request.params.fileName;
        if (!fileName) {
            return { status: 400, jsonBody: { error: "File name is required" } };
        }

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_SAS_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(AZURE_STORAGE_CONTAINER);
        const blobClient = containerClient.getBlobClient(fileName);

        const downloadResponse = await blobClient.download();
        if (!downloadResponse.readableStreamBody) {
            return { status: 404, jsonBody: { error: "File not found" } };
        }

        return {
            status: 200,
            body: downloadResponse.readableStreamBody,
            headers: {
                "Content-Disposition": `attachment; filename=${fileName}`,
                "Content-Type": downloadResponse.contentType || "application/octet-stream"
            }
        };
    } catch (error) {
        context.error("Error downloading document:", error);
        return { status: 500, jsonBody: { error: "Failed to download document" } };
    }
};

// Register the HTTP trigger
app.http("DownloadDocument", {
    route: "documents/download/{fileName}",
    methods: ["GET"],
    authLevel: "anonymous",
    handler: DownloadDocumentHandler,
});
