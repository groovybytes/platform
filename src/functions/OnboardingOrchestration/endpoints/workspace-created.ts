import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { app } from '@azure/functions';
import { badRequest } from '../utils/error';
import type { OnboardingInput } from './onboardingOrchestrator';
import { ok } from '~/utils/response';


/**
 * HTTP Trigger to signal workspace creation to the onboarding orchestration
 * - Raises an external event to the waiting orchestrator
 */
const WorkspaceCreatedHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const client = df.getClient(context);
  
  try {
    // Parse and validate request body
    const body = await request.json() as WorkspaceCreatedRequest;

    // Validate required fields
    if (!body.instanceId || !body.userId || !body.workspaceId) {
      return badRequest('instanceId, userId and workspaceId are required');
    }

    // Raise the event to the waiting orchestrator
    await client.raiseEvent(body.instanceId, 'WorkspaceCreated', {
      userId: body.userId,
      workspaceId: body.workspaceId
    });

    return ok({
      message: 'Workspace creation event raised successfully',
      instanceId: body.instanceId
    });
  } catch (error) {
    context.error('Error raising workspace created event:', error);
    return 
  }
};

// Register the HTTP trigger
app.http('WorkspaceCreated', {
  route: 'api/onboarding/workspace-created',
  methods: ['POST'],
  authLevel: 'anonymous', // Update based on your security requirements
  extraInputs: [df.input.durableClient()],
  handler: WorkspaceCreatedHandler,
});

export default WorkspaceCreatedHandler;