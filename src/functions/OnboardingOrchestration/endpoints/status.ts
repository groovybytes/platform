import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';

import { ok } from '~/utils/response';
import { badRequest, notFound, handleApiError } from '~/utils/error';

/**
 * HTTP Trigger to check onboarding orchestration status
 * - Retrieves the current status of a durable orchestration instance
 * 
 * GET /api/v1/onboarding/status/{instanceId}
 */
const GetOnboardingStatus: HttpHandler = async (
  req: Request | HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Extract instance ID from the URL parameters
    const instanceId = (req as any).params?.instanceId;
    if (!instanceId) {
      return badRequest('Missing instance ID', 'Instance ID is required');
    }
    
    // Create durable orchestration client
    const client = df.getClient(context);
    
    // Retrieve orchestration status
    const status = await client.getStatus(instanceId);
    if (!status) {
      return notFound('Orchestration', instanceId);
    }
    
    // Format the status response
    const result = {
      id: instanceId,
      status: status.runtimeStatus,
      createdTime: status.createdTime,
      lastUpdatedTime: status.lastUpdatedTime,
      output: status.output,
      customStatus: status.customStatus
    };
    
    return ok(result);
  } catch (error: any) {
    context.error('Error retrieving onboarding status:', error);
    return handleApiError(error);
  }
};

export default {
  Name: "GetOnboardingStatus",
  Route: "v1/onboarding/status/{instanceId}",
  Handler: GetOnboardingStatus,
  Methods: ["GET"] as HttpMethod[],
  Input: undefined as void,
  Output: undefined as void,
};
