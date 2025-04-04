// @filename: job-management/endpoints/status.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { AnalysisJob } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { secureEndpoint, type EnhacedLogContext } from '~/utils/protect';
import { readItem, patchItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';
import { getRequestContext } from '~/utils/context';
import { getSparkJobStatus } from '~/utils/synapse/spark';
import type { PatchOperation } from '@azure/cosmos';

interface JobStatusResponse {
  job: AnalysisJob;
  sparkJobStatus?: {
    state: string;
    createdTime: string;
    lastUpdatedTime: string;
    metrics?: Record<string, any>;
  }
}

/**
 * Map Spark batch job state to AnalysisJob status
 */
function mapSparkStateToJobStatus(sparkState: string): AnalysisJob['status'] {
  switch (sparkState.toLowerCase()) {
    case 'not_started':
    case 'starting':
    case 'running':
    case 'recovering':
      return 'running';
    case 'success':
    case 'dead':  // Successful but terminated
      return 'completed';
    case 'killed':
      return 'cancelled';
    case 'failed':
    case 'error':
      return 'failed';
    default:
      return 'running';  // Default to running for unknown states
  }
}

/**
 * HTTP Trigger to get detailed job status including Spark job details
 * GET /api/v1/jobs/{id}/status
 */
const GetJobStatusHandler: HttpHandler = secureEndpoint(
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
      const job = await readItem<AnalysisJob>('jobs', jobId, project.id);
      
      if (!job) {
        return notFound('Job', jobId);
      }
      
      // Verify the job belongs to the specified project
      if (job.projectId !== project.id) {
        return notFound('Job', jobId);
      }
      
      // Check if we have a Spark batch ID to get status
      let sparkJobStatus: any = null;
      if (job.sparkId) {
        try {
          // Get Spark job status
          const sparkJob = await getSparkJobStatus(+job.sparkId);
          if (sparkJob) {
            // Map Spark state to job status
            const newStatus = mapSparkStateToJobStatus(sparkJob.state!);
            
            // Prepare spark job status response
            sparkJobStatus = {
              state: sparkJob.state,
              createdTime: sparkJob?.livyInfo?.runningAt || job.createdAt,
              lastUpdatedTime: sparkJob?.livyInfo?.terminatedAt || new Date().toISOString(),
            };
            
            // Update job status in Cosmos DB if it has changed
            if (job.status !== newStatus || job.sparkJobState !== sparkJob.state) {
              const operations: PatchOperation[] = [
                { op: 'replace', path: '/status', value: newStatus },
                { op: 'replace', path: '/sparkJobState', value: sparkJob.state }
              ];
              
              // Add additional information based on status
              if (newStatus === 'completed' && job.status !== 'completed') {
                operations.push({ op: 'replace', path: '/completedAt', value: new Date().toISOString() });
              }
              
              if (sparkJob.appInfo) {
                operations.push({
                  op: 'replace',
                  path: '/sparkJobDetails',
                  value: {
                    submissionTime: sparkJob?.livyInfo?.runningAt,
                    terminationTime: sparkJob?.livyInfo?.terminatedAt,
                  }
                });
              }
              
              // Update the job in the database
              await patchItem<AnalysisJob>('jobs', jobId, operations, project.id);
              
              // Update the local job object with changes
              job.status = newStatus;
              job.sparkJobState = sparkJob.state;
              if (newStatus === 'completed' && !job.completedAt) {
                job.completedAt = new Date().toISOString();
              }
            }
          }
        } catch (sparkError) {
          context.warn('Error getting Spark job status:', sparkError);
          // Don't fail the whole request if we can't get Spark status
        }
      }
      
      // Prepare response
      const response: JobStatusResponse = {
        job,
        sparkJobStatus
      };

      return ok(response);
    } catch (error) {
      context.error('Error getting job status:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "GetJobStatus",
  Route: "v1/jobs/{id}/status",
  Handler: GetJobStatusHandler,
  Methods: ["GET"] as HttpMethod[],
  Input: {} as { projectId: string, id: string },
  Output: {} as JobStatusResponse,
};