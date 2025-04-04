// @filename: workspace-management/_settings.ts
import type { Workspace, RoleDefinition, AssignedRole } from '~/types/operational';
import { WORKSPACE_ROLES } from '~/utils/permissions/model';
import { createItem } from '~/utils/cosmos/utils';
import { nanoid } from 'nanoid';

/**
 * Get default workspace settings
 * @returns Default settings for a new workspace
 */
export function getDefaultWorkspaceSettings() {
  return {
    contentTypes: ['page', 'article', 'product'],
    defaultLocale: 'en-US',
    supportedLocales: ['en-US'],
    security: {
      mfa: false,
      ssoEnabled: false,
      ipAllowlist: []
    },
    features: {
      experimentationEnabled: false,
      advancedAnalytics: false,
      aiAssistant: false
    }
  };
}

/**
 * Create workspace default roles
 * @param workspaceId ID of the workspace
 * @param createdBy User ID who created the workspace
 * @returns Promise resolving to created role definitions
 */
export async function createWorkspaceDefaultRoles(
  workspaceId: string,
  createdBy: string
): Promise<RoleDefinition[]> {
  const timestamp = new Date().toISOString();
  const createdRoles: RoleDefinition[] = [];
  
  // Create role definitions for this specific workspace
  for (const [key, roleTemplate] of Object.entries(WORKSPACE_ROLES)) {
    const roleId = `${workspaceId}-${roleTemplate.id}`;
    
    // Create a new role based on the template
    const roleDef: RoleDefinition = {
      ...roleTemplate,
      id: roleId,
      resourceId: workspaceId, // Set to this specific workspace
      created_by: createdBy,
      created_at: timestamp,
      updated_at: timestamp
    };
    
    // Store in database
    const createdRole = await createItem<RoleDefinition>('membership', roleDef);
    createdRoles.push(createdRole);
  }
  
  return createdRoles;
}

/**
 * Assign user to workspace with appropriate role
 * @param userId User ID to assign
 * @param workspaceId Workspace ID
 * @param roleId Role ID to assign
 * @param assignedBy User ID who performed the assignment
 * @param isGuest Whether this is a guest assignment
 * @returns Promise resolving to the assigned role
 */
export async function assignUserToWorkspaceRole(
  userId: string,
  workspaceId: string,
  roleId: string,
  assignedBy: string,
  isGuest: boolean = false
): Promise<AssignedRole> {
  const timestamp = new Date().toISOString();
  
  // Create the role assignment
  const assignedRole: AssignedRole = {
    id: `${userId}-workspace-${workspaceId}`,
    type: "assigned-roles",
    userId,
    roles: [roleId],
    resourceId: workspaceId,
    resourceType: "workspace",
    assignment_type: isGuest ? "guest" : undefined,
    assigned_by: assignedBy,
    assigned_at: timestamp
  };
  
  // Store in database
  return await createItem<AssignedRole>('membership', assignedRole);
}

/**
 * Create a new workspace with default settings and assign owner role
 * @param name Workspace name
 * @param creatorId User ID who created the workspace
 * @returns Promise resolving to the created workspace and owner role
 */
export async function createWorkspaceWithDefaults(
  name: string,
  slug: string,
  creatorId: string,
  type: "standard" | "agency" = "standard"
): Promise<{ workspace: Workspace, ownerRole: AssignedRole }> {
  const timestamp = new Date().toISOString();
  const workspaceId = nanoid();
  
  // Create the workspace
  const workspace: Workspace = {
    id: workspaceId,
    name,
    slug,
    type,
    status: 'active',
    settings: getDefaultWorkspaceSettings(),
    subscriptionId: null,
    projects: [],
    createdAt: timestamp,
    createdBy: creatorId,
    modifiedAt: timestamp,
    modifiedBy: creatorId
  };
  
  // Store the workspace
  const createdWorkspace = await createItem<Workspace>('workspaces', workspace);
  
  // Create the default roles for this workspace
  const roles = await createWorkspaceDefaultRoles(workspaceId, creatorId);
  
  // Find the owner role
  const ownerRole = roles.find(role => role.id.endsWith(WORKSPACE_ROLES.WORKSPACE_OWNER.id));
  
  if (!ownerRole) {
    throw new Error('Failed to create owner role for workspace');
  }
  
  // Assign the creator as the workspace owner
  const assignedRole = await assignUserToWorkspaceRole(
    creatorId,
    workspaceId,
    ownerRole.id,
    creatorId,
    false
  );
  
  return {
    workspace: createdWorkspace,
    ownerRole: assignedRole
  };
}