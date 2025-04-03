// @filename: user-management/membership/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { EnhacedLogContext } from '~/utils/protect';

import * as df from 'durable-functions';
import OnboardingOrchestrator from '../orchestrator/onboarding';

import { badRequest, handleApiError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

/**
 * HTTP Trigger to start the user onboarding process
 * - Creates a durable orchestration to handle the entire onboarding flow
 * 
 * POST /api/v1/onboarding/start
 */
const StartOnboardingHandler: HttpHandler = secureEndpoint(
  {
    permissions: ["workspace:*:members:invite:allow", "project:*:members:invite:allow"],
    match: "any",
    requireResource: "either"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      const { request: { userId: currentUserId }, workspace, project } = context?.requestContext ?? await getRequestContext(req);

      const client = df.getClient(context);
      const request = req as HttpRequest;

      // Parse and validate request body
      const input = await request.json() as typeof OnboardingOrchestrator.Input;
      const { name, email, resourceType, resourceId, membershipType } = input;
  
      // Validate input
      if (!email) {
        return badRequest('Email is required');
      }
      
      if (!resourceType || !resourceId) {
        return badRequest('Resource type and ID are required');
      }
      
      if (!membershipType) {
        return badRequest('Membership type is required');
      }
      
      // Validate that the user has permission for the specified resource
      if (resourceType === 'workspace' && (!workspace || workspace.id !== resourceId)) {
        return badRequest('Invalid workspace context');
      }
      
      if (resourceType === 'project' && (!project || project.id !== resourceId)) {
        return badRequest('Invalid project context');
      }
      
      // Start the onboarding orchestration
      const instanceId = await client.startNew(OnboardingOrchestrator.Name, {
        input: Object.assign({
          name: name || email.split('@')[0],
        } as typeof OnboardingOrchestrator.Input, input),
      });
  
      context.log(`Started onboarding orchestration with ID = '${instanceId}'.`);
  
      // Return the status response which includes management URLs
      return client.createCheckStatusResponse(request, instanceId);
    } catch (error) {
      context.error('Error starting onboarding:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "StartOnboarding",
  Route: "v1/onboarding/start",
  Handler: StartOnboardingHandler,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as typeof OnboardingOrchestrator.Input,
  Output: void 0 as void,
};