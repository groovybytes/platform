
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

import { combinePermissionChecks, createRequestPermissionChecker, protectEndpoint, secureEndpoint } from './protect';
import { forbidden, handleApiError, permissionDenied } from './error';
import { checkPermission, createPermissionChecker } from './permissions';

// Get user data endpoint - requires user:read permission
export const getUserData = secureEndpoint(
  'user:read',
  async (req: HttpRequest, context: InvocationContext) => {
    const userId = req.params.id;
    // Fetch and return user data
    return {
      status: 200,
      jsonBody: { /* user data */ }
    };
  }
);

// Update billing information - requires either billing:admin OR both billing:write AND account:owner
export const updateBillingInfo = secureEndpoint(
    {
      permissions: ['billing:admin', 'billing:write'], 
      match: 'any',
      resourceName: 'billing information',
      errorMessage: 'You need billing administrator or write permissions to update billing information'
    },
    async (req: HttpRequest, context: InvocationContext) => {
      // Update billing information
      return {
        status: 200,
        jsonBody: { success: true }
      };
    }
  );

export const updateUserSettings = secureEndpoint(
  {
    permissions: 'user:write',
    resourceName: 'user settings'
  },
  async (req: HttpRequest, context: InvocationContext) => {
    // First apply complex authorization check
    const userId = req.params.id;
    const authCheck = combinePermissionChecks([
      // Check 1: Either the user is modifying their own settings...
      (req) => {
        const isSelf = req.user.id === userId;
        return isSelf ? null : forbidden('You can only modify your own settings');
      },
      
      // Check 2: ...OR they need admin permissions (already passed the basic user:write check)
      (req) => {
        const checkPermission = createRequestPermissionChecker(req);
        const isAdmin = checkPermission('user:admin');
        return isAdmin ? null : permissionDenied('user:admin', 'other user settings');
      }
    ]);
    
    // Run the complex check
    const authResult = authCheck(req, context);
    if (authResult !== null) {
      return authResult; // Return error response if auth failed
    }
    
    // Authorization passed, proceed with updating settings
    return {
      status: 200,
      jsonBody: { success: true }
    };
  }
);

// Define the function handler
async function getDocumentHandler(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  try {
    const documentId = req.params.id;
    
    // Fetch document
    // const document = await documentsService.getDocument(documentId);
    const document = {}
    
    return {
      status: 200,
      jsonBody: document
    };
  } catch (error) {
    return handleApiError(error);
  }
}

// Wrap with permission checking
const getDocument = secureEndpoint(
  {
    permissions: ['documents:read', 'documents:admin'],
    match: 'any',
    resourceName: 'document'
  },
  getDocumentHandler
);

// Register with Azure Functions
// app.http('getDocument', {
//   methods: ['GET'],
//   authLevel: 'function',
//   route: 'documents/{id}',
//   handler: getDocument
// });


  
// Example usage:

/*
// Using secureEndpoint (simplest approach)
export const getDocument = secureEndpoint(
  'documents:read',
  async (req, context) => {
    const documentId = req.params.id;
    // Implementation...
  }
);

// Using createRequestPermissionChecker for multiple checks in a handler
export async function updateComplexResource(req, context) {
  const checkPermission = createRequestPermissionChecker(req);
  
  // Check basic access
  if (!checkPermission('resources:write')) {
    return forbidden('You need write permission to update resources');
  }
  
  // Check specific section access based on request body
  if (req.body.updateFinancials && !checkPermission('financials:write')) {
    return forbidden('You need financial write permission to update this section');
  }
  
  // Implementation after all permission checks pass...
}

// Using createPermissionMiddleware for resource-specific checks
export async function listResources(req, context) {
  const checkAccess = createPermissionMiddleware(req);
  
  // Basic permission check for listing
  const listCheck = checkAccess('resources:list');
  if (listCheck) return listCheck; // Return error if permission denied
  
  // Get resources, then filter based on specific permissions
  const resources = await getResources();
  
  return {
    status: 200,
    jsonBody: {
      resources: resources.filter(resource => {
        // Check permission for each resource type
        const resourceCheck = checkAccess(`${resource.type}:read`);
        return resourceCheck === null; // Only include resources user can access
      })
    }
  };
}
*/