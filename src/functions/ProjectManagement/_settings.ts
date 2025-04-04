// @filename: utils/project-management/defaults.ts
import type { Project, RoleDefinition, AssignedRole } from '~/types/operational';
import { PROJECT_ROLES } from '~/utils/permissions/model';
import { nanoid } from 'nanoid';
import { createItem, readItem } from '~/utils/cosmos/utils';
import { createProjectDatabase } from '~/utils/cosmos/utils';

/**
 * Get default project settings
 * @returns Default settings for a new project
 */
export function getDefaultProjectSettings() {
  return {
    defaultLocale: 'en-US',
    supportedLocales: ['en-US'],
    security: {
      ipAllowlist: [],
      allowedOrigins: []
    },
    features: {
      experimentationEnabled: false,
      advancedAnalytics: false,
      aiAssistant: false
    }
  };
}

/**
 * Create project default roles
 * @param projectId ID of the project
 * @param workspaceId ID of the workspace containing the project
 * @param createdBy User ID who created the project
 * @returns Promise resolving to created role definitions
 */
export async function createProjectDefaultRoles(
  projectId: string,
  workspaceId: string,
  createdBy: string
): Promise<RoleDefinition[]> {
  const timestamp = new Date().toISOString();
  const createdRoles: RoleDefinition[] = [];
  
  // Create role definitions for this specific project
  for (const [key, roleTemplate] of Object.entries(PROJECT_ROLES)) {
    const roleId = `${projectId}-${roleTemplate.id}`;
    
    // Create a new role based on the template
    const roleDef: RoleDefinition = {
      ...roleTemplate,
      id: roleId,
      resourceId: projectId, // Set to this specific project
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
 * Assign user to project with appropriate role
 * @param userId User ID to assign
 * @param projectId Project ID
 * @param roleId Role ID to assign
 * @param assignedBy User ID who performed the assignment
 * @param isGuest Whether this is a guest assignment
 * @returns Promise resolving to the assigned role
 */
export async function assignUserToProjectRole(
  userId: string,
  projectId: string,
  roleId: string,
  assignedBy: string,
  isGuest: boolean = false
): Promise<AssignedRole> {
  const timestamp = new Date().toISOString();
  
  // Create the role assignment
  const assignedRole: AssignedRole = {
    id: `${userId}-project-${projectId}`,
    type: "assigned-roles",
    userId,
    roles: [roleId],
    resourceId: projectId,
    resourceType: "project",
    assignment_type: isGuest ? "guest" : undefined,
    assigned_by: assignedBy,
    assigned_at: timestamp
  };
  
  // Store in database
  return await createItem<AssignedRole>('membership', assignedRole);
}

/**
 * Create a new project with default settings and assign owner role
 * @param name Project name
 * @param slug Project slug
 * @param workspaceId Workspace ID
 * @param creatorId User ID who created the project
 * @param description Optional project description
 * @returns Promise resolving to the created project and owner role
 */
export async function createProjectWithDefaults(
  name: string,
  slug: string,
  workspaceId: string,
  creatorId: string,
  description?: string
): Promise<{ project: Project, ownerRole: AssignedRole }> {
  const timestamp = new Date().toISOString();
  const projectId = nanoid();
  
  // Create the project
  const project: Project = {
    id: projectId,
    workspaceId,
    name,
    slug,
    description,
    status: 'active',
    settings: getDefaultProjectSettings(),
    createdAt: timestamp,
    createdBy: creatorId,
    modifiedAt: timestamp,
    modifiedBy: creatorId
  };
  
  // Create project database in analytics account
  await createProjectDatabase(projectId);
  
  // Store the project in operational database
  const createdProject = await createItem<Project>('projects', project);
  
  // Create the default roles for this project
  const roles = await createProjectDefaultRoles(projectId, workspaceId, creatorId);
  
  // Find the owner role
  const ownerRole = roles.find(role => role.id.endsWith(PROJECT_ROLES.PROJECT_OWNER.id));
  
  if (!ownerRole) {
    throw new Error('Failed to create owner role for project');
  }
  
  // Assign the creator as the project owner
  const assignedRole = await assignUserToProjectRole(
    creatorId,
    projectId,
    ownerRole.id,
    creatorId,
    false
  );
  
  return {
    project: createdProject,
    ownerRole: assignedRole
  };
}

/**
 * Find workspace owner and assign them to project
 * @param projectId Project ID
 * @param workspaceId Workspace ID containing the project
 * @param roleId Role ID to assign
 * @returns Promise resolving when completed
 */
export async function assignWorkspaceOwnerToProject(
  projectId: string,
  workspaceId: string,
  ownerRoleId: string
): Promise<void> {
  // Query to find workspace owner
  const workspaceOwnerRoles = await readItem<AssignedRole[]>('membership', [{
    type: "assigned-roles",
    resourceType: "workspace",
    resourceId: workspaceId,
    roles: [`${workspaceId}-workspace-owner`]
  }]);
  
  // If workspace owner exists, assign them to project
  if (workspaceOwnerRoles && workspaceOwnerRoles.length > 0) {
    const workspaceOwner = workspaceOwnerRoles[0];
    
    // Assign workspace owner to project with owner role
    await assignUserToProjectRole(
      workspaceOwner.userId,
      projectId,
      ownerRoleId,
      workspaceOwner.userId
    );
  }
}