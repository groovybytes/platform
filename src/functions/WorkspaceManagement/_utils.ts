import type { Permission } from "@azure/cosmos";

/**
 * Get default workspace settings
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
   * Get default workspace roles
   */
export function getDefaultWorkspaceRoles() {
    return {
      owner: {
        name: 'Owner',
        description: 'Full control over workspace',
        permissions: ['workspace:*:*:*:allow']
      },
      admin: {
        name: 'Administrator',
        description: 'Administrative access to workspace settings',
        permissions: [
          'workspace:*:*:read:allow', 
          'workspace:*:settings:update:allow',
          'workspace:*:users:*:allow', 
          'workspace:*:teams:*:allow', 
          'workspace:*:projects:*:allow'
        ]
      },
      billing: {
        name: 'Billing Manager',
        description: 'Access to billing and subscription settings',
        permissions: [
          'workspace:*:*:read:allow',
          'workspace:*:billing:*:allow'
        ]
      },
      member: {
        name: 'Member',
        description: 'Regular workspace member',
        permissions: [
          'workspace:*:*:read:allow'
        ]
      },
      guest: {
        name: 'Guest',
        description: 'Limited access with specific permissions',
        permissions: [
          'workspace:*:*:read:allow'
        ]
      }
    };
  }
  
  /**
   * Get default workspace permissions
   */
// export function getDefaultWorkspacePermissions(): Record<string, Permission> {
//     return {
//       'workspace:*:*:read:allow': {
//         description: 'View workspace details',
//         category: 'data'
//       },
//       'workspace:*:settings:update:allow': {
//         description: 'Update workspace settings',
//         category: 'data'
//       },
//       'workspace:*:users:*:allow': {
//         description: 'Manage workspace users',
//         category: 'data'
//       },
//       'workspace:*:teams:*:allow': {
//         description: 'Manage teams',
//         category: 'data'
//       },
//       'workspace:*:projects:*:allow': {
//         description: 'Manage projects',
//         category: 'data'
//       },
//       'workspace:*:billing:*:allow': {
//         description: 'Manage billing information',
//         category: 'billing'
//       }
//     };
//   }