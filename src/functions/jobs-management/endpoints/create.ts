// @filename: job-management/endpoints/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';
import type { AnalysisJob } from '~/types/operational';

import { badRequest, handleApiError, serverError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { createItem, patchItem } from '~/utils/cosmos/utils';
import { ok } from '~/utils/response';
import { nanoid } from 'nanoid';
import { getSparkJobConfigForAnalysis, submitSparkJob } from '~/utils/synapse/spark';

interface CreateJobRequest {
  analysisType: AnalysisJob['analysisType'];
  configuration: AnalysisJob['configuration'];
  schedule?: AnalysisJob['schedule'];
}

/**
 * HTTP Trigger to create a new analysis job
 * POST /api/v1/jobs
 */
const CreateJobHandler: HttpHandler = secureEndpoint(
  {
    permissions: "project:*:analysis:create:allow",
    requireResource: "project"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const request = req as HttpRequest;
      const body = await request.json() as CreateJobRequest;
      
      // Get user ID from request context
      const { request: { userId }, project } = context?.requestContext ?? await getRequestContext(request);
      
      if (!project || !project?.id) {
        return badRequest('Project ID is required');
      }
      
      if (!body.analysisType) {
        return badRequest('Analysis type is required');
      }
      
      if (!body.configuration || !body.configuration.dataSelectors || body.configuration.dataSelectors.length === 0) {
        return badRequest('Job configuration with data selectors is required');
      }

      const timestamp = new Date().toISOString();
      
      // Create the job record
      const jobRecord: AnalysisJob = {
        id: nanoid(),
        projectId: project.id,
        type: body.schedule ? 'scheduled' : 'ad-hoc',
        analysisType: body.analysisType,
        status: 'queued',
        configuration: body.configuration,
        schedule: body.schedule,
        createdAt: timestamp,
        createdBy: userId,
      };

      // Save job to database
      const createdJob = await createItem<AnalysisJob>('jobs', jobRecord);
      
      // Get Spark job configuration and submit to Synapse
      const sparkConfig = getSparkJobConfigForAnalysis(
        createdJob.analysisType,
        createdJob.id,
        createdJob.projectId,
        createdJob.configuration
      );
      
      try {
        // Submit the job to Synapse Spark
        const sparkJob = await submitSparkJob(sparkConfig);
        
        // Update the job record with Spark batch ID
        await patchItem<AnalysisJob>('jobs', createdJob.id, [
          { op: 'replace', path: '/status', value: 'running' },
          { op: 'replace', path: '/startedAt', value: new Date().toISOString() },
          { op: 'add', path: '/sparkBatchId', value: sparkJob.id },
          { op: 'add', path: '/sparkLivyId', value: sparkJob.appId }
        ], createdJob.projectId);
        
        // Add the Spark batch ID to the response
        return ok({
          ...createdJob,
          status: 'running',
          startedAt: new Date().toISOString(),
          sparkBatchId: sparkJob.id,
          sparkLivyId: sparkJob.appId
        });
      } catch (error) {
        // Update job status to failed if Spark submission fails
        await patchItem<AnalysisJob>('jobs', createdJob.id, [
          { op: 'replace', path: '/status', value: 'failed' },
          { op: 'add', path: '/error', value: `Failed to submit Spark job: ${(error as Error)?.message}` }
        ], createdJob.projectId);
        
        context.error('Error submitting Spark job:', error);
        return {
          status: 500,
          jsonBody: {
            ...createdJob,
            status: 'failed',
            error: `Failed to submit Spark job: ${(error as Error)?.message}`
          }
        };
      }
      
      return ok(createdJob);
    } catch (error) {
      context.error('Error creating job:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "CreateJob",
  Route: "v1/jobs",
  Handler: CreateJobHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as CreateJobRequest,
  Output: {} as AnalysisJob,
};