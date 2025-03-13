import type { Container, Database, ItemDefinition, PatchOperation } from "@azure/cosmos";
import { CosmosClient } from "@azure/cosmos";

// Caching the client instance to improve performance
let cosmosClient: CosmosClient | null = null;
let databaseInstance: Database | null = null;
let containers: Record<string, Container> = {};

/**
 * Get or create an instance of the Cosmos DB client
 */
export function getCosmosClient(): CosmosClient {
  if (!cosmosClient) {
    cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING as string);
  }
  return cosmosClient;
}

/**
 * Get the database instance
 */
export function getDatabase(): Database {
  if (!databaseInstance) {
    databaseInstance = getCosmosClient().database(process.env.COSMOS_DATABASE_NAME as string);
  }
  return databaseInstance;
}

/**
 * Get a container instance with caching
 * @param containerName Name of the container
 */
export function getContainer(containerName: string): Container {
  if (!containers[containerName]) {
    containers[containerName] = getDatabase().container(containerName);
  }
  return containers[containerName];
}

/**
 * Execute a query against a container
 * @param containerName Name of the container
 * @param query SQL query string
 * @param parameters Query parameters
 */
export async function queryItems<T>(
  containerName: string,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  const container = getContainer(containerName);
  const querySpec = {
    query,
    parameters
  };

  const { resources } = await container.items.query<T>(querySpec).fetchAll();
  return resources;
}

/**
 * Read an item from a container
 * @param containerName Name of the container
 * @param id Item ID
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function readItem<T extends ItemDefinition>(
  containerName: string,
  id: string,
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(containerName);
  const { resource } = await container.item(id, partitionKey).read<T>();
  return resource as T;
}

/**
 * Create an item in a container
 * @param containerName Name of the container
 * @param item Item to create
 */
export async function createItem<T extends ItemDefinition>(
  containerName: string,
  item: T
): Promise<T> {
  const container = getContainer(containerName);
  const { resource } = await container.items.create<T>(item);
  return resource as T;
}

/**
 * Replace an item in a container
 * @param containerName Name of the container
 * @param id Item ID
 * @param item New item data
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function replaceItem<T extends ItemDefinition>(
  containerName: string,
  id: string,
  item: T,
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(containerName);
  const { resource } = await container.item(id, partitionKey).replace<T>(item);
  return resource as T;
}

/**
 * Patch an item in a container
 * @param containerName Name of the container
 * @param id Item ID
 * @param operations Patch operations
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function patchItem<T extends ItemDefinition>(
  containerName: string,
  id: string,
  operations:  PatchOperation[],
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(containerName);
  const { resource } = await container.item(id, partitionKey).patch({
    operations
  });
  return resource as T;
}

/**
 * Delete an item from a container
 * @param containerName Name of the container
 * @param id Item ID
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function deleteItem(
  containerName: string,
  id: string,
  partitionKey: string = id
): Promise<void> {
  const container = getContainer(containerName);
  await container.item(id, partitionKey).delete();
}