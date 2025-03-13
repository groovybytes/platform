import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { BlobServiceClient, StorageSharedKeyCredential, generateBlobSASQueryParameters, BlobSASPermissions } from "@azure/storage-blob";

// Environment variables
const accountName = process.env.AZURE_STORAGE_ACCOUNT_NAME || "";
const accountKey = process.env.AZURE_STORAGE_ACCOUNT_KEY || "";
const containerName = process.env.AZURE_STORAGE_CONTAINER || "";

const blobSasFunction: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    try {
        const { blobName } = req.query;
        if (!blobName) {
            context.res = {
                status: 400,
                body: "Please provide a blobName as a query parameter.",
            };
            return;
        }

        // Generate SAS token
        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);
        const blobServiceClient = new BlobServiceClient(`https://${accountName}.blob.core.windows.net`, sharedKeyCredential);
        const containerClient = blobServiceClient.getContainerClient(containerName);
        const blobClient = containerClient.getBlobClient(blobName);

        const expiresOn = new Date();
        expiresOn.setMinutes(expiresOn.getMinutes() + 60); // Expires in 1 hour

        const sasToken = generateBlobSASQueryParameters({
            containerName,
            blobName,
            expiresOn,
            permissions: BlobSASPermissions.parse("r"), // Read-only access
        }, sharedKeyCredential).toString();

        context.res = {
            status: 200,
            body: { sasUrl: `${blobClient.url}?${sasToken}` },
        };
    } catch (error) {
        context.res = {
            status: 500,
            body: `Error generating SAS token: ${error.message}`,
        };
    }
};

export default blobSasFunction;
