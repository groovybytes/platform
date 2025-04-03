import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { app } from '@azure/functions';
import { badRequest } from '../utils/error';
import type { OnboardingInput } from './onboardingOrchestrator';

/**
 * HTTP Trigger to start the user onboarding process
 * - Creates a durable orchestration to handle the entire onboarding flow
 */
const StartOnboardingHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const client = df.getClient(context);
  
  try {
    // Parse and validate request body
    const body = await request.json() as OnboardingInput;

    // Validate required fields
    if (!body.userId || !body.email) {
      return badRequest('userId and email are required');
    }

    // Start the onboarding orchestration
    const instanceId = await client.startNew('OnboardingOrchestrator', {
      input: {
        userId: body.userId,
        email: body.email,
        name: body.name || body.email.split('@')[0]
      }
    });

    context.log(`Started onboarding orchestration with ID = '${instanceId}'.`);

    // Return the status response which includes management URLs
    return client.createCheckStatusResponse(request, instanceId);
  } catch (error) {
    context.error('Error starting onboarding:', error);
    
    return {
      status: 500,
      jsonBody: { 
        error: 'Failed to start onboarding process',
        message: process.env.NODE_ENV === 'development' ? error.message : undefined
      }
    };
  }
};

// Register the HTTP trigger
app.http('StartOnboarding', {
  route: 'api/onboarding/start',
  methods: ['POST'],
  authLevel: 'anonymous', // Update based on your security requirements
  extraInputs: [df.input.durableClient()],
  handler: StartOnboardingHandler,
});

export default StartOnboardingHandler;