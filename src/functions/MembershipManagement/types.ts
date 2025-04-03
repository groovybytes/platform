// @filename: membership-management/types.ts
import type { Membership, User } from '~/types/operational';

/**
 * Input for updating a membership
 */
export interface UpdateMembershipInput {
  status?: "active" | "inactive" | "pending" | "revoked" | "suspended" | "expired";
  membershipType?: "member" | "guest";
  expiresAt?: string;
}

/**
 * Input for sending an invitation reminder
 */
export interface SendReminderInput {
  membershipId: string;
}

/**
 * Response for sending a reminder
 */
export interface SendReminderOutput {
  membership: Membership;
  reminderCount: number;
  emailSent: boolean;
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
}

/**
 * Events for the onboarding orchestrator
 */
export interface WorkspaceCreatedEvent {
  userId: string;
  workspaceId: string;
}

export interface ProjectCreatedEvent {
  userId: string;
  projectId: string;
  workspaceId: string;
}

export interface InvitationAcceptedEvent {
  userId: string;
  membershipId: string;
  resourceType: "workspace" | "project";
  resourceId: string;
}

/**
 * Onboarding status tracking
 */
export interface OnboardingStatus {
  userId: string;
  type: "invite" | "new_workspace" | "new_project";
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  resourceId?: string;
  resourceType?: "workspace" | "project";
  steps: {
    name: string;
    status: "pending" | "completed" | "failed";
    timestamp?: string;
    details?: any;
  }[];
}