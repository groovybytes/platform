// @filename: job-management/endpoints/cancel.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { AnalysisJob } from '~/types/operational';

import { badRequest, handleApiError, notFound, conflict } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { readItem, patchItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';

// import { cancelJobOrchestration } from '~/utils/orchestrators';

/**
 * HTTP Trigger to cancel a running job
 * POST /api/v1/jobs/{id}/cancel
 */
const CancelJobHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:analysis:cancel:allow",
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
      
      // Check if job can be cancelled
      if (job.status !== 'queued' && job.status !== 'running') {
        return conflict(`Job cannot be cancelled because it is in state '${job.status}'`);
      }
      
      // Update job status
      const timestamp = new Date().toISOString();
      const updatedJob = await patchItem<AnalysisJob>('jobs', jobId, [
        { op: 'replace', path: '/status', value: 'cancelled' },
        { op: 'replace', path: '/modifiedAt', value: timestamp },
        { op: 'replace', path: '/modifiedBy', value: userId }
      ]);
      
      // Trigger cancellation in the orchestrator
      if (job.status === 'running') {
        // await cancelJobOrchestration(jobId);
      }
      
      return ok(updatedJob);
    } catch (error) {
      context.error('Error cancelling job:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "CancelJob",
  Route: "v1/jobs/{id}/cancel",
  Handler: CancelJobHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as { projectId: string, id: string },
  Output: {} as AnalysisJob,
};