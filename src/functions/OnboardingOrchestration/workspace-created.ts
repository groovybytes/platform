import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { app } from '@azure/functions';
import { badRequest } from '../utils/error';
import type { OnboardingInput } from './onboardingOrchestrator';
import type { WorkspaceCreatedEvent } from './onboardingOrchestrator';

// Interface combining onboarding input and event with instance ID
interface WorkspaceCreatedRequest extends OnboardingInput, WorkspaceCreatedEvent {
  instanceId: string; // Orchestration instance ID
}

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

    return {
      status: 200,
      jsonBody: {
        message: 'Workspace creation event raised successfully',
        instanceId: body.instanceId
      }
    };
  } catch (error) {
    context.error('Error raising workspace created event:', error);
    
    return {
      status: 500,
      jsonBody: { 
        error: 'Failed to process workspace creation event',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
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