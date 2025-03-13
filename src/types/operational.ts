
/**
 * Core user representation in the operational database
 */
export interface User {
  id: string;
  entraId: string;
  name: string;
  status: "active" | "inactive" | "suspended";
  preferences: {
    language: string;
    timezone: string;
  };
  emails: {
    primary: string;
    all: string[];
  };
  // All user role assignments
  roles: {
    workspaces: Record<string, WorkspaceRole[]>;        // Workspace ID -> workspace roles
    projects: Record<string, ProjectRole[]>;            // Project ID -> project roles (in addition to team roles)
  };
  createdAt: string;
  modifiedAt: string;
}

/**
 * Workspace-level roles (focused on operational aspects)
 */
export type WorkspaceRole = "owner" | "admin" | "billing" | "member" | "guest";

/**
 * Project-level roles (focused on content/feature access)
 */
export type ProjectRole =
  | "admin"     // Full project access
  | "developer"         // Access to component registry/code
  | "designer"          // Access to visual tools
  | "analyst"          // Access to analytics/experiments
  | "viewer";          // Read-only access

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
    defaultRoles?: ProjectRole[];  // Default roles for agency team members
  };

  rootDomain?: string;       // Primary root domain for this workspace

  // Workspace-level permissions (billing, admin, etc)
  roles: Record<WorkspaceRole, RoleDefinition>;
  permissions: Record<string, Permission>;

  // Teams and their project access
  teams: Record<string, {
    name: string;
    description?: string;
    members: string[];  // User IDs
    projectAccess: Record<string, ProjectRole[]>; // Project ID -> roles for this team
  }>;

  projects: string[]; // List of project IDs
  createdAt: string;
  createdBy: string;
  modifiedAt: string;
  modifiedBy: string;
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
   * Permissions follow the format: "<resource>:<action>"
   * Example: ["content:read", "content:preview"]
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
 * Represents a permission in the system.
 */
export interface Permission {
  description: string;
  category: "data" | "analytics" | "api" | "billing";
}

/**
 * Represents a role in the workspace.
 */
export interface RoleDefinition {
  name: string;
  description: string;
  permissions: string[]; // e.g. ["data:read", "billing:read"]
}
