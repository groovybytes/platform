// @filename: auth.ts
import type { HttpRequest } from "@azure/functions";
import type { ExtendedJWT } from "./tokens";

import { extractTokenFromHeaders, decryptJWE } from "./tokens";
import { getMembership, getUserPermissions } from "./membership";

export interface RequestContext {
  request: {
    userId: string;
    permissions: string[];
    payload: ExtendedJWT | null;
    isAuthenticated: boolean;
  };
  workspace?: {
    id: string;
    permissions: string[];
    membershipType?: "member" | "guest";
  };
  project?: {
    id: string;
    workspaceId: string;
    permissions: string[];
    membershipType?: "member" | "guest";
  };
}

/**
 * Extract the authenticated user information from a request
 * 
 * @param req - The HTTP request object
 * @returns Basic user information from the token
 */
export async function extractUserFromToken(req: Request | HttpRequest): Promise<{ 
    userId: string; 
    permissions: string[]; 
    payload: ExtendedJWT | null;
    isAuthenticated: boolean;
  }> {
    const token = extractTokenFromHeaders(req.headers as Headers);
    
    if (token) {
      try {      
        const payload = await decryptJWE(token);
        if (!payload) {
          throw new Error('Invalid token: unable to decrypt or validate');
        }
        
        return {
          userId: payload.sub || 'unknown',
          permissions: Array.isArray(payload.permissions) ? payload.permissions : [],
          payload,
          isAuthenticated: true
        };
      } catch (error) {
        console.error('Error extracting user from token:', error);
      }
    }
    
    // Default for unauthenticated requests
    return {
      userId: 'anonymous',
      permissions: [],
      payload: null,
      isAuthenticated: false
    };
  }
  
  /**
   * Get authenticated user and contextual resource information from a request
   * 
   * @param req - The HTTP request object
   * @returns User information and context-specific resource permissions
   */
  export async function getRequestContext(req: Request | HttpRequest): Promise<RequestContext> {
    // Extract user information from token
    const { userId, payload, permissions, isAuthenticated } = await extractUserFromToken(req);
    
    // Initialize result object
    const result: RequestContext = {
      request: {
        userId,
        payload,
        permissions,
        isAuthenticated
      }
    };
  
    // Get URL parameters
    const url = new URL(req.url);
    const workspaceId = url.searchParams.get('workspaceId');
    const projectId = url.searchParams.get('projectId');
    
    // If user is authenticated, get contextual permissions
    if (isAuthenticated && userId !== 'anonymous') {
      // Handle workspace context if workspaceId is present
      if (workspaceId) {
        const workspaceMembership = await getMembership(userId, "workspace", workspaceId);
        
        if (workspaceMembership && workspaceMembership.status === "active") {
          const workspacePermissions = await getUserPermissions(userId, "workspace", workspaceId);
          
          result.workspace = {
            id: workspaceId,
            permissions: workspacePermissions,
            membershipType: workspaceMembership.membershipType
          };
        }
      }
      
      // Handle project context if projectId is present
      if (projectId) {
        // First get project membership
        const projectMembership = await getMembership(userId, "project", projectId);
        
        if (projectMembership && projectMembership.status === "active") {
          const projectPermissions = await getUserPermissions(userId, "project", projectId);
          
          // Get the workspaceId for this project if not already provided
          // In a real implementation, you would look up the project to get its workspaceId
          const project = await getProjectDetails(projectId);
          const projectWorkspaceId = project?.workspaceId || workspaceId || '';
          
          result.project = {
            id: projectId,
            workspaceId: projectWorkspaceId,
            permissions: projectPermissions,
            membershipType: projectMembership.membershipType
          };
          
          // If we have a project but no workspace context yet, add the workspace context
          if (projectWorkspaceId && !result.workspace && projectWorkspaceId !== workspaceId) {
            const workspaceMembership = await getMembership(userId, "workspace", projectWorkspaceId);
            
            if (workspaceMembership && workspaceMembership.status === "active") {
              const workspacePermissions = await getUserPermissions(userId, "workspace", projectWorkspaceId);
              
              result.workspace = {
                id: projectWorkspaceId,
                permissions: workspacePermissions,
                membershipType: workspaceMembership.membershipType
              };
            }
          }
        }
      }
    }
    
    return result;
  }
  
  /**
   * Helper function to get project details
   * This function would be implemented to retrieve project information from your database
   */
  async function getProjectDetails(projectId: string): Promise<{ workspaceId: string } | null> {
    // This is a placeholder - you would implement this to fetch project details from your database
    // For example, using queryItems to get the project document that contains the workspaceId
    
    try {
      // Example implementation:
      // const project = await readItem('projects', projectId);
      // return project ? { workspaceId: project.workspaceId } : null;
      
      // Placeholder return
      return { workspaceId: '' };
    } catch (error) {
      console.error(`Error getting project details for ${projectId}:`, error);
      return null;
    }
  }