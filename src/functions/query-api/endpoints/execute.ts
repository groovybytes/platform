// @filename: query-api/endpoints/execute.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { QueryRequest, QueryResult } from '~/utils/synapse/sql';
import type { EnhacedLogContext } from '~/utils/protect';
import type { SavedQuery } from '~/types/operational';

import { badRequest, handleApiError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

import { readItem, patchItem } from '~/utils/cosmos/utils';

import { ok } from '~/utils/response';
import { nanoid } from 'nanoid';
import { executeQuery } from '~/utils/synapse/sql';

interface ExecuteQueryRequest {
  sql?: string;
  savedQueryId?: string;
  parameters?: Array<{
    name: string;
    value: string | number | boolean;
    type?: string;
  }>;
  category?: string;
  isPublic?: boolean;
  limit?: number;
}

interface ExecuteQueryResponse {
  queryId: string;
  status: 'completed' | 'running' | 'error';
  results?: QueryResult;
  error?: string;
  executionTime?: number;
}

/**
 * HTTP Trigger to execute a SQL query against Synapse Serverless SQL
 * POST /api/v1/projects/{projectId}/query/execute
 */
const ExecuteQueryHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:data:query:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const body = await request.json() as ExecuteQueryRequest;
      
      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required');
      }
      
      if (!body.sql) {
        return badRequest('SQL query is required');
      }

      // Generate a unique query ID
      const queryId = nanoid();
      
      // Execute the query
      const queryRequest: QueryRequest = {
        sql: body.sql,
        parameters: body.parameters || [],
        maxRows: body.limit || 1000,
        userId,
        projectId: project.id,
        queryId
      };
      
      const startTime = Date.now();
      
      try {
        const results = await executeQuery(queryRequest);
        const executionTime = Date.now() - startTime;
        
        const response: ExecuteQueryResponse = {
          queryId,
          status: 'completed',
          results,
          executionTime
        };
        
        // If this is a saved query, update its statistics
        if (body.savedQueryId) {
          try {
            // Get the saved query
            const savedQuery = await readItem<SavedQuery>('queries', body.savedQueryId);
            
            if (savedQuery && savedQuery.projectId === project.id) {
              // Update the lastRunAt and runCount
              await patchItem<SavedQuery>(
                'queries',
                body.savedQueryId,
                [
                  { op: 'replace', path: '/lastRunAt', value: new Date().toISOString() },
                  { op: 'replace', path: '/runCount', value: (savedQuery.runCount || 0) + 1 }
                ]
              );
            }
          } catch (err) {
            // Don't fail the whole request if this update fails
            context.warn('Failed to update saved query statistics', { error: err, savedQueryId: body.savedQueryId });
          }
        }
        
        return ok(response);
      } catch (error) {
        return badRequest((error as Error)?.message, {
          queryId,
          status: 'error',
          executionTime: Date.now() - startTime
        } as ExecuteQueryResponse);
      }
    } catch (error) {
      context.error('Error executing query:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ExecuteQuery",
  Route: "v1/query/execute",
  Handler: ExecuteQueryHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as ExecuteQueryRequest,
  Output: {} as ExecuteQueryResponse,
};
