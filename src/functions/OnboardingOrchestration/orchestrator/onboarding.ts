// @filename: onboarding/orchestrators/onboarding-orchestrator.ts
import type { OrchestrationContext, OrchestrationHandler } from 'durable-functions';
import type { SupportedEventMap } from '../endpoints/event/_schema';
import type { OnboardingStatus } from '~/types/operational';

import * as df from 'durable-functions';
import { waitForEventWithRetries } from '~/utils/durable';

import SendWelcomeEmail from '../activities/send-welcome-email';
import SaveOnboardingStatus from '../activities/save-onboarding-status';
import SendWelcomeResourcesEmail from '../activities/send-welcome-resources-email';
import SendWorkspaceReminderEmail from '../activities/send-workspace-reminder-email';
import SendOnboardingAbandonedEmail from '../activities/send-onboarding-abandoned-email';
import SetupInitialWorkspaceContent from '../activities/setup-initial-workspace-content';

import SendProjectReminderEmail from '../activities/send-project-reminder-email';
import HandleAbandonedProject from '../activities/handle-abandoned-project';
import SetupInitialProjectContent from '../activities/setup-initial-project-content';
import SendProjectWelcomeResourcesEmail from '../activities/send-project-welcome-resources-email';
import SetupUserForWorkspace from '../activities/setup-user-for-workspace';
import SetupUserForProject from '../activities/setup-user-for-project';

/**
 * Durable function orchestrator for user onboarding processes.
 * Handles three types of onboarding:
 * 1. Invitation process
 * 2. New workspace creation process
 * 3. New project creation process
 * 
 * Each process has its own workflow with appropriate timeouts, reminders, and completion steps.
 */
const OnboardingOrchestratorHandler: OrchestrationHandler = function* (context: OrchestrationContext) {
  const input = context.df.getInput() as OnboardingInput;
  const { type, userId, email, name } = input;
  
  // Track the onboarding status in a consistent way
  let status: Omit<OnboardingStatus, 'id' | 'createdAt' | 'modifiedAt'> = {
    userId,
    type,
    status: 'in_progress',
    startedAt: context.df.currentUtcDateTime.toISOString(),
    steps: [
      {
        name: 'onboarding_started',
        status: 'completed',
        timestamp: context.df.currentUtcDateTime.toISOString()
      }
    ]
  };
  
  // Update the status to add tracking for the resource
  if (type === 'invite' && input.resourceId) {
    status.resourceId = input.resourceId;
    status.resourceType = input.resourceType;
  }

  try {
    // Handle different onboarding flows based on type
    switch (type) {
      case 'invite': {
        yield* handleInviteOnboarding(context, input, status);
        break;
      }
      
      case 'new_workspace': {
        yield* handleWorkspaceOnboarding(context, input, status);
        break;
      }
      
      case 'new_project': {
        yield* handleProjectOnboarding(context, input, status);
        break;
      }
      
      default: {
        throw new Error(`Unknown onboarding type: ${type}`);
      }
    }
    
    // Set final status
    status.status = 'completed';
    status.completedAt = context.df.currentUtcDateTime.toISOString();
    status.steps.push({
      name: 'onboarding_completed',
      status: 'completed',
      timestamp: context.df.currentUtcDateTime.toISOString()
    });
    
    // Save the final status
    yield context.df.callActivity(SaveOnboardingStatus.Name, status as typeof SaveOnboardingStatus.Input);
    
    return {
      status: 'completed',
      userId,
      type,
      completedAt: status.completedAt
    };
  } catch (error) {
    // Handle failure
    status.status = 'abandoned';
    status.steps.push({
      name: 'onboarding_failed',
      status: 'failed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: {
        error: (error as Error)?.message,
        stack: (error as Error)?.stack,
        type,
        userId,
      }
    });
    
    // Save the failed status
    yield context.df.callActivity(SaveOnboardingStatus.Name, status as typeof SaveOnboardingStatus.Input);
    
    return {
      status: 'failed',
      userId,
      type,
      error: (error as Error)?.message,
      stack: (error as Error)?.stack,
    };
  }
};

/**
 * Handle the invitation onboarding flow
 */
function* handleInviteOnboarding(
  context: OrchestrationContext,
  input: OnboardingInput,
  status: Omit<OnboardingStatus, 'id' | 'createdAt' | 'modifiedAt'>
): Generator<df.Task, void, any> {
  const { userId, resourceId, resourceType, membershipId } = input;
  
  // Note: This function would typically be started when an invitation is accepted,
  // not when it's created. So we don't need to wait for acceptance.
  
  // If a membership ID was provided, we can track it
  if (membershipId) {
    // Update status
    status.steps.push({
      name: 'invitation_accepted',
      status: 'completed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: { membershipId, resourceId, resourceType }
    });
  }
  
  // Process the new membership based on resource type
  if (resourceType === 'workspace') {
    // Set up workspace for the user
    yield context.df.callActivity(SetupUserForWorkspace.Name, {
      userId,
      workspaceId: resourceId
    } as typeof SetupUserForWorkspace.Input);
    
    status.steps.push({
      name: 'workspace_setup',
      status: 'completed',
      timestamp: context.df.currentUtcDateTime.toISOString()
    });
  } else if (resourceType === 'project') {
    // Set up project for the user
    yield context.df.callActivity(SetupUserForProject.Name, {
      userId,
      projectId: resourceId
    } as typeof SetupUserForProject.Input);
    
    status.steps.push({
      name: 'project_setup',
      status: 'completed',
      timestamp: context.df.currentUtcDateTime.toISOString()
    });
  }
  
  // Send welcome resources
  yield context.df.callActivity(SendWelcomeResourcesEmail.Name, {
    userId,
    resourceType,
    resourceId
  } as typeof SendWelcomeResourcesEmail.Input);
  
  status.steps.push({
    name: 'welcome_resources_sent',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
}

/**
 * Handle the new workspace onboarding flow
 */
function* handleWorkspaceOnboarding(
  context: OrchestrationContext,
  input: OnboardingInput,
  status: Omit<OnboardingStatus, 'id' | 'createdAt' | 'modifiedAt'>
): Generator<df.Task, void, any> {
  const { userId, email, name } = input;
  
  // Send welcome email
  yield context.df.callActivity(SendWelcomeEmail.Name, {
    userId,
    email,
    name: name || email.split('@')[0]
  } as typeof SendWelcomeEmail.Input);
  
  status.steps.push({
    name: 'welcome_email_sent',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
  
  // Wait for resource.created event with retries and reminders
  const workspaceCreationResult = yield* waitForEventWithRetries<OnboardingInput, SupportedEventMap['resource.created']>(
    context,
    {
      eventName: 'resource.created',
      retryOptions: new df.RetryOptions(24 * 60 * 60 * 1000, 5), // 24 hours timeout, 5 retries
      originalInput: input,
      
      // Send reminder email when timeout occurs
      onRetryActivity: {
        name: SendWorkspaceReminderEmail.Name,
        getInput: (input, retryCount, maxRetries): typeof SendWorkspaceReminderEmail.Input => ({
          userId: input.userId,
          email: input.email,
          name: input.name || input.email.split('@')[0],
          attempt: retryCount,
          maxAttempts: maxRetries
        })
      },
      
      // Send abandoned email when all retries are exhausted
      onAbandonedActivity: {
        name: SendOnboardingAbandonedEmail.Name,
        getInput: (input, maxRetries): typeof SendOnboardingAbandonedEmail.Input => ({
          userId: input.userId,
          email: input.email,
          name: input.name || input.email.split('@')[0],
          type: 'workspace'
        })
      }
    }
  );
  
  if (!workspaceCreationResult.succeeded) {
    // Onboarding abandoned
    status.steps.push({
      name: 'workspace_creation',
      status: 'failed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: {
        retryCount: workspaceCreationResult.retryCount,
        status: workspaceCreationResult.status
      }
    });
    
    throw new Error('Workspace creation timed out after multiple reminders');
  }
  
  // Get the workspace ID from the event
  const workspaceId = workspaceCreationResult.eventData!.resourceId;
  status.resourceId = workspaceId;
  status.resourceType = 'workspace';
  
  status.steps.push({
    name: 'workspace_created',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString(),
    details: { workspaceId }
  });
  
  // Wait for resource.initialized event
  const workspaceInitializedResult = yield* waitForEventWithRetries<OnboardingInput, SupportedEventMap['resource.initialized']>(
    context,
    {
      eventName: 'resource.initialized',
      retryOptions: new df.RetryOptions(12 * 60 * 60 * 1000, 3), // 12 hours timeout, 3 retries
      originalInput: input
    }
  );
  
  if (!workspaceInitializedResult.succeeded) {
    // Handle initialization failure
    status.steps.push({
      name: 'workspace_initialization',
      status: 'failed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: {
        retryCount: workspaceInitializedResult.retryCount,
        status: workspaceInitializedResult.status
      }
    });
    
    throw new Error('Workspace initialization timed out');
  }
  
  // Set up initial content
  yield context.df.callActivity(SetupInitialWorkspaceContent.Name, {
    userId,
    workspaceId
  } as typeof SetupInitialWorkspaceContent.Input);
  
  status.steps.push({
    name: 'initial_content_setup',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
  
  // Send welcome resources
  yield context.df.callActivity(SendWelcomeResourcesEmail.Name, {
    userId,
    resourceType: 'workspace',
    resourceId: workspaceId
  } as typeof SendWelcomeResourcesEmail.Input);
  
  status.steps.push({
    name: 'welcome_resources_sent',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
}

/**
 * Handle the new project onboarding flow
 */
function* handleProjectOnboarding(
  context: OrchestrationContext,
  input: OnboardingInput,
  status: Omit<OnboardingStatus, 'id' | 'createdAt' | 'modifiedAt'>
): Generator<df.Task, void, any> {
  const { userId, workspaceId } = input;
  
  if (!workspaceId) {
    throw new Error('Workspace ID is required for project onboarding');
  }
  
  // Wait for resource.created event for project
  const projectCreationResult = yield* waitForEventWithRetries<OnboardingInput, SupportedEventMap['resource.created']>(
    context,
    {
      eventName: 'resource.created',
      retryOptions: new df.RetryOptions(24 * 60 * 60 * 1000, 3), // 24 hours timeout, 3 retries
      originalInput: input,
      
      // Send reminder for project creation
      onRetryActivity: {
        name: SendProjectReminderEmail.Name,
        getInput: (_, retryCount, maxRetries): typeof SendProjectReminderEmail.Input => ({
          userId,
          workspaceId,
          attempt: retryCount,
          maxAttempts: maxRetries
        })
      },
      
      // Handle abandoned project creation
      onAbandonedActivity: {
        name: HandleAbandonedProject.Name,
        getInput: (input, maxRetries): typeof HandleAbandonedProject.Input => ({
          userId,
          workspaceId
        })
      }
    }
  );
  
  if (!projectCreationResult.succeeded) {
    // Onboarding abandoned
    status.steps.push({
      name: 'project_creation',
      status: 'failed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: {
        retryCount: projectCreationResult.retryCount,
        status: projectCreationResult.status
      }
    });
    
    throw new Error('Project creation timed out after multiple reminders');
  }
  
  // Get the project ID from the event
  const projectId = projectCreationResult.eventData!.resourceId;
  
  // Verify this is a project resource
  if (projectCreationResult.eventData!.resourceType !== 'project') {
    throw new Error('Expected project resource type but received: ' + projectCreationResult.eventData!.resourceType);
  }
  
  status.resourceId = projectId;
  status.resourceType = 'project';
  
  status.steps.push({
    name: 'project_created',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString(),
    details: { projectId, workspaceId }
  });
  
  // Wait for resource.initialized event
  const projectInitializedResult = yield* waitForEventWithRetries<OnboardingInput, SupportedEventMap['resource.initialized']>(
    context,
    {
      eventName: 'resource.initialized',
      retryOptions: new df.RetryOptions(12 * 60 * 60 * 1000, 3), // 12 hours timeout, 3 retries
      originalInput: input
    }
  );
  
  if (!projectInitializedResult.succeeded) {
    // Handle initialization failure
    status.steps.push({
      name: 'project_initialization',
      status: 'failed',
      timestamp: context.df.currentUtcDateTime.toISOString(),
      details: {
        retryCount: projectInitializedResult.retryCount,
        status: projectInitializedResult.status
      }
    });
    
    throw new Error('Project initialization timed out');
  }
  
  // Set up initial project content
  yield context.df.callActivity(SetupInitialProjectContent.Name, {
    userId,
    projectId,
    workspaceId
  } as typeof SetupInitialProjectContent.Input);
  
  status.steps.push({
    name: 'initial_content_setup',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
  
  // Send project welcome resources
  yield context.df.callActivity(SendProjectWelcomeResourcesEmail.Name, {
    userId,
    projectId,
    workspaceId
  } as typeof SendProjectWelcomeResourcesEmail.Input);
  
  status.steps.push({
    name: 'welcome_resources_sent',
    status: 'completed',
    timestamp: context.df.currentUtcDateTime.toISOString()
  });
}

/**
 * Input for the onboarding orchestrator
 */
export interface OnboardingInput {
  type: "invite" | "new_workspace" | "new_project";
  userId: string;
  email: string;
  name?: string;
  resourceId?: string;       // For invite type
  resourceType?: "workspace" | "project";  // For invite type
  membershipType?: "member" | "guest";     // For invite type
  workspaceId?: string;      // For new_project type
  membershipId?: string;     // For tracking membership ID
}

// Export the orchestrator definition
export default {
  Name: 'OnboardingOrchestrator',
  Handler: OnboardingOrchestratorHandler,
  Input: {} as OnboardingInput,
  Output: {} as {
    status: 'completed' | 'failed';
    userId: string;
    type: 'invite' | 'new_workspace' | 'new_project';
    completedAt?: string;
    error?: string;
  }
};