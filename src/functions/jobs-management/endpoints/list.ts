// @filename: job-management/endpoints/list.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { AnalysisJob } from '~/types/operational';

import { badRequest, handleApiError } from '~/utils/error';
import { secureEndpoint, type EnhacedLogContext } from '~/utils/protect';
import { complexQuery } from '~/utils/cosmos/utils';

import { ok } from '~/utils/response';
import { getRequestContext } from '~/utils/context';

interface ListJobsResponse {
  items: AnalysisJob[];
  count: number;
  continuationToken?: string;
}

/**
 * HTTP Trigger to list jobs for a project
 * GET /api/v1/jobs
 */
const ListJobsHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:analysis:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      
      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project || !project?.id) {
        return badRequest('Project ID is required');
      }
      
      // Get query parameters
      const status = request.query.get('status');
      const analysisType = request.query.get('analysisType');
      const limit = parseInt(request.query.get('limit') || '50', 10);
      const continuationToken = request.query.get('continuationToken');
      
      // Build query
      let query = `SELECT * FROM c WHERE c.projectId = @projectId`;
      const queryParams = [{ name: '@projectId', value: project.id }];
      
      if (status) {
        query += ` AND c.status = @status`;
        queryParams.push({ name: '@status', value: status });
      }
      
      if (analysisType) {
        query += ` AND c.analysisType = @analysisType`;
        queryParams.push({ name: '@analysisType', value: analysisType });
      }
      
      // Add sorting
      query += ` ORDER BY c.createdAt DESC`;
      
      // Execute query
      const result = await complexQuery<AnalysisJob>('jobs', query, queryParams, {
        maxItemCount: limit,
        continuationToken: continuationToken ?? undefined
      });
      
      // Prepare response
      const response: ListJobsResponse = {
        items: result.resources,
        count: result.resources.length,
        continuationToken: result.continuationToken
      };

      return ok(response);
    } catch (error) {
      context.error('Error listing jobs:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "ListJobs",
  Route: "v1/jobs",
  Handler: ListJobsHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string, status?: string, analysisType?: string, limit?: number, continuationToken?: string },
  Output: {} as ListJobsResponse,
};