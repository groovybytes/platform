// @filename: onboarding/activities/index.ts
import type { ActivityDefinition } from '~/types/definitions';
import * as df from 'durable-functions';

// Import all activity definitions
import SaveOnboardingStatus from './save-onboarding-status';
import ProcessPendingInvites from './process-pending-invites';
import SendWelcomeEmail from './send-welcome-email';
import SendWorkspaceReminderEmail from './send-workspace-reminder-email';
import SendOnboardingAbandonedEmail from './send-onboarding-abandoned-email';
import SetupInitialWorkspaceContent from './setup-initial-workspace-content';
import SendWelcomeResourcesEmail from './send-welcome-resources-email';

// Additional activities would be imported here
// import SetupUserWorkspace from './setup-user-workspace';
// import SetupUserProject from './setup-user-project';
// import SetupInitialProjectContent from './setup-initial-project-content';
// import SendProjectWelcomeResources from './send-project-welcome-resources';
// import SendProjectReminderEmail from './send-project-reminder-email';
// import HandleAbandonedProject from './handle-abandoned-project';

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
  // SetupUserWorkspace,
  // SetupUserProject,
  // SetupInitialProjectContent,
  // SendProjectWelcomeResources,
  // SendProjectReminderEmail,
  // HandleAbandonedProject,
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

// Additional type exports would be added here
// export type SetupUserWorkspaceInput = typeof SetupUserWorkspace.Input;
// export type SetupUserWorkspaceOutput = typeof SetupUserWorkspace.Output;
// ... and so on

// Default export
export default Activities;