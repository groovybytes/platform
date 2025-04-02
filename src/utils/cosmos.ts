import type { Container, Database, ItemDefinition, PatchOperation } from "@azure/cosmos";
import { CosmosClient } from "@azure/cosmos";

// Caching the client instance to improve performance
let cosmosClient: CosmosClient | null = null;
let databaseInstance: Database | null = null;
let containers: Record<string, Container> = {};

/**
 * Get or create an instance of the Cosmos DB client
 */
export function getCosmosClient(connection = process.env.COSMOS_CONNECTION_STRING as string): CosmosClient {
  if (!cosmosClient) {
    cosmosClient = new CosmosClient(connection);
  }
  return cosmosClient;
}

/**
 * Get the database instance
 */
export function getDatabase(database = process.env.COSMOS_DATABASE_NAME as string): Database {
  if (!databaseInstance) {
    databaseInstance = getCosmosClient().database(database);
  }
  return databaseInstance;
}

/**
 * Get a container instance with caching
 * @param _container Name of the container or Container instance
 */
export function getContainer(_container: string | Container): Container {
  if (typeof _container !== "string") return _container;

  if (!containers[_container]) {
    containers[_container] = getDatabase().container(_container);
  }
  return containers[_container];
}

/**
 * Execute a query against a container
 * @param container Name of the container or Container instance
 * @param query SQL query string
 * @param parameters Query parameters
 */
export async function queryItems<T>(
  _container: string | Container,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  const container = getContainer(_container);
  const querySpec = {
    query,
    parameters
  };

  const { resources } = await container.items.query<T>(querySpec).fetchAll();
  return resources;
}

/**
 * Read an item from a container
 * @param _container Name of the container or Container instance
 * @param id Item ID
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function readItem<T extends ItemDefinition>(
  _container: string | Container,
  id: string,
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(_container);
  const { resource } = await container.item(id, partitionKey).read<T>();
  return resource as T;
}

/**
 * Create an item in a container
 * @param _container Name of the container or Container instance
 * @param item Item to create
 */
export async function createItem<T extends ItemDefinition>(
  _container: string | Container,
  item: T
): Promise<T> {
  const container = getContainer(_container);
  const { resource } = await container.items.create<T>(item);
  return resource as T;
}

/**
 * Replace an item in a container
 * @param _container Name of the container or Container instance
 * @param id Item ID
 * @param item New item data
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function replaceItem<T extends ItemDefinition>(
  _container: string | Container,
  id: string,
  item: T,
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(_container);
  const { resource } = await container.item(id, partitionKey).replace<T>(item);
  return resource as T;
}

/**
 * Patch an item in a container
 * @param _container Name of the container or Container instance
 * @param id Item ID
 * @param operations Patch operations
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function patchItem<T extends ItemDefinition>(
  _container: string | Container,
  id: string,
  operations:  PatchOperation[],
  partitionKey: string = id
): Promise<T> {
  const container = getContainer(_container);
  const { resource } = await container.item(id, partitionKey).patch({
    operations
  });
  return resource as T;
}

/**
 * Delete an item from a container
 * @param _container Name of the container or Container instance
 * @param id Item ID
 * @param partitionKey Partition key value (defaults to ID)
 */
export async function deleteItem(
  _container: string | Container,
  id: string,
  partitionKey: string = id
): Promise<void> {
  const container = getContainer(_container);
  await container.item(id, partitionKey).delete();
}