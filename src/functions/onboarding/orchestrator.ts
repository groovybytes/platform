import type { ActivityHandler, OrchestrationContext, OrchestrationHandler } from 'durable-functions';
import type { HttpHandler, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { User } from '~/types/operational.ts';
import type { ErrorResponse } from "@azure/cosmos";

import * as df from 'durable-functions';
import { app } from '@azure/functions';
import { CosmosClient } from "@azure/cosmos";

import { EmailClient } from '@azure/communication-email';
import { waitForEventWithRetries } from '~/utils/durable.ts';

import process from "node:process";

// Define the input and event types for strong typing
export interface OnboardingInput {
  userId: string;
  email: string;
  name?: string;
}

export interface WorkspaceCreatedEvent {
  userId: string;
  workspaceId: string;
}

/**
 * Durable function orchestrator for user onboarding process
 * 
 * Steps:
 * 1. Create or update user record
 * 2. Process any pending invites
 * 3. Send welcome email
 * 4. Wait for workspace creation (with timeouts and reminders)
 * 5. Set up initial workspace content
 * 6. Track onboarding progress
 */
const OnboardingOrchestratorHandler: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput() as OnboardingInput;
  const userId = input.userId;
  const email = input.email;
  const name = input.name || email.split('@')[0];

  // Step 1: Create or update user record
  const userRecord = yield context.df.callActivity('CreateUserRecord', {
    userId, email, name
  });

  // Step 2: Process any pending invites
  const invites = yield context.df.callActivity('ProcessPendingInvites', {
    userId, email
  });

  // Step 3: Send welcome email
  yield context.df.callActivity('SendWelcomeEmail', {
    userId, email, name
  });

  // Step 4: Wait for workspace creation with retries using our utility function
  const result = yield* waitForEventWithRetries<OnboardingInput, WorkspaceCreatedEvent>(
    context,
    {
      eventName: 'WorkspaceCreated',
      retryOptions: new df.RetryOptions(24 * 60 * 60 * 1000, 5), // 24 hours timeout, 5 retries
      originalInput: input,

      // Handle retry scenario (send reminder)
      onRetryActivity: {
        name: 'SendReminderEmail',
        getInput: (input, retryCount, maxRetries) => ({
          userId: input.userId,
          email: input.email,
          name: input.name || input.email.split('@')[0],
          attempt: retryCount,
          maxAttempts: maxRetries
        })
      },

      // Handle abandoned scenario (notify user onboarding is cancelled)
      onAbandonedActivity: {
        name: 'SendOnboardingAbandonedEmail',
        getInput: (input, maxRetries) => ({
          userId: input.userId,
          email: input.email,
          name: input.name || input.email.split('@')[0]
        })
      }
    }
  );

  // If onboarding was abandoned, return early with status
  if (!result.succeeded) {
    return {
      userId,
      status: 'onboarding_abandoned',
      message: `User did not complete workspace creation after ${result.retryCount} reminders`
    };
  }

  // Extract workspace ID from the event data
  const workspaceId = result.eventData!.workspaceId;

  // Step 5: Set up initial workspace content
  yield context.df.callActivity('SetupInitialContent', {
    userId, workspaceId
  });

  // Step 6: Track onboarding progress
  yield context.df.callActivity('TrackOnboardingProgress', {
    userId,
    workspaceId,
    step: 'completed'
  });

  return {
    userId,
    workspaceId,
    status: 'onboarding_completed'
  };
};

// Register the orchestrator
const _OrchestratorName = 'OnboardingOrchestrator';
const _OrchestratorHandler = OnboardingOrchestratorHandler;
df.app.orchestration(_OrchestratorName, _OrchestratorHandler);

export type Input = OnboardingInput;
export type Output = void;
export default {
  name: _OrchestratorName,
  handler: _OrchestratorHandler
};
