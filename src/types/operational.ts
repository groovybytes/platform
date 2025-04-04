/**
 * Core user representation in the operational database
 */
export interface User {
  id: string;
  entraId?: string;
  name: string;
  status: "active" | "inactive" | "suspended" | "pending" | "deleted";
  preferences: {
    language: string;
    timezone: string;
  };
  emails: {
    primary: string;
    all: string[];
  };
  // No longer tracking guest status at user level
  createdAt: string;
  modifiedAt: string;
}

/**
 * Represents a team
 */
export interface Team {
  id: string;
  workspaceId: string; // For partitioning and efficient retrieval
  name: string;
  description?: string;
  members: string[];  // User IDs
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

/**
 * Represents a workspace - the top-level organizational unit
 */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  type: "standard" | "agency";  // Agency is a workspace type
  status: "active" | "inactive";
  settings: WorkspaceSettings;
  subscriptionId: string | null;  // Reference to billing subscription

  // Agency-specific fields
  agency?: {
    managedWorkspaces: Array<{
      workspaceId: string;
      addedAt: string;
      status: "active" | "suspended";
    }>;
  };

  // Workspace permissions are now handled via the roles and permissions containers
  // Teams are now managed separately
  projects: string[]; // List of project IDs
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

/**
 * Workspace settings, including content types, security, and features.
 */
export interface WorkspaceSettings {
  contentTypes: string[];
  defaultLocale: string;
  supportedLocales: string[];
  security: {
    mfa: boolean;
    ssoEnabled: boolean;
    ipAllowlist: string[];
  };
  features: {
    experimentationEnabled: boolean;
    advancedAnalytics: boolean;
    aiAssistant: boolean;
  };
}

/**
 * Represents a user's membership in a workspace or project
 */
export interface Membership {
  id: string;
  userId: string;
  resourceType: "workspace" | "project";
  resourceId: string;
  membershipType: "member" | "guest";
  status: "active" | "inactive" | "pending" | "revoked" | "suspended" | "expired";
  expiresAt?: string; // Optional expiration, typically for guests
  joinedAt?: string;
  lastActiveAt?: string;
  invitedAt: string;
  invitedBy: string;
  inviteToken?: string;        // Unique token for invitation links
  inviteEmail?: string;        // Email address invitation was sent to
  inviteReminders?: number;    // Count of reminder emails sent
  lastReminderAt?: string;     // When the last reminder was sent
  inviteExpiresAt?: string;    // When the invitation expires (if applicable)
}

/**
 * Workspace-level roles
 */
export interface RoleDefinition {
  id: string;
  type: "role",
  name: string;
  description: string;
  permissions: string[]; // "[resource_type]:[resource_id]:[scope]:[action]:[effect]"
  resourceType: "workspace" | "project" | "system";
  resourceId: string; // ID of specific resource or "*" for template roles
  status: "active" | "inactive" | "disabled" | "archived";
  is_system_role: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

/**
 * Assigned-Roles with additional context for guest access
 */
export interface AssignedRole {
  id: string;
  type: "assigned-roles",
  userId: string;
  roles: string[]; // List of role IDs
  resourceId: string; // The specific resource this role applies to
  resourceType: "workspace" | "project"; // The type of resource
  assignment_type?: "guest"; // Whether this role assignment is a guest relationship
  assigned_by: string;
  assigned_at: string;
  expires_at?: string; // Guest access often has an expiration
}

/**
 * Permission exceptions
 */
export interface RoleException {
  id: string;
  type: "role-exceptions",
  resourceId: string; // The userId this exception applies to
  resourceType: "user"; // The type of resource almost always a user though potentially a team
  permissions: string[]; // "[resource_type]:[resource_id]:[scope]:[action]:[effect]"
  reason: string; // Documentation for audit purposes
  created_by: string;
  created_at: string;
  expires_at?: string;
}

/**
 * Represents the status and progress of a user's onboarding process
 */
export interface OnboardingStatus {
  id: string;
  userId: string;
  type: "invite" | "new_workspace" | "new_project";
  status: "in_progress" | "completed" | "abandoned";
  startedAt: string;
  completedAt?: string;
  resourceId?: string;
  resourceType?: "workspace" | "project";
  orchestrationId?: string;  // ID of the durable orchestration tracking this onboarding
  
  // Steps completed in the onboarding process, useful for analytics and troubleshooting
  steps: {
    name: string;
    status: "pending" | "completed" | "failed";
    timestamp?: string;
    details?: any;
  }[];
  
  // Additional metadata
  createdAt: string;
  modifiedAt: string;
}

/**
 * Permission audit logs
 */
export interface PermissionLog {
  id: string;
  userId: string;
  action: "check" | "grant" | "revoke" | "emergency_access";
  permission: string;
  resource_type: string;
  resource_id: string;
  result: "allowed" | "denied";
  timestamp: string;
  details?: Record<string, unknown>; // Additional context
}

/**
 * Represents an API key used for authenticating and authorizing API requests to a project.
 * Each key is scoped to a single project and inherits the project's permissions model.
 */
export interface ApiKey {
  /** Unique identifier for the API key */
  id: string;

  /** Human-readable name for identifying the key's purpose */
  name: string;

  /** The hashed API key value */
  key: string;

  /** 
   * Current status of the API key.
   * - active: Key is valid and can be used for authentication
   * - revoked: Key has been invalidated and can no longer be used
   */
  status: "active" | "revoked";

  /**
   * List of permissions granted to this API key.
   * Permissions follow the format: "[resource_type]:[resource_id]:[scope]:[action]:[effect]"
   */
  permissions: string[];

  /**
   * List of allowed origins that can use this key.
   * Overrides project-level allowedOrigins if specified.
   */
  allowedOrigins?: string[];

  /**
   * List of allowed IP addresses that can use this key.
   * If undefined, falls back to project-level ipAllowlist.
   */
  ipAllowlist?: string[];

  /**
   * Timestamp when this API key should expire.
   * If undefined, the key never expires.
   */
  expiresAt?: string;

  /** Timestamp of the last request made using this key */
  lastUsedAt?: string;

  /** Timestamp when the API key was created */
  createdAt: string;

  /** ID of the user who created the API key */
  createdBy: string;

  /** Timestamp when the API key was last modified */
  modifiedAt: string;

  /** ID of the user who last modified the API key */
  modifiedBy: string;
}

/**
 * Represents a project within a workspace
 */
export interface Project {
  id: string;
  workspaceId: string; // For partitioning and efficient retrieval
  name: string;
  slug: string;
  description?: string;
  status: "active" | "archived" | "inactive";
  settings: ProjectSettings;
  // Project permissions are now handled via the roles and permissions containers
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

/**
 * Project settings
 */
export interface ProjectSettings {
  defaultLocale: string;
  supportedLocales: string[];
  security: {
    ipAllowlist: string[];
    allowedOrigins: string[];
  };
  features: {
    experimentationEnabled: boolean;
    advancedAnalytics: boolean;
    aiAssistant: boolean;
  };
}

/**
 * Device representation in the operational database
 */
export interface Device {
  id: string; // Unique identifier within IoT Hub
  projectId: string;  // Primary scope - removing workspaceId for easier transfers 
  deviceName: string;
  sensorType: string;
  location: string;
  purpose: string;
  connectionString: string;
  status: "registered" | "connected" | "disconnected" | "error";
  processingState: "active" | "processing" | "analyzing" | "maintenance";
  lastDataReceived?: string; // ISO timestamp of most recent data
  metadata?: Record<string, any>;
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

/**
 * Asset representation for uploaded files in the operational database
 */
export interface Asset {
  id: string;
  projectId: string;  // Primary scope - no workspaceId
  name: string;
  type: string;  // File MIME type
  size: number;  // Size in bytes
  url: string;   // Storage URL (e.g., Azure Blob URL)
  status: "active" | "archived" | "deleted";
  processingState: "uploading" | "validating" | "enriching" | "analyzing" | "processed" | "error";
  processingProgress?: number;  // 0-100 percentage
  processingDetails?: {
    error?: string;
    stage?: string;
    startedAt?: string;
    completedAt?: string;
  };
  metadata?: Record<string, any>;
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
}

/**
 * Notification representation in the operational database
 */
export interface Notification {
  id: string;
  projectId: string;  // Scope to project
  type: "alert" | "info" | "warning" | "success" | "error";
  title: string;
  message: string;
  source: "system" | "device" | "analysis" | "user";
  sourceId?: string;  // ID of the source entity (device, user, etc.)
  severity: "low" | "medium" | "high" | "critical";
  status: "unread" | "read" | "acknowledged" | "resolved" | "dismissed";
  link?: {
    type: "device" | "asset" | "analysis" | "dashboard";
    id: string;
    title: string;
  };
  notificationSent: boolean;
  notificationChannels?: string[]; // Email, SMS, dashboard, etc.
  expiresAt?: string;
  createdAt: string;
  readBy?: string;
  readAt?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  resolvedBy?: string;
  resolvedAt?: string;
}

/**
 * Represents an analysis job that runs on enriched data
 */
export interface AnalysisJob {
  id: string;
  projectId: string;  // Scoped to project without workspaceId
  type: "scheduled" | "ad-hoc" | "system";
  analysisType: "clustering" | "pattern_detection" | "anomaly_detection" | 
                "relationship_analysis" | "forecasting" | "segmentation";
  status: "queued" | "running" | "completed" | "failed" | "cancelled";
  progress?: number;  // 0-100 percentage
  configuration: {
    dataSelectors: Array<{
      entityType?: string;
      filters?: Record<string, any>;
      timeRange?: {
        start: string;
        end?: string;
      };
    }>;
    parameters: Record<string, any>;  // Analysis-specific parameters
  };
  schedule?: {
    frequency: "once" | "hourly" | "daily" | "weekly" | "monthly";
    nextRun?: string;
    lastRun?: string;
  };
  results?: {
    outputIds: string[];  // IDs of ProcessedData created by this job
    summary?: string;
    metrics?: Record<string, number>;
  };
  createdAt: string;
  createdBy: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}