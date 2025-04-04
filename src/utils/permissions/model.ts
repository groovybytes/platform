// @filename: utils/permissions/model.ts
import type { RoleDefinition } from '~/types/operational';

/**
 * Permission string format:
 * [resource_type]:[resource_id]:[scope]:[action]:[effect]
 * 
 * Examples:
 * - project:abc123:devices:read:allow
 * - workspace:*:settings:update:allow
 * - system:*:users:create:allow
 */

/**
 * Resource types in the system
 */
export enum ResourceType {
  SYSTEM = 'system',
  WORKSPACE = 'workspace',
  PROJECT = 'project'
}

/**
 * Resource scopes for permissions
 */
export enum PermissionScope {
  // Common scopes
  ALL = '*',
  SETTINGS = 'settings',
  MEMBERS = 'members',
  
  // Workspace-specific scopes
  TEAMS = 'teams',
  PROJECTS = 'projects',
  BILLING = 'billing',
  
  // Project-specific scopes
  DEVICES = 'devices',
  ASSETS = 'assets',
  ANALYTICS = 'analytics',
  JOBS = 'jobs',
  
  // System-specific scopes
  USERS = 'users',
  ROLES = 'roles',
  SYSTEM_SETTINGS = 'system-settings'
}

/**
 * Actions that can be performed on resources
 */
export enum PermissionAction {
  ALL = '*',
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  INVITE = 'invite',
  ADMIN = 'admin',
  EXECUTE = 'execute'
}

/**
 * Effects for permissions
 */
export enum PermissionEffect {
  ALLOW = 'allow',
  DENY = 'deny'
}

/**
 * Default system roles
 */
export const SYSTEM_ROLES: Record<string, RoleDefinition> = {
  SYSTEM_ADMIN: {
    id: 'system-admin',
    type: 'role',
    name: 'System Administrator',
    description: 'Full access to all platform resources and settings',
    permissions: [
      'system:*:*:*:allow'
    ],
    resourceType: 'system',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  BILLING_ADMIN: {
    id: 'billing-admin',
    type: 'role',
    name: 'Billing Administrator',
    description: 'Manages billing for all workspaces',
    permissions: [
      'system:*:billing:*:allow',
      'workspace:*:billing:read:allow'
    ],
    resourceType: 'system',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
};

/**
 * Default workspace roles
 */
export const WORKSPACE_ROLES: Record<string, RoleDefinition> = {
  WORKSPACE_OWNER: {
    id: 'workspace-owner',
    type: 'role',
    name: 'Workspace Owner',
    description: 'Full control over workspace and its projects',
    permissions: [
      'workspace:*:*:*:allow',
      'project:*:*:*:allow'
    ],
    resourceType: 'workspace',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  WORKSPACE_ADMIN: {
    id: 'workspace-admin',
    type: 'role',
    name: 'Workspace Administrator',
    description: 'Manages workspace settings, members, and projects',
    permissions: [
      'workspace:*:settings:*:allow',
      'workspace:*:members:*:allow',
      'workspace:*:projects:*:allow',
      'workspace:*:teams:*:allow',
      'workspace:*:*:read:allow',
      'project:*:*:read:allow',
      'project:*:members:invite:allow'
    ],
    resourceType: 'workspace',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  WORKSPACE_BILLING_MANAGER: {
    id: 'workspace-billing-manager',
    type: 'role',
    name: 'Workspace Billing Manager',
    description: 'Manages workspace billing and payment settings',
    permissions: [
      'workspace:*:billing:*:allow',
      'workspace:*:*:read:allow'
    ],
    resourceType: 'workspace',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  WORKSPACE_MEMBER: {
    id: 'workspace-member',
    type: 'role',
    name: 'Workspace Member',
    description: 'Standard workspace membership with access to shared projects',
    permissions: [
      'workspace:*:*:read:allow'
    ],
    resourceType: 'workspace',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  WORKSPACE_GUEST: {
    id: 'workspace-guest',
    type: 'role',
    name: 'Workspace Guest',
    description: 'Limited access to specific workspace resources',
    permissions: [
      'workspace:*:*:read:allow'
    ],
    resourceType: 'workspace',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
};

/**
 * Default project roles
 */
export const PROJECT_ROLES: Record<string, RoleDefinition> = {
  PROJECT_OWNER: {
    id: 'project-owner',
    type: 'role',
    name: 'Project Owner',
    description: 'Full control over the project and its resources',
    permissions: [
      'project:*:*:*:allow'
    ],
    resourceType: 'project',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  PROJECT_MANAGER: {
    id: 'project-manager',
    type: 'role',
    name: 'Project Manager',
    description: 'Manages project resources and team but cannot delete project',
    permissions: [
      'project:*:settings:update:allow',
      'project:*:devices:*:allow',
      'project:*:assets:*:allow',
      'project:*:analytics:*:allow',
      'project:*:members:invite:allow',
      'project:*:jobs:*:allow',
      'project:*:*:read:allow'
    ],
    resourceType: 'project',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  DATA_ANALYST: {
    id: 'data-analyst',
    type: 'role',
    name: 'Data Analyst',
    description: 'Can view all data and create analyses',
    permissions: [
      'project:*:analytics:*:allow',
      'project:*:devices:read:allow',
      'project:*:assets:read:allow',
      'project:*:jobs:create:allow',
      'project:*:jobs:read:allow',
      'project:*:jobs:update:allow',
      'project:*:*:read:allow'
    ],
    resourceType: 'project',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  DEVICE_MANAGER: {
    id: 'device-manager',
    type: 'role',
    name: 'Device Manager',
    description: 'Manages devices and their data',
    permissions: [
      'project:*:devices:*:allow',
      'project:*:analytics:read:allow',
      'project:*:jobs:read:allow'
    ],
    resourceType: 'project',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  },
  
  REPORT_VIEWER: {
    id: 'report-viewer',
    type: 'role',
    name: 'Report Viewer',
    description: 'View-only access to processed insights',
    permissions: [
      'project:*:analytics:read:allow'
    ],
    resourceType: 'project',
    resourceId: '*',
    status: 'active',
    is_system_role: true,
    created_by: 'system',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  }
};

/**
 * Get all role definitions for a specific resource type
 */
export function getRoleDefinitionsForResourceType(resourceType: ResourceType): RoleDefinition[] {
  switch (resourceType) {
    case ResourceType.SYSTEM:
      return Object.values(SYSTEM_ROLES);
    case ResourceType.WORKSPACE:
      return Object.values(WORKSPACE_ROLES);
    case ResourceType.PROJECT:
      return Object.values(PROJECT_ROLES);
    default:
      return [];
  }
}

/**
 * Gets the default role for a new user in a resource
 */
export function getDefaultRoleForResource(resourceType: ResourceType, isCreator: boolean = false): RoleDefinition | null {
  switch (resourceType) {
    case ResourceType.WORKSPACE:
      return isCreator ? WORKSPACE_ROLES.WORKSPACE_OWNER : WORKSPACE_ROLES.WORKSPACE_MEMBER;
    case ResourceType.PROJECT:
      return isCreator ? PROJECT_ROLES.PROJECT_OWNER : PROJECT_ROLES.REPORT_VIEWER;
    default:
      return null;
  }
}

/**
 * Checks if a role is assignable to guests
 */
export function isRoleGuestAssignable(roleDef: RoleDefinition): boolean {
  // By default, only specific roles can be assigned to guests
  switch (roleDef.id) {
    case 'workspace-guest':
    case 'report-viewer':
      return true;
    default:
      return false;
  }
}