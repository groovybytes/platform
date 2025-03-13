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


// ---------------------------------------------------------
// Orchestrator Function for User Onboarding
// ---------------------------------------------------------

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
df.app.orchestration('OnboardingOrchestrator', OnboardingOrchestratorHandler);


// ---------------------------------------------------------
// Activity Functions
// ---------------------------------------------------------

const CreateUserRecord: ActivityHandler = async (input: CreateUserInput): Promise<User> => {
  const { userId, email, name } = input;

  // Connect to Cosmos DB
  const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
  const database = cosmosClient.database(process.env.COSMOS_DATABASE_NAME!);
  const usersContainer = database.container("users");

  const timestamp = new Date().toISOString();

  // Prepare user record
  const userRecord: User = {
    id: userId,
    entraId: userId,
    name: name || email.split("@")[0],
    status: "active",
    preferences: {
      language: "en-US",
      timezone: "UTC"
    },
    emails: {
      primary: email,
      all: [email]
    },
    roles: {
      workspaces: {},
      projects: {}
    },
    createdAt: timestamp,
    modifiedAt: timestamp
  };

  // Create or replace the user
  try {
    const { resource: existingUser } = await usersContainer.item(userId, userId).read();
    if (existingUser) {
      // Update existing user
      await usersContainer.item(userId, userId).replace(userRecord);
    } else {
      // Create new user
      await usersContainer.items.create(userRecord);
    }
  } catch (error) {
    if ((error as ErrorResponse).code === 404) {
      // User doesn't exist, create it
      await usersContainer.items.create(userRecord);
    } else {
      throw error;
    }
  }

  return userRecord;
};

// Register the activity
df.app.activity('CreateUserRecord', { handler: CreateUserRecord });

const ProcessPendingInvites: ActivityHandler = async (input: ProcessInvitesInput): Promise<any[]> => {
  const { userId, email } = input;

  // Implementation details for processing invites
  // ...

  return []; // Return processed invites
};

df.app.activity('ProcessPendingInvites', { handler: ProcessPendingInvites });

const SendWelcomeEmail: ActivityHandler = async (input: EmailInput): Promise<void> => {
  const { userId, email, name } = input;

  // Implementation using Azure Communication Services
  const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING!);

  await emailClient.beginSend({
    senderAddress: process.env.EMAIL_SENDER_ADDRESS!,
    content: {
      subject: `Welcome to our Platform!`,
      plainText: `
                Hello ${name},
                
                Welcome to our platform! We're excited to have you on board.
                
                To get started, you can create your first workspace by clicking the button below.
                
                Best regards,
                The Platform Team
            `,
      html: `
                <p>Hello ${name},</p>
                
                <p>Welcome to our platform! We're excited to have you on board.</p>
                
                <p>To get started, you can create your first workspace by clicking the button below.</p>
                
                <p><a href="${process.env.APP_BASE_URL}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace</a></p>
                
                <p>Best regards,<br>The Platform Team</p>
            `
    },
    recipients: {
      to: [{ address: email }]
    }
  });
};

df.app.activity('SendWelcomeEmail', { handler: SendWelcomeEmail });

// Other activity functions would follow the same pattern

// ---------------------------------------------------------
// Missing Activity Functions
// ---------------------------------------------------------

// Send reminder email when workspace creation times out
const SendReminderEmail: ActivityHandler = async (input: ReminderEmailInput): Promise<void> => {
  const { userId, email, name, attempt, maxAttempts } = input;

  // Get email client
  const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING!);

  // Create a more urgent message based on attempt number
  const remainingAttempts = maxAttempts - attempt;
  const urgencyLevel = attempt === 1 ? 'gentle' : attempt === 2 ? 'moderate' : 'urgent';

  let subject, message;

  switch (urgencyLevel) {
    case 'gentle':
      subject = 'Reminder: Complete Your Workspace Setup';
      message = `<p>Hello ${name},</p>
                <p>We noticed you haven't created your workspace yet. Setting up your workspace is a quick process that will help you get the most out of our platform.</p>
                <p>Ready to get started?</p>`;
      break;
    case 'moderate':
      subject = 'Action Required: Your Workspace Setup is Pending';
      message = `<p>Hello ${name},</p>
                <p>This is your second reminder that your workspace setup is still pending. Your onboarding process won't be complete until you create a workspace.</p>
                <p>It only takes a minute to get set up:</p>`;
      break;
    case 'urgent':
      subject = 'Final Reminder: Complete Your Workspace Setup Soon';
      message = `<p>Hello ${name},</p>
                <p><strong>Important notice:</strong> Your onboarding process will be automatically cancelled in ${remainingAttempts === 1 ? 'one more day' : `${remainingAttempts} days`} if you don't create a workspace.</p>
                <p>Please complete this final step to activate your account:</p>`;
      break;
  }

  await emailClient.beginSend({
    senderAddress: process.env.EMAIL_SENDER_ADDRESS!,
    content: {
      subject: subject,
      plainText: `
                Hello ${name},
                
                ${subject}
                
                To create your workspace, please visit: ${process.env.APP_BASE_URL}/workspaces/new
                
                Need help? Reply to this email or contact our support team.
                
                Best regards,
                The Platform Team
            `,
      html: `
                ${message}
                
                <p><a href="${process.env.APP_BASE_URL}/workspaces/new" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Create Workspace Now</a></p>
                
                <p>Need help? Reply to this email or contact our support team.</p>
                
                <p>Best regards,<br>The Platform Team</p>
            `
    },
    recipients: {
      to: [{ address: email }]
    }
  });
};

// Register the activity
df.app.activity('SendReminderEmail', { handler: SendReminderEmail });

// Send email when onboarding is abandoned
const SendOnboardingAbandonedEmail: ActivityHandler = async (input: EmailInput): Promise<void> => {
  const { userId, email, name } = input;

  // Get email client
  const emailClient = new EmailClient(process.env.COMMUNICATION_SERVICES_CONNECTION_STRING!);

  await emailClient.beginSend({
    senderAddress: process.env.EMAIL_SENDER_ADDRESS!,
    content: {
      subject: 'Your Onboarding Process Has Been Paused',
      plainText: `
                Hello ${name},
                
                We noticed you started but didn't complete the onboarding process for our platform. Your onboarding has been paused for now.
                
                No worries though! You can restart the process anytime by visiting ${process.env.APP_BASE_URL}/onboarding/restart
                
                If you have any questions or need assistance, please reply to this email or contact our support team.
                
                Best regards,
                The Platform Team
            `,
      html: `
                <p>Hello ${name},</p>
                
                <p>We noticed you started but didn't complete the onboarding process for our platform. Your onboarding has been paused for now.</p>
                
                <p>No worries though! You can restart the process anytime:</p>
                
                <p><a href="${process.env.APP_BASE_URL}/onboarding/restart" style="padding: 10px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 4px;">Restart Onboarding</a></p>
                
                <p>If you have any questions or need assistance, please reply to this email or contact our support team.</p>
                
                <p>Best regards,<br>The Platform Team</p>
            `
    },
    recipients: {
      to: [{ address: email }]
    }
  });

  // Also update the user status in the database
  const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
  const database = cosmosClient.database(process.env.COSMOS_DATABASE_NAME!);
  const usersContainer = database.container("users");

  try {
    const { resource: user } = await usersContainer.item(userId, userId).read();
    if (user) {
      await usersContainer.item(userId, userId).patch([
        { op: "replace", path: "/status", value: "onboarding_abandoned" },
        { op: "replace", path: "/modifiedAt", value: new Date().toISOString() }
      ]);
    }
  } catch (error) {
    // Log the error but don't throw it
    console.error(`Failed to update user status for abandoned onboarding: ${error}`);
  }
};

// Register the activity
df.app.activity('SendOnboardingAbandonedEmail', { handler: SendOnboardingAbandonedEmail });

// Set up initial workspace content
const SetupInitialContent: ActivityHandler = async (input: SetupWorkspaceInput): Promise<void> => {
  const { userId, workspaceId } = input;

  // Connect to Cosmos DB
  const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
  const database = cosmosClient.database(process.env.COSMOS_DATABASE_NAME!);
  const workspacesContainer = database.container("workspaces");
  const contentContainer = database.container("content");

  // Get the workspace to verify ownership
  try {
    const { resource: workspace } = await workspacesContainer.item(workspaceId, workspaceId).read();

    if (!workspace) {
      throw new Error(`Workspace ${workspaceId} not found`);
    }

    // Check if the user has access to the workspace
    if (workspace.ownerId !== userId && !workspace.members.includes(userId)) {
      throw new Error(`User ${userId} does not have access to workspace ${workspaceId}`);
    }

    // Create welcome content items
    const timestamp = new Date().toISOString();

    // Create a welcome document
    await contentContainer.items.create({
      id: `welcome-${workspaceId}`,
      workspaceId,
      type: "document",
      title: "Welcome to Your Workspace",
      content: "# Welcome to Your New Workspace\n\nThis is your first document. You can edit it or create new ones.",
      createdBy: userId,
      createdAt: timestamp,
      modifiedAt: timestamp
    });

    // Create a sample project
    await contentContainer.items.create({
      id: `project-${workspaceId}`,
      workspaceId,
      type: "project",
      title: "Getting Started Project",
      description: "A sample project to help you get started",
      members: [userId],
      createdBy: userId,
      createdAt: timestamp,
      modifiedAt: timestamp
    });

    // Update workspace with initial content references
    await workspacesContainer.item(workspaceId, workspaceId).patch([
      { op: "replace", path: "/status", value: "active" },
      { op: "replace", path: "/setupCompleted", value: true },
      { op: "replace", path: "/modifiedAt", value: timestamp }
    ]);

  } catch (error) {
    console.error(`Failed to set up initial workspace content: ${error}`);
    throw error;
  }
};

// Register the activity
df.app.activity('SetupInitialContent', { handler: SetupInitialContent });

// Track onboarding progress
const TrackOnboardingProgress: ActivityHandler = async (input: TrackProgressInput): Promise<void> => {
  const { userId, workspaceId, step } = input;

  // Connect to Cosmos DB
  const cosmosClient = new CosmosClient(process.env.COSMOS_CONNECTION_STRING!);
  const database = cosmosClient.database(process.env.COSMOS_DATABASE_NAME!);
  const analyticsContainer = database.container("analytics");
  const usersContainer = database.container("users");

  const timestamp = new Date().toISOString();

  // Record the analytics event
  await analyticsContainer.items.create({
    id: `onboarding-${userId}-${timestamp}`,
    type: "onboarding_event",
    userId,
    workspaceId,
    step,
    timestamp
  });

  // Update user record if this is the completion step
  if (step === 'completed') {
    try {
      await usersContainer.item(userId, userId).patch([
        { op: "replace", path: "/status", value: "active" },
        { op: "replace", path: "/onboardingCompleted", value: true },
        { op: "replace", path: "/onboardingCompletedAt", value: timestamp },
        { op: "replace", path: "/modifiedAt", value: timestamp }
      ]);
    } catch (error) {
      console.error(`Failed to update user status for completed onboarding: ${error}`);
      // Don't throw the error as we've already recorded the event
    }
  }
};

// Register the activity
df.app.activity('TrackOnboardingProgress', { handler: TrackOnboardingProgress });

// ---------------------------------------------------------
// HTTP Trigger to start onboarding
// ---------------------------------------------------------

const StartOnboardingHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const client = df.getClient(context);
  const body = await request.json() as OnboardingInput;

  // Validate required fields
  if (!body.userId || !body.email) {
    return {
      status: 400,
      jsonBody:{ error: 'userId and email are required' },
      headers: new Headers(Object.entries({ 'Content-Type': 'application/json' }))
    };
  }

  const instanceId = await client.startNew('OnboardingOrchestrator', {
    input: {
      userId: body.userId,
      email: body.email,
      name: body.name || body.email.split('@')[0]
    }
  });

  context.log(`Started onboarding orchestration with ID = '${instanceId}'.`);

  return client.createCheckStatusResponse(request, instanceId);
};

app.http('StartOnboarding', {
  route: 'api/onboarding/start',
  methods: ['POST'],
  authLevel: 'anonymous',
  extraInputs: [df.input.durableClient()],
  handler: StartOnboardingHandler,
});

// ---------------------------------------------------------
// HTTP Trigger to signal workspace creation
// ---------------------------------------------------------

const WorkspaceCreatedHandler: HttpHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  const client = df.getClient(context);
  const body = await request.json() as OnboardingInput & WorkspaceCreatedEvent & { instanceId?: string };

  // Validate required fields
  if (!body.instanceId || !body.userId || !body.workspaceId) {
    return {
      status: 400,
      body: JSON.stringify({ error: 'instanceId, userId and workspaceId are required' }),
      headers: { 'Content-Type': 'application/json' }
    };
  }

  // Raise the event to the waiting orchestrator
  await client.raiseEvent(body.instanceId, 'WorkspaceCreated', {
    userId: body.userId,
    workspaceId: body.workspaceId
  });

  return {
    status: 200,
    body: JSON.stringify({
      message: 'Workspace creation event raised successfully',
      instanceId: body.instanceId
    }),
    headers: { 'Content-Type': 'application/json' }
  };
};

app.http('WorkspaceCreated', {
  route: 'api/onboarding/workspace-created',
  methods: ['POST'],
  authLevel: 'anonymous',
  extraInputs: [df.input.durableClient()],
  handler: WorkspaceCreatedHandler,
});

// ---------------------------------------------------------
// Type definitions
// ---------------------------------------------------------

interface OnboardingInput {
  userId: string;
  email: string;
  name?: string;
}

interface CreateUserInput {
  userId: string;
  email: string;
  name?: string;
}

interface ProcessInvitesInput {
  userId: string;
  email: string;
}

interface EmailInput {
  userId: string;
  email: string;
  name: string;
}

interface WorkspaceCreatedEvent {
  userId: string;
  workspaceId: string;
}

interface ReminderEmailInput extends EmailInput {
  attempt: number;
  maxAttempts: number;
}

interface SetupWorkspaceInput {
  userId: string;
  workspaceId: string;
}

interface TrackProgressInput {
  userId: string;
  workspaceId: string;
  step: 'started' | 'workspace_created' | 'content_setup' | 'completed';
}