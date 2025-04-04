import type { ItemDefinition, PatchOperation } from '@azure/cosmos';
import type { Workspace, Membership, Team, Project, Asset, AnalysisJob, Device, Notification, User, RoleDefinition, AssignedRole, ApiKey, RoleException } from '~/types/operational';
import { createItem, readItem, queryItems, replaceItem, patchItem, createProjectDatabase, deleteItem, deleteProjectDatabase, createProjectItem, queryProjectItems, readProjectItem } from './utils';

// Container names in the operational database
export const OPERATIONAL_CONTAINERS = {
  USERS: 'users',
  WORKSPACES: 'workspaces',
  TEAMS: 'teams',
  PROJECTS: 'projects',
  MEMBERSHIP: 'membership',
  ONBOARDING: 'onboarding',
  DEVICES: 'devices',
  ASSETS: 'assets',
  NOTIFICATIONS: 'notifications',
  JOBS: 'jobs',
  QUERIES: 'queries',
};

// Container names in project-specific databases
export const ANALYTICS_CONTAINERS = {
  RAW: 'raw',
  ENRICHED: 'enriched',
  PROCESSED: 'processed'
};

// =============================================
// Operational Database - User Operations
// =============================================

export async function createUser(user: User): Promise<User> {
  return createItem<User>(OPERATIONAL_CONTAINERS.USERS, user);
}

export async function getUserById(id: string): Promise<User> {
  return readItem<User>(OPERATIONAL_CONTAINERS.USERS, id, id);
}

export async function getUserByEmail(email: string): Promise<User | undefined> {
  const users = await queryItems<User>(
    OPERATIONAL_CONTAINERS.USERS,
    'SELECT * FROM c WHERE c.emails.primary = @email',
    [{ name: '@email', value: email }]
  );
  return users.length > 0 ? users[0] : undefined;
}

export async function updateUser(id: string, user: User): Promise<User> {
  return replaceItem<User>(OPERATIONAL_CONTAINERS.USERS, id, user, id);
}

export async function updateUserStatus(id: string, status: User['status']): Promise<User> {
  return patchItem<User>(
    OPERATIONAL_CONTAINERS.USERS,
    id,
    [{ op: 'replace', path: '/status', value: status }],
    id
  );
}

// =============================================
// Operational Database - Workspace Operations
// =============================================

export async function createWorkspace(workspace: Workspace): Promise<Workspace> {
  return createItem<Workspace>(OPERATIONAL_CONTAINERS.WORKSPACES, workspace);
}

export async function getWorkspaceById(id: string): Promise<Workspace> {
  return readItem<Workspace>(OPERATIONAL_CONTAINERS.WORKSPACES, id, id);
}

export async function updateWorkspace(id: string, workspace: Workspace): Promise<Workspace> {
  return replaceItem<Workspace>(OPERATIONAL_CONTAINERS.WORKSPACES, id, workspace, id);
}

export async function getWorkspacesByUser(userId: string): Promise<Workspace[]> {
  // First, get all workspace memberships for the user
  const memberships = await queryItems<Membership>(
    OPERATIONAL_CONTAINERS.MEMBERSHIP,
    'SELECT * FROM c WHERE c.userId = @userId AND c.resourceType = @resourceType AND c.status = @status',
    [
      { name: '@userId', value: userId },
      { name: '@resourceType', value: 'workspace' },
      { name: '@status', value: 'active' }
    ]
  );

  // If no memberships, return empty array
  if (memberships.length === 0) {
    return [];
  }

  // Get workspaceIds from memberships
  const workspaceIds = memberships.map(m => m.resourceId);

  // Query all workspaces the user is a member of
  return queryItems<Workspace>(
    OPERATIONAL_CONTAINERS.WORKSPACES,
    'SELECT * FROM c WHERE ARRAY_CONTAINS(@workspaceIds, c.id)',
    [{ name: '@workspaceIds', value: workspaceIds }]
  );
}

// =============================================
// Operational Database - Team Operations
// =============================================

export async function createTeam(team: Team): Promise<Team> {
  return createItem<Team>(OPERATIONAL_CONTAINERS.TEAMS, team);
}

export async function getTeamById(id: string, workspaceId: string): Promise<Team> {
  return readItem<Team>(OPERATIONAL_CONTAINERS.TEAMS, id, workspaceId);
}

export async function getTeamsByWorkspace(workspaceId: string): Promise<Team[]> {
  return queryItems<Team>(
    OPERATIONAL_CONTAINERS.TEAMS,
    'SELECT * FROM c WHERE c.workspaceId = @workspaceId',
    [{ name: '@workspaceId', value: workspaceId }]
  );
}

export async function updateTeam(id: string, team: Team): Promise<Team> {
  return replaceItem<Team>(OPERATIONAL_CONTAINERS.TEAMS, id, team, team.workspaceId);
}

export async function addTeamMember(teamId: string, workspaceId: string, userId: string): Promise<Team> {
  const team = await getTeamById(teamId, workspaceId);

  if (!team.members.includes(userId)) {
    return patchItem<Team>(
      OPERATIONAL_CONTAINERS.TEAMS,
      teamId,
      [{ op: 'add', path: '/members/-', value: userId }],
      workspaceId
    );
  }

  return team;
}

export async function removeTeamMember(teamId: string, workspaceId: string, userId: string): Promise<Team> {
  const team = await getTeamById(teamId, workspaceId);
  const memberIndex = team.members.indexOf(userId);

  if (memberIndex >= 0) {
    return patchItem<Team>(
      OPERATIONAL_CONTAINERS.TEAMS,
      teamId,
      [{ op: 'remove', path: `/members/${memberIndex}` }],
      workspaceId
    );
  }

  return team;
}

// =============================================
// Operational Database - Project Operations
// =============================================

export async function createProject(project: Project): Promise<Project> {
  // Create the project in the operational database
  const createdProject = await createItem<Project>(OPERATIONAL_CONTAINERS.PROJECTS, project);

  // Create the corresponding project database in the analytics account
  await createProjectDatabase(project.id);

  return createdProject;
}

export async function getProjectById(id: string, workspaceId: string): Promise<Project> {
  return readItem<Project>(OPERATIONAL_CONTAINERS.PROJECTS, id, workspaceId);
}

export async function getProjectsByWorkspace(workspaceId: string): Promise<Project[]> {
  return queryItems<Project>(
    OPERATIONAL_CONTAINERS.PROJECTS,
    'SELECT * FROM c WHERE c.workspaceId = @workspaceId',
    [{ name: '@workspaceId', value: workspaceId }]
  );
}

export async function updateProject(id: string, project: Project): Promise<Project> {
  return replaceItem<Project>(OPERATIONAL_CONTAINERS.PROJECTS, id, project, project.workspaceId);
}

export async function deleteProject(id: string, workspaceId: string): Promise<void> {
  // Delete from operational database
  await deleteItem(OPERATIONAL_CONTAINERS.PROJECTS, id, workspaceId);

  // Delete the project database from analytics account
  await deleteProjectDatabase(id);
}

export async function transferProjectToWorkspace(
  projectId: string,
  currentWorkspaceId: string,
  newWorkspaceId: string
): Promise<Project> {
  // Get the project
  const project = await getProjectById(projectId, currentWorkspaceId);

  // Can't transfer if project not found
  if (!project) {
    throw new Error(`Project with ID ${projectId} not found in workspace ${currentWorkspaceId}`);
  }

  // Create a new project object with the updated workspace ID
  const updatedProject: Project = {
    ...project,
    workspaceId: newWorkspaceId
  };

  // Create in the new workspace
  const newProject = await createItem<Project>(OPERATIONAL_CONTAINERS.PROJECTS, updatedProject);

  // Delete from the old workspace
  await deleteItem(OPERATIONAL_CONTAINERS.PROJECTS, projectId, currentWorkspaceId);

  // Return the transferred project
  return newProject;
}


// =============================================
// Operational Database - Role Management Operations
// =============================================

export async function createRoleDefinition(role: RoleDefinition): Promise<RoleDefinition> {
  return createItem<RoleDefinition>(OPERATIONAL_CONTAINERS.MEMBERSHIP, role);
}

export async function getRoleDefinitionById(id: string): Promise<RoleDefinition> {
  return readItem<RoleDefinition>(OPERATIONAL_CONTAINERS.MEMBERSHIP, id, id);
}

export async function getRoleDefinitionsByResourceType(resourceType: string): Promise<RoleDefinition[]> {
  return queryItems<RoleDefinition>(
    OPERATIONAL_CONTAINERS.MEMBERSHIP,
    'SELECT * FROM c WHERE c.type = "role" AND c.resourceType = @resourceType',
    [{ name: '@resourceType', value: resourceType }]
  );
}

export async function assignRolesToUser(userId: string, resourceType: "workspace" | "project", resourceId: string, roles: string[], assignedBy: string, isGuest: boolean = false): Promise<AssignedRole> {
  const assignedRole: AssignedRole = {
    id: `${userId}-${resourceType}-${resourceId}`,
    type: "assigned-roles",
    userId,
    roles,
    resourceId,
    resourceType,
    assignment_type: isGuest ? "guest" : undefined,
    assigned_by: assignedBy,
    assigned_at: new Date().toISOString()
  };

  return createItem<AssignedRole>(OPERATIONAL_CONTAINERS.MEMBERSHIP, assignedRole);
}

export async function getUserRolesForResource(userId: string, resourceType: string, resourceId: string): Promise<AssignedRole | null> {
  try {
    return await readItem<AssignedRole>(
      OPERATIONAL_CONTAINERS.MEMBERSHIP,
      `${userId}-${resourceType}-${resourceId}`,
      `${resourceType}-${resourceId}`
    );
  } catch (error) {
    // If not found, return null instead of throwing
    return null;
  }
}

export async function createRoleException(exception: RoleException): Promise<RoleException> {
  return createItem<RoleException>(OPERATIONAL_CONTAINERS.MEMBERSHIP, exception);
}

export async function createApiKey(apiKey: ApiKey): Promise<ApiKey> {
  return createItem<ApiKey>(OPERATIONAL_CONTAINERS.MEMBERSHIP, apiKey);
}

// =============================================
// Operational Database - Device Operations
// =============================================

export async function createDevice(device: Device): Promise<Device> {
  return createItem<Device>(OPERATIONAL_CONTAINERS.DEVICES, device);
}

export async function getDeviceById(id: string, projectId: string): Promise<Device> {
  return readItem<Device>(OPERATIONAL_CONTAINERS.DEVICES, id, projectId);
}

export async function getDevicesByProject(projectId: string): Promise<Device[]> {
  return queryItems<Device>(
    OPERATIONAL_CONTAINERS.DEVICES,
    'SELECT * FROM c WHERE c.projectId = @projectId',
    [{ name: '@projectId', value: projectId }]
  );
}

export async function updateDevice(id: string, device: Device): Promise<Device> {
  return replaceItem<Device>(OPERATIONAL_CONTAINERS.DEVICES, id, device, device.projectId);
}

export async function updateDeviceStatus(
  id: string,
  projectId: string,
  status: Device['status'],
  processingState?: Device['processingState']
): Promise<Device> {
  const operations: PatchOperation[] = [
    { op: 'replace', path: '/status', value: status }
  ];

  if (processingState) {
    operations.push({ op: 'replace', path: '/processingState', value: processingState });
  }

  return patchItem<Device>(OPERATIONAL_CONTAINERS.DEVICES, id, operations, projectId);
}

export async function deleteDevice(id: string, projectId: string): Promise<void> {
  return deleteItem(OPERATIONAL_CONTAINERS.DEVICES, id, projectId);
}

// =============================================
// Operational Database - Asset Operations
// =============================================

export async function createAsset(asset: Asset): Promise<Asset> {
  return createItem<Asset>(OPERATIONAL_CONTAINERS.ASSETS, asset);
}

export async function getAssetById(id: string, projectId: string): Promise<Asset> {
  return readItem<Asset>(OPERATIONAL_CONTAINERS.ASSETS, id, projectId);
}

export async function getAssetsByProject(projectId: string): Promise<Asset[]> {
  return queryItems<Asset>(
    OPERATIONAL_CONTAINERS.ASSETS,
    'SELECT * FROM c WHERE c.projectId = @projectId',
    [{ name: '@projectId', value: projectId }]
  );
}

export async function updateAsset(id: string, asset: Asset): Promise<Asset> {
  return replaceItem<Asset>(OPERATIONAL_CONTAINERS.ASSETS, id, asset, asset.projectId);
}

export async function updateAssetProcessingState(
  id: string,
  projectId: string,
  processingState: Asset['processingState'],
  processingProgress?: number
): Promise<Asset> {
  const operations: PatchOperation[] = [
    { op: 'replace', path: '/processingState', value: processingState }
  ];

  if (processingProgress !== undefined) {
    operations.push({ op: 'replace', path: '/processingProgress', value: processingProgress });
  }

  return patchItem<Asset>(OPERATIONAL_CONTAINERS.ASSETS, id, operations, projectId);
}

export async function deleteAsset(id: string, projectId: string): Promise<void> {
  return deleteItem(OPERATIONAL_CONTAINERS.ASSETS, id, projectId);
}

// =============================================
// Operational Database - Notification Operations
// =============================================

export async function createNotification(notification: Notification): Promise<Notification> {
  return createItem<Notification>(OPERATIONAL_CONTAINERS.NOTIFICATIONS, notification);
}

export async function getNotificationById(id: string, projectId: string): Promise<Notification> {
  return readItem<Notification>(OPERATIONAL_CONTAINERS.NOTIFICATIONS, id, projectId);
}

export async function getNotificationsByProject(projectId: string, status?: Notification['status']): Promise<Notification[]> {
  let query = 'SELECT * FROM c WHERE c.projectId = @projectId';
  const parameters: { name: string, value: any }[] = [
    { name: '@projectId', value: projectId }
  ];

  if (status) {
    query += ' AND c.status = @status';
    parameters.push({ name: '@status', value: status });
  }

  return queryItems<Notification>(OPERATIONAL_CONTAINERS.NOTIFICATIONS, query, parameters);
}

export async function updateNotificationStatus(
  id: string,
  projectId: string,
  status: Notification['status'],
  userId: string
): Promise<Notification> {
  const notification = await getNotificationById(id, projectId);
  const operations: PatchOperation[] = [
    { op: 'replace', path: '/status', value: status }
  ];

  // Add appropriate user and timestamp based on the status
  if (status === 'read' && notification.status === 'unread') {
    operations.push(
      { op: 'replace', path: '/readBy', value: userId },
      { op: 'replace', path: '/readAt', value: new Date().toISOString() }
    );
  } else if (status === 'acknowledged') {
    operations.push(
      { op: 'replace', path: '/acknowledgedBy', value: userId },
      { op: 'replace', path: '/acknowledgedAt', value: new Date().toISOString() }
    );
  } else if (status === 'resolved') {
    operations.push(
      { op: 'replace', path: '/resolvedBy', value: userId },
      { op: 'replace', path: '/resolvedAt', value: new Date().toISOString() }
    );
  }

  return patchItem<Notification>(OPERATIONAL_CONTAINERS.NOTIFICATIONS, id, operations, projectId);
}

export async function deleteNotification(id: string, projectId: string): Promise<void> {
  return deleteItem(OPERATIONAL_CONTAINERS.NOTIFICATIONS, id, projectId);
}

// =============================================
// Operational Database - Membership Operations
// =============================================

export async function createMembership(membership: Membership): Promise<Membership> {
  return createItem<Membership>(OPERATIONAL_CONTAINERS.MEMBERSHIP, membership);
}

export async function getMembershipById(id: string, resourceType: string, resourceId: string): Promise<Membership> {
  return readItem<Membership>(OPERATIONAL_CONTAINERS.MEMBERSHIP, id, [resourceType, resourceId]);
}

export async function getUserMemberships(userId: string): Promise<Membership[]> {
  return queryItems<Membership>(
    OPERATIONAL_CONTAINERS.MEMBERSHIP,
    'SELECT * FROM c WHERE c.userId = @userId',
    [{ name: '@userId', value: userId }]
  );
}

export async function getResourceMembers(resourceType: string, resourceId: string): Promise<Membership[]> {
  return queryItems<Membership>(
    OPERATIONAL_CONTAINERS.MEMBERSHIP,
    'SELECT * FROM c WHERE c.resourceType = @resourceType AND c.resourceId = @resourceId',
    [
      { name: '@resourceType', value: resourceType },
      { name: '@resourceId', value: resourceId }
    ]
  );
}

export async function updateMembershipStatus(
  id: string,
  resourceType: string,
  resourceId: string,
  status: Membership['status']
): Promise<Membership> {
  return patchItem<Membership>(
    OPERATIONAL_CONTAINERS.MEMBERSHIP,
    id,
    [{ op: 'replace', path: '/status', value: status }],
    [resourceType, resourceId]
  );
}

export async function deleteMembership(id: string, resourceType: string, resourceId: string): Promise<void> {
  return deleteItem(OPERATIONAL_CONTAINERS.MEMBERSHIP, id, [resourceType, resourceId]);
}

// =============================================
// Operational Database - Jobs Operations
// =============================================

export async function createAnalysisJob(job: AnalysisJob): Promise<AnalysisJob> {
  return createItem<AnalysisJob>(OPERATIONAL_CONTAINERS.JOBS, job);
}

export async function getAnalysisJobById(id: string, projectId: string): Promise<AnalysisJob> {
  return readItem<AnalysisJob>(OPERATIONAL_CONTAINERS.JOBS, id, projectId);
}

export async function getAnalysisJobsByProject(projectId: string, status?: AnalysisJob['status']): Promise<AnalysisJob[]> {
  let query = 'SELECT * FROM c WHERE c.projectId = @projectId';
  const parameters: { name: string, value: any }[] = [
    { name: '@projectId', value: projectId }
  ];

  if (status) {
    query += ' AND c.status = @status';
    parameters.push({ name: '@status', value: status });
  }

  return queryItems<AnalysisJob>(OPERATIONAL_CONTAINERS.JOBS, query, parameters);
}

export async function updateAnalysisJobStatus(
  id: string,
  projectId: string,
  status: AnalysisJob['status'],
  progress?: number
): Promise<AnalysisJob> {
  const operations: PatchOperation[] = [
    { op: 'replace', path: '/status', value: status }
  ];

  if (progress !== undefined) {
    operations.push({ op: 'replace', path: '/progress', value: progress });
  }

  // Add timestamps based on status
  if (status === 'running') {
    operations.push({ op: 'replace', path: '/startedAt', value: new Date().toISOString() });
  } else if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    operations.push({ op: 'replace', path: '/completedAt', value: new Date().toISOString() });
  }

  return patchItem<AnalysisJob>(OPERATIONAL_CONTAINERS.JOBS, id, operations, projectId);
}

export async function updateAnalysisJobResults(
  id: string,
  projectId: string,
  results: AnalysisJob['results']
): Promise<AnalysisJob> {
  return patchItem<AnalysisJob>(
    OPERATIONAL_CONTAINERS.JOBS,
    id,
    [{ op: 'replace', path: '/results', value: results }],
    projectId
  );
}

// =============================================
// Analytics Database - Raw Data Operations
// =============================================

export async function createRawIotData<T extends ItemDefinition>(
  projectId: string,
  data: T
): Promise<T> {
  return createProjectItem<T>(projectId, ANALYTICS_CONTAINERS.RAW, data);
}

export async function getRawIotDataById<T extends ItemDefinition>(
  projectId: string,
  id: string,
  deviceId: string
): Promise<T> {
  return readProjectItem<T>(projectId, ANALYTICS_CONTAINERS.RAW, id, deviceId);
}

export async function queryRawIotData<T extends ItemDefinition>(
  projectId: string,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  return queryProjectItems<T>(projectId, ANALYTICS_CONTAINERS.RAW, query, parameters);
}

// =============================================
// Analytics Database - Enriched Data Operations
// =============================================

export async function createEnrichedData<T extends ItemDefinition>(
  projectId: string,
  data: T
): Promise<T> {
  return createProjectItem<T>(projectId, ANALYTICS_CONTAINERS.ENRICHED, data);
}

export async function getEnrichedDataById<T extends ItemDefinition>(
  projectId: string,
  id: string,
  sourceType: string,
  sourceId: string
): Promise<T> {
  return readProjectItem<T>(projectId, ANALYTICS_CONTAINERS.ENRICHED, id, [sourceType, sourceId]);
}

export async function queryEnrichedData<T extends ItemDefinition>(
  projectId: string,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  return queryProjectItems<T>(projectId, ANALYTICS_CONTAINERS.ENRICHED, query, parameters);
}

// =============================================
// Analytics Database - Processed Data Operations
// =============================================

export async function createProcessedData<T extends ItemDefinition>(
  projectId: string,
  data: T
): Promise<T> {
  return createProjectItem<T>(projectId, ANALYTICS_CONTAINERS.PROCESSED, data);
}

export async function getProcessedDataById<T extends ItemDefinition>(
  projectId: string,
  id: string,
  analysisType: string
): Promise<T> {
  return readProjectItem<T>(projectId, ANALYTICS_CONTAINERS.PROCESSED, id, analysisType);
}

export async function queryProcessedData<T extends ItemDefinition>(
  projectId: string,
  query: string,
  parameters: { name: string, value: any }[] = []
): Promise<T[]> {
  return queryProjectItems<T>(projectId, ANALYTICS_CONTAINERS.PROCESSED, query, parameters);
}