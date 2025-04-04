// @filename: job-management/endpoints/get.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { AnalysisJob } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { secureEndpoint, type EnhacedLogContext } from '~/utils/protect';
import { readItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';
import { getRequestContext } from '~/utils/context';

/**
 * HTTP Trigger to get a job by ID
 * GET /api/v1/jobs/{id}
 */
const GetJobHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:analysis:read:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const jobId = request.params.id;

      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);

      if (!project || !project?.id) {
        return badRequest('Project ID is required');
      }

      if (!jobId) {
        return badRequest('Job ID is required');
      }

      // Get job from Cosmos DB
      const job = await readItem<AnalysisJob>('jobs', jobId);

      if (!job) {
        return notFound('Job', jobId);
      }

      // Verify the job belongs to the specified project
      if (job.projectId !== project.id) {
        return notFound('Job', jobId);
      }

      return ok(job);
    } catch (error) {
      context.error('Error getting job:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetJob",
  Route: "v1/jobs/{id}",
  Handler: GetJobHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string, id: string },
  Output: {} as AnalysisJob,
};