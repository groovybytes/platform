// @filename: onboarding/orchestrators/index.ts
import type { OrchestratorDefinition, ActivityDefinition, EndpointDefinition } from '~/types/definitions';
import * as df from 'durable-functions';

// Import all activity definitions
import SaveOnboardingStatus from './activities/save-onboarding-status';
import ProcessPendingInvites from './activities/process-pending-invites';
import SendWelcomeEmail from './activities/send-welcome-email';
import SendWorkspaceReminderEmail from './activities/send-workspace-reminder-email';
import SendOnboardingAbandonedEmail from './activities/send-onboarding-abandoned-email';
import SetupInitialWorkspaceContent from './activities/setup-initial-workspace-content';
import SendWelcomeResourcesEmail from './activities/send-welcome-resources-email';

// Additional activities would be imported here
import SetupUserForWorkspace from './activities/setup-user-for-workspace';
import SetupUserForProject from './activities/setup-user-for-project';
import SetupInitialProjectContent from './activities/setup-initial-project-content';
import SendProjectWelcomeResourcesEmail from './activities/send-project-welcome-resources-email';
import SendProjectReminderEmail from './activities/send-project-reminder-email';
import HandleAbandonedProject from './activities/handle-abandoned-project';

// Import all orchestrator definitions
import OnboardingOrchestrator from './orchestrator/onboarding';

// Import all endpoint definitions
import OnboardingEventNotification from './endpoints/event/event';
import OnboardingStatus from './endpoints/status';
import StartOnboarding from './endpoints/start';

import { app } from '@azure/functions';

// Create the Orchestrators object
export const Orchestrators: Record<string, OrchestratorDefinition> = {
  OnboardingOrchestrator: {
    name: OnboardingOrchestrator.Name,
    handler: OnboardingOrchestrator.Handler,
    input: OnboardingOrchestrator.Input,
    output: OnboardingOrchestrator.Output,
  }
};

// Register all orchestration functions
Object.values(Orchestrators).forEach(orchestrator => {
  df.app.orchestration(orchestrator.name, orchestrator.handler);
});

// Input/Output type definitions
export type OnboardingOrchestratorInput = typeof OnboardingOrchestrator.Input;
export type OnboardingOrchestratorOutput = typeof OnboardingOrchestrator.Output;


// Create the Activities object
export const Activities: Record<string, ActivityDefinition> = {
  SaveOnboardingStatus: {
    name: SaveOnboardingStatus.Name,
    handler: SaveOnboardingStatus.Handler,
    input: SaveOnboardingStatus.Input,
    output: SaveOnboardingStatus.Output,
  },
  ProcessPendingInvites: {
    name: ProcessPendingInvites.Name,
    handler: ProcessPendingInvites.Handler,
    input: ProcessPendingInvites.Input,
    output: ProcessPendingInvites.Output,
  },
  SendWelcomeEmail: {
    name: SendWelcomeEmail.Name,
    handler: SendWelcomeEmail.Handler,
    input: SendWelcomeEmail.Input,
    output: SendWelcomeEmail.Output,
  },
  SendWorkspaceReminderEmail: {
    name: SendWorkspaceReminderEmail.Name,
    handler: SendWorkspaceReminderEmail.Handler,
    input: SendWorkspaceReminderEmail.Input,
    output: SendWorkspaceReminderEmail.Output,
  },
  SendOnboardingAbandonedEmail: {
    name: SendOnboardingAbandonedEmail.Name,
    handler: SendOnboardingAbandonedEmail.Handler,
    input: SendOnboardingAbandonedEmail.Input,
    output: SendOnboardingAbandonedEmail.Output,
  },
  SetupInitialWorkspaceContent: {
    name: SetupInitialWorkspaceContent.Name,
    handler: SetupInitialWorkspaceContent.Handler,
    input: SetupInitialWorkspaceContent.Input,
    output: SetupInitialWorkspaceContent.Output,
  },
  SendWelcomeResourcesEmail: {
    name: SendWelcomeResourcesEmail.Name,
    handler: SendWelcomeResourcesEmail.Handler,
    input: SendWelcomeResourcesEmail.Input,
    output: SendWelcomeResourcesEmail.Output,
  },
  
  // Additional activities would be added here
  SetupUserForWorkspace: {
    name: SetupUserForWorkspace.Name,
    handler: SetupUserForWorkspace.Handler,
    input: SetupUserForWorkspace.Input,
    output: SetupUserForWorkspace.Output,
  },
  SetupUserForProject: {
    name: SetupUserForProject.Name,
    handler: SetupUserForProject.Handler,
    input: SetupUserForProject.Input,
    output: SetupUserForProject.Output,
  },
  SetupInitialProjectContent: {
    name: SetupInitialProjectContent.Name,
    handler: SetupInitialProjectContent.Handler,
    input: SetupInitialProjectContent.Input,
    output: SetupInitialProjectContent.Output,
  },
  SendProjectWelcomeResourcesEmail: {
    name: SendProjectWelcomeResourcesEmail.Name,
    handler: SendProjectWelcomeResourcesEmail.Handler,
    input: SendProjectWelcomeResourcesEmail.Input,
    output: SendProjectWelcomeResourcesEmail.Output,
  },
  SendProjectReminderEmail: {
    name: SendProjectReminderEmail.Name,
    handler: SendProjectReminderEmail.Handler,
    input: SendProjectReminderEmail.Input,
    output: SendProjectReminderEmail.Output,},
  HandleAbandonedProject: {
    name: HandleAbandonedProject.Name,
    handler: HandleAbandonedProject.Handler,
    input: HandleAbandonedProject.Input,
    output: HandleAbandonedProject.Output,
  },
};

// Register all activity functions
Object.values(Activities).forEach(activity => {
  df.app.activity(activity.name, { handler: activity.handler });
});

// Input/Output type definitions
export type SaveOnboardingStatusInput = typeof SaveOnboardingStatus.Input;
export type SaveOnboardingStatusOutput = typeof SaveOnboardingStatus.Output;

export type ProcessPendingInvitesInput = typeof ProcessPendingInvites.Input;
export type ProcessPendingInvitesOutput = typeof ProcessPendingInvites.Output;

export type SendWelcomeEmailInput = typeof SendWelcomeEmail.Input;
export type SendWelcomeEmailOutput = typeof SendWelcomeEmail.Output;

export type SendWorkspaceReminderEmailInput = typeof SendWorkspaceReminderEmail.Input;
export type SendWorkspaceReminderEmailOutput = typeof SendWorkspaceReminderEmail.Output;

export type SendOnboardingAbandonedEmailInput = typeof SendOnboardingAbandonedEmail.Input;
export type SendOnboardingAbandonedEmailOutput = typeof SendOnboardingAbandonedEmail.Output;

export type SetupInitialWorkspaceContentInput = typeof SetupInitialWorkspaceContent.Input;
export type SetupInitialWorkspaceContentOutput = typeof SetupInitialWorkspaceContent.Output;

export type SendWelcomeResourcesInput = typeof SendWelcomeResourcesEmail.Input;
export type SendWelcomeResourcesOutput = typeof SendWelcomeResourcesEmail.Output;


export type SetupUserWorkspaceInput = typeof SetupUserForWorkspace.Input;
export type SetupUserWorkspaceOutput = typeof SetupUserForWorkspace.Output;

export type SetupUserProjectInput = typeof SetupUserForProject.Input;
export type SetupUserProjectOutput = typeof SetupUserForProject.Output;

export type SetupInitialProjectContentInput = typeof SetupInitialProjectContent.Input;
export type SetupInitialProjectContentOutput = typeof SetupInitialProjectContent.Output;

export type SendProjectWelcomeResourcesInput = typeof SendProjectWelcomeResourcesEmail.Input;
export type SendProjectWelcomeResourcesOutput = typeof SendProjectWelcomeResourcesEmail.Output;

export type SendProjectReminderEmailInput = typeof SendProjectReminderEmail.Input;
export type SendProjectReminderEmailOutput = typeof SendProjectReminderEmail.Output;

export type HandleAbandonedProjectInput = typeof HandleAbandonedProject.Input;
export type HandleAbandonedProjectOutput = typeof HandleAbandonedProject.Output;

// Additional type exports would be added here
// export type SetupUserWorkspaceInput = typeof SetupUserWorkspace.Input;
// export type SetupUserWorkspaceOutput = typeof SetupUserWorkspace.Output;
// ... and so on

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  OnboardingEventNotification: {
    name: OnboardingEventNotification.Name,
    route: OnboardingEventNotification.Route,
    methods: OnboardingEventNotification.Methods,
    handler: OnboardingEventNotification.Handler,
  },
  OnboardingStatus: {
    name: OnboardingStatus.Name,
    route: OnboardingStatus.Route,
    methods: OnboardingStatus.Methods,
    handler: OnboardingStatus.Handler,
  },
  StartOnboarding: {
    name: StartOnboarding.Name,
    route: StartOnboarding.Route,
    methods: StartOnboarding.Methods,
    handler: StartOnboarding.Handler,
  },
};

// Register all HTTP triggers
Object.values(Endpoints).forEach(endpoint => {
  app.http(endpoint.name, {
    route: endpoint.route,
    methods: endpoint.methods,
    authLevel: 'anonymous', // Relies on auth middleware/token validation
    handler: endpoint.handler
  });
});

// Default export
export default {
  Orchestrators,
  Activities,
};