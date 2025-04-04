import type { Container, Database, FeedOptions, FeedResponse, ItemDefinition, PartitionKey, PatchOperation } from "@azure/cosmos";
import { CosmosClient, PartitionKeyKind } from "@azure/cosmos";

// Environment variable keys for the two Cosmos DB accounts
export const OPERATIONAL_COSMOS_CONNECTION = 'OPERATIONAL_COSMOS_CONNECTION_STRING';
export const ANALYTICS_COSMOS_CONNECTION = 'ANALYTICS_COSMOS_CONNECTION_STRING';
export const OPERATIONAL_DATABASE_NAME = 'operational';

// Cache for clients, databases, and containers
interface CosmosCache {
  clients: Record<string, CosmosClient>;
  databases: Record<string, Database>;
  containers: Record<string, Container>;
}

// Initialize cache
const cosmosCache: CosmosCache = {
  clients: {},
  databases: {},
  containers: {}
};

/**
 * AccountType enum for specifying which Cosmos DB account to use
 */
export enum AccountType {
  OPERATIONAL = 'operational',
  ANALYTICS = 'analytics'
}

/**
 * Context object for database operations
 */
export interface CosmosContext {
  accountType: AccountType;
  databaseName: string;
  containerName?: string;
}

/**
 * Create a context object for the operational database
 */
export function createOperationalContext(containerName?: string): CosmosContext {
  return {
    accountType: AccountType.OPERATIONAL,
    databaseName: OPERATIONAL_DATABASE_NAME,
    containerName
  };
}

/**
 * Create a context object for a project's analytics database
 */
export function createProjectContext(projectId: string, containerName?: string): CosmosContext {
  return {
    accountType: AccountType.ANALYTICS,
    databaseName: `project-${projectId}`,
    containerName
  };
}

/**
 * Get the connection string for the specified account type
 */
function getConnectionString(accountType: AccountType): string {
  if (accountType === AccountType.OPERATIONAL) {
    return process.env[OPERATIONAL_COSMOS_CONNECTION] as string;
  } else {
    return process.env[ANALYTICS_COSMOS_CONNECTION] as string;
  }
}

/**
 * Get or create an instance of the Cosmos DB client
 * @param contextOrAccountType Context object or legacy account type parameter
 */
export function getCosmosClient(contextOrAccountType?: CosmosContext | AccountType): CosmosClient {
  // Handle legacy approach
  if (typeof contextOrAccountType === 'string' || contextOrAccountType === undefined) {
    const accountType = contextOrAccountType || AccountType.OPERATIONAL;
    const connectionString = getConnectionString(accountType);
    
    if (!cosmosCache.clients[accountType]) {
      cosmosCache.clients[accountType] = new CosmosClient(connectionString);
    }
    
    return cosmosCache.clients[accountType];
  }
  
  // Context-based approach
  const context = contextOrAccountType;
  const connectionString = getConnectionString(context.accountType);
  
  if (!cosmosCache.clients[context.accountType]) {
    cosmosCache.clients[context.accountType] = new CosmosClient(connectionString);
  }
  
  return cosmosCache.clients[context.accountType];
}

/**
 * Get a database instance with caching
 * @param databaseNameOrContext Database name (legacy) or context
 * @param accountType Legacy account type parameter
 */
export function getDatabase(
  databaseNameOrContext?: string | CosmosContext,
  accountType: AccountType = AccountType.OPERATIONAL
): Database {
  // Handle legacy approach
  if (typeof databaseNameOrContext === 'string' || databaseNameOrContext === undefined) {
    const databaseName = databaseNameOrContext || OPERATIONAL_DATABASE_NAME;
    const cacheKey = `${accountType}:${databaseName}`;
    
    if (!cosmosCache.databases[cacheKey]) {
      cosmosCache.databases[cacheKey] = getCosmosClient(accountType).database(databaseName);
    }
    
    return cosmosCache.databases[cacheKey];
  }
  
  // Context-based approach
  const context = databaseNameOrContext;
  const cacheKey = `${context.accountType}:${context.databaseName}`;
  
  if (!cosmosCache.databases[cacheKey]) {
    cosmosCache.databases[cacheKey] = getCosmosClient(context).database(context.databaseName);
  }
  
  return cosmosCache.databases[cacheKey];
}

/**
 * Get a container instance with caching
 * @param containerNameOrContext Container name (legacy) or context with containerName
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export function getContainer(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Container {
  // Handle legacy approach
  if (typeof containerNameOrContext === 'string') {
    const containerName = containerNameOrContext;
    const cacheKey = `${accountType}:${databaseName}:${containerName}`;
    
    if (!cosmosCache.containers[cacheKey]) {
      const database = getDatabase(databaseName, accountType);
      cosmosCache.containers[cacheKey] = database.container(containerName);
    }
    
    return cosmosCache.containers[cacheKey];
  }
  
  // Context-based approach
  const context = containerNameOrContext;
  if (!context.containerName) {
    throw new Error('Container name is required in context');
  }
  
  const cacheKey = `${context.accountType}:${context.databaseName}:${context.containerName}`;
  
  if (!cosmosCache.containers[cacheKey]) {
    const database = getDatabase(context);
    cosmosCache.containers[cacheKey] = database.container(context.containerName);
  }
  
  return cosmosCache.containers[cacheKey];
}

/**
 * Execute a query against a container
 * @param containerNameOrContext Container name or context
 * @param query SQL query string
 * @param parameters Query parameters
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function queryItems<T>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  query: string,
  parameters: { name: string, value: any }[] = [],
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL,
  opts?: FeedOptions,
): Promise<T[]> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const querySpec = {
    query,
    parameters
  };

  const { resources } = await container.items.query<T>(querySpec, opts).fetchAll();
  return resources;
}

/**
 * Execute a query against a container
 * @param containerNameOrContext Container name or context
 * @param query SQL query string
 * @param parameters Query parameters
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function complexQuery<T>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  query: string,
  parameters: { name: string, value: any }[] = [],
  opts?: FeedOptions,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL,
): Promise<FeedResponse<T>> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const querySpec = {
    query,
    parameters
  };

  const result = await container.items.query<T>(querySpec, opts).fetchAll();
  return result;
}

/**
 * Read an item from a container
 * @param containerNameOrContext Container name or context
 * @param id Item ID
 * @param partitionKey Partition key value
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function readItem<T extends ItemDefinition>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  id: string,
  partitionKey?: PartitionKey,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<T> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const { resource } = await container.item(id, partitionKey).read<T>();
  return resource as T;
}

/**
 * Create an item in a container
 * @param containerNameOrContext Container name or context
 * @param item Item to create
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function createItem<T extends ItemDefinition>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  item: T,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<T> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const { resource } = await container.items.create<T>(item);
  return resource as T;
}

/**
 * Replace an item in a container
 * @param containerNameOrContext Container name or context
 * @param id Item ID
 * @param item New item data
 * @param partitionKey Partition key value
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function replaceItem<T extends ItemDefinition>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  id: string,
  item: T,
  partitionKey?: PartitionKey,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<T> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const { resource } = await container.item(id, partitionKey).replace<T>(item);
  return resource as T;
}

/**
 * Patch an item in a container
 * @param containerNameOrContext Container name or context
 * @param id Item ID
 * @param operations Patch operations
 * @param partitionKey Partition key value
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function patchItem<T extends ItemDefinition>(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  id: string,
  operations: PatchOperation[],
  partitionKey?: PartitionKey,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<T> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  const { resource } = await container.item(id, partitionKey).patch({
    operations
  });
  return resource as T;
}

/**
 * Delete an item from a container
 * @param containerNameOrContext Container name or context
 * @param id Item ID
 * @param partitionKey Partition key value
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function deleteItem(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  id: string,
  partitionKey?: PartitionKey,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<void> {
  const container = typeof containerNameOrContext === 'string'
    ? getContainer(containerNameOrContext, databaseName, accountType)
    : getContainer(containerNameOrContext);
    
  await container.item(id, partitionKey).delete();
}

/**
 * Create a database if it doesn't exist
 * @param databaseNameOrContext Database name or context
 * @param accountType Legacy account type parameter
 */
export async function createDatabaseIfNotExists(
  databaseNameOrContext: string | CosmosContext,
  accountType: AccountType = AccountType.ANALYTICS
): Promise<Database> {
  // Handle legacy approach
  if (typeof databaseNameOrContext === 'string') {
    const databaseName = databaseNameOrContext;
    const client = getCosmosClient(accountType);
    const { database } = await client.databases.createIfNotExists({
      id: databaseName
    });
    
    // Update the cache
    const cacheKey = `${accountType}:${databaseName}`;
    cosmosCache.databases[cacheKey] = database;
    
    return database;
  }
  
  // Context-based approach
  const context = databaseNameOrContext;
  const client = getCosmosClient(context);
  const { database } = await client.databases.createIfNotExists({
    id: context.databaseName
  });
  
  // Update the cache
  const cacheKey = `${context.accountType}:${context.databaseName}`;
  cosmosCache.databases[cacheKey] = database;
  
  return database;
}

/**
 * Create a container if it doesn't exist
 * @param containerNameOrContext Container name or context with containerName
 * @param partitionKeyPath The partition key path (e.g., "/id")
 * @param databaseName Legacy database name parameter
 * @param accountType Legacy account type parameter
 */
export async function createContainerIfNotExists(
  containerNameOrContext: string | (CosmosContext & { containerName: string }),
  partitionKeyPath: string,
  databaseName: string = OPERATIONAL_DATABASE_NAME,
  accountType: AccountType = AccountType.OPERATIONAL
): Promise<Container> {
  // Handle legacy approach
  if (typeof containerNameOrContext === 'string') {
    const containerName = containerNameOrContext;
    const database = getDatabase(databaseName, accountType);
    const { container } = await database.containers.createIfNotExists({
      id: containerName,
      partitionKey: {
        paths: [partitionKeyPath],
        kind: PartitionKeyKind.Hash
      }
    });
    
    // Update the cache
    const cacheKey = `${accountType}:${databaseName}:${containerName}`;
    cosmosCache.containers[cacheKey] = container;
    
    return container;
  }
  
  // Context-based approach
  const context = containerNameOrContext;
  if (!context.containerName) {
    throw new Error('Container name is required in context');
  }
  
  const database = getDatabase(context);
  const { container } = await database.containers.createIfNotExists({
    id: context.containerName,
    partitionKey: {
      paths: [partitionKeyPath],
      kind: PartitionKeyKind.Hash
    }
  });
  
  // Update the cache
  const cacheKey = `${context.accountType}:${context.databaseName}:${context.containerName}`;
  cosmosCache.containers[cacheKey] = container;
  
  return container;
}

/**
 * Create a new project database with all required containers
 * @param projectId ID of the project
 */
export async function createProjectDatabase(projectId: string): Promise<Database> {
  const databaseName = `project-${projectId}`;
  
  // Create the database
  const database = await createDatabaseIfNotExists(databaseName, AccountType.ANALYTICS);
  
  // Create the required containers
  await createContainerIfNotExists('raw', '/deviceId', databaseName, AccountType.ANALYTICS);
  await createContainerIfNotExists('enriched', '/sourceType', databaseName, AccountType.ANALYTICS);
  await createContainerIfNotExists('processed', '/analysisType', databaseName, AccountType.ANALYTICS);
  
  return database;
}

/**
 * Delete a project database
 * @param projectId ID of the project to delete
 */
export async function deleteProjectDatabase(projectId: string): Promise<void> {
  const databaseName = `project-${projectId}`;
  const client = getCosmosClient(AccountType.ANALYTICS);
  
  await client.database(databaseName).delete();
  
  // Clean up the cache
  Object.keys(cosmosCache.databases).forEach(key => {
    if (key.includes(`${AccountType.ANALYTICS}:${databaseName}`)) {
      delete cosmosCache.databases[key];
    }
  });
  
  Object.keys(cosmosCache.containers).forEach(key => {
    if (key.includes(`${AccountType.ANALYTICS}:${databaseName}`)) {
      delete cosmosCache.containers[key];
    }
  });
}

/**
 * Get a project-specific database from the Analytics account
 * @param projectId ID of the project
 */
export function getProjectDatabase(projectId: string): Database {
  const databaseName = `project-${projectId}`;
  return getDatabase(databaseName, AccountType.ANALYTICS);
}

/**
 * Get a container from a project-specific database
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 */
export function getProjectContainer(projectId: string, containerName: string): Container {
  const databaseName = `project-${projectId}`;
  return getContainer(containerName, databaseName, AccountType.ANALYTICS);
}

/**
 * Execute a query against a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param query SQL query string
 * @param parameters Query parameters
 */
export async function queryProjectItems<T>(
  projectId: string,
  containerName: string,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  const databaseName = `project-${projectId}`;
  return queryItems<T>(containerName, query, parameters, databaseName, AccountType.ANALYTICS);
}

/**
 * Read an item from a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param id Item ID
 * @param partitionKey Partition key value
 */
export async function readProjectItem<T extends ItemDefinition>(
  projectId: string,
  containerName: string,
  id: string,
  partitionKey: PartitionKey
): Promise<T> {
  const databaseName = `project-${projectId}`;
  return readItem<T>(containerName, id, partitionKey, databaseName, AccountType.ANALYTICS);
}

/**
 * Create an item in a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param item Item to create
 */
export async function createProjectItem<T extends ItemDefinition>(
  projectId: string,
  containerName: string,
  item: T
): Promise<T> {
  const databaseName = `project-${projectId}`;
  return createItem<T>(containerName, item, databaseName, AccountType.ANALYTICS);
}

/**
 * Replace an item in a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param id Item ID
 * @param item New item data
 * @param partitionKey Partition key value
 */
export async function replaceProjectItem<T extends ItemDefinition>(
  projectId: string,
  containerName: string,
  id: string,
  item: T,
  partitionKey: PartitionKey
): Promise<T> {
  const databaseName = `project-${projectId}`;
  return replaceItem<T>(containerName, id, item, partitionKey, databaseName, AccountType.ANALYTICS);
}

/**
 * Patch an item in a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param id Item ID
 * @param operations Patch operations
 * @param partitionKey Partition key value
 */
export async function patchProjectItem<T extends ItemDefinition>(
  projectId: string,
  containerName: string,
  id: string,
  operations: PatchOperation[],
  partitionKey: PartitionKey
): Promise<T> {
  const databaseName = `project-${projectId}`;
  return patchItem<T>(containerName, id, operations, partitionKey, databaseName, AccountType.ANALYTICS);
}

/**
 * Delete an item from a project-specific container
 * @param projectId ID of the project
 * @param containerName Name of the container (raw, enriched, processed)
 * @param id Item ID
 * @param partitionKey Partition key value
 */
export async function deleteProjectItem(
  projectId: string,
  containerName: string,
  id: string,
  partitionKey: PartitionKey
): Promise<void> {
  const databaseName = `project-${projectId}`;
  return deleteItem(containerName, id, partitionKey, databaseName, AccountType.ANALYTICS);
}