// @filename: onboarding-orchestration/membership/create.ts
import type { HttpHandler, HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { SupportedEventMap, NotificationRequest } from './_schema';
import type { EnhacedLogContext } from '~/utils/protect';
import { NotificationRequestSchema } from './_schema';

import * as df from 'durable-functions';

import { badRequest, handleApiError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to fire an onboarding event notification
 * - Creates a durable orchestration to handle the entire onboarding flow
 * 
 * POST /api/v1/onboarding/event
 */
const OnboardingEventNotification: HttpHandler = secureEndpoint(
  {
    permissions: [],
    match: "any"
  },
  async (req: Request | HttpRequest, context: InvocationContext & EnhacedLogContext): Promise<HttpResponseInit> => {
    try {
      // Retrieve workspace and project context
      const { workspace, project } = context?.requestContext ?? await getRequestContext(req);
      const request = req as HttpRequest;

      // Parse and validate request body using the Zod schema
      const payload = await request.json();
      const parseResult = NotificationRequestSchema.safeParse(payload);

      if (!parseResult.success) {
        const errorMessages = parseResult.error.errors
          .map(err => `${err.path.join('.')}: ${err.message}`)
          .join(', ');
        return badRequest(`Validation error: ${errorMessages}`);
      }
      
      const input = parseResult.data;
      const { eventType, resourceType, resourceId, instanceId } = input;

      // Although the schema enforces non-empty values, double-check resource context if needed
      if (resourceType === 'workspace' && (!workspace || workspace.id !== resourceId)) {
        return badRequest('Invalid workspace context');
      }
      if (resourceType === 'project' && (!project || project.id !== resourceId)) {
        return badRequest('Invalid project context');
      }
      if (!instanceId) {
        return badRequest('Instance ID is required');
      }

      // Start the onboarding orchestration
      const client = df.getClient(context);

      // Raise the event to the waiting orchestrator using the proper type mapping
      await client.raiseEvent(instanceId, eventType, {
        resourceId,
        resourceType,
      } as SupportedEventMap[typeof eventType]);

      return ok({
        message: 'Workspace creation event raised successfully',
        instanceId,
      });
    } catch (error) {
      context.error('Error raising resource created event:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: "OnboardingEventNotification",
  Route: "v1/onboarding/event",
  Handler: OnboardingEventNotification,
  Methods: ["POST"] as HttpMethod[],
  Input: {} as NotificationRequest, // You may update this to NotificationRequest if needed
  Output: void 0 as void,
};
