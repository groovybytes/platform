// @filename: utils/synapse/sql.ts
import type { ConnectionPool, IResult, config as MSSQLConfig, ISqlType } from 'mssql';

import process from 'node:process';
import sql from "mssql";

// Synapse Serverless SQL Pool connection details
const SQL_SERVER_ENDPOINT = process.env.SYNAPSE_ENDPOINT; // e.g., 'groovybytes-ondemand.sql.azuresynapse.net'
const SQL_DATABASE = 'master'; // Serverless SQL uses master as the default database
const SQL_USERNAME = process.env.SYNAPSE_SQL_USERNAME;
const SQL_PASSWORD = process.env.SYNAPSE_SQL_PASSWORD;

// Connection pool for SQL queries
let sqlPool: ConnectionPool | null = null;

/**
 * Query request for Synapse Serverless SQL
 */
export interface QueryRequest {
  sql: string;
  parameters?: Array<{
    name: string;
    value: string | number | boolean;
    type?: string;
  }>;
  maxRows?: number;
  timeoutSeconds?: number;
  userId: string;
  projectId: string;
  queryId: string;
}

/**
 * Column metadata for query results
 */
export interface ColumnMetadata {
  name: string;
  type: ISqlType;
  precision?: number;
  scale?: number;
  nullable: boolean;
}

/**
 * Result set for a query
 */
export interface QueryResult {
  columns: ColumnMetadata[];
  rows: any[][];
  rowCount: number;
  hasMoreResults: boolean;
  totalRowsReturned: number;
  truncated: boolean;
}

/**
 * Initialize the SQL connection pool
 */
export async function initSqlPool(): Promise<ConnectionPool> {
  if (!sqlPool) {
    if (!SQL_SERVER_ENDPOINT) {
      throw new Error('SYNAPSE_SQL_SERVER_ENDPOINT environment variable is required');
    }

    if (!SQL_USERNAME || !SQL_PASSWORD) {
      throw new Error('SQL Server credentials are required (SYNAPSE_SQL_USERNAME and SYNAPSE_SQL_PASSWORD)');
    }

    const config: MSSQLConfig = {
      server: SQL_SERVER_ENDPOINT,
      database: SQL_DATABASE,
      user: SQL_USERNAME,
      password: SQL_PASSWORD,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        connectTimeout: 30000,
        requestTimeout: 30000
      }
    };

    try {
      sqlPool = await sql.connect(config);
      console.info('Connected to Synapse SQL Server');
    } catch (err) {
      console.error('Failed to connect to Synapse SQL Server', err);
      throw err;
    }
  }

  return sqlPool;
}

/**
 * Execute a SQL query against Synapse Serverless SQL
 * @param request Query request object
 */
export async function executeQuery(request: QueryRequest): Promise<QueryResult> {
  try {
    const pool = await initSqlPool();
    const startTime = Date.now();

    // Configure the request
    const sqlRequest = new sql.Request(pool);
    
    // Apply parameters
    if (request.parameters && request.parameters.length > 0) {
      request.parameters.forEach(param => {
        // Map SQL types
        let sqlType;
        switch (param.type?.toLowerCase()) {
          case 'integer':
          case 'int':
            sqlType = sql.Int;
            break;
          case 'float':
          case 'double':
            sqlType = sql.Float;
            break;
          case 'boolean':
          case 'bool':
            sqlType = sql.Bit;
            break;
          case 'date':
            sqlType = sql.Date;
            break;
          case 'datetime':
            sqlType = sql.DateTime;
            break;
          default:
            sqlType = sql.NVarChar;
        }
        
        sqlRequest.input(param.name.replace('@', ''), sqlType, param.value);
      });
    }
    
    // Execute the query
    const result: IResult<any> = await sqlRequest.query(request.sql);
    
    const executionTime = Date.now() - startTime;
    
    // Log query execution (for audit purposes)
    console.info(`Query executed in ${executionTime}ms`, {
      queryId: request.queryId,
      userId: request.userId,
      projectId: request.projectId,
      rowCount: result.recordset?.length || 0
    });
    
    // If no result sets, return empty result
    if (!result.recordset) {
      return {
        columns: [],
        rows: [],
        rowCount: 0,
        hasMoreResults: false,
        totalRowsReturned: 0,
        truncated: false
      };
    }
    
    // Process result set
    const columns = Object.keys(result.recordset.columns).map(colName => {
      const metadata = result.recordset.columns[colName];
      return {
        name: colName,
        type: typeof metadata.type === "function" ? metadata.type?.() : metadata.type,
        precision: metadata.precision,
        scale: metadata.scale,
        nullable: !!metadata.nullable
      } as ColumnMetadata;
    });
    
    // Convert rows to array format
    const rows = result.recordset.map(row => {
      return columns.map(col => row[col.name]);
    });
    
    // Apply row limit if specified
    const maxRows = request.maxRows || 1000;
    const truncated = rows.length > maxRows;
    const limitedRows = truncated ? rows.slice(0, maxRows) : rows;
    
    return {
      columns,
      rows: limitedRows,
      rowCount: limitedRows.length,
      hasMoreResults: false,
      totalRowsReturned: result.recordset.length,
      truncated
    };
  } catch (error) {
    console.error(`Error executing query`, {
      queryId: request.queryId,
      userId: request.userId,
      projectId: request.projectId,
      error: (error as Error)?.message,
      sql: request.sql
    });
    
    throw error;
  }
}

/**
 * Close the SQL connection pool
 */
export async function closeSqlPool(): Promise<void> {
  if (sqlPool) {
    try {
      await sqlPool.close();
      sqlPool = null;
      console.info('Closed Synapse SQL connection pool');
    } catch (err) {
      console.error('Error closing Synapse SQL connection pool', err);
    }
  }
}



