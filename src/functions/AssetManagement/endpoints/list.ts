// @filename: functions/DeviceManagement/endpoints/list.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/operational';

import { getDevicesByProject } from '~/utils/cosmos/helpers';
import { badRequest, handleApiError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to list all devices for a project
 * GET /api/v1/devices
 */
const ListDevicesHandler = secureEndpoint(
  {
    permissions: "project:*:devices:read:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get project ID from request context
      const { project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Get devices from database
      const devices = await getDevicesByProject(project.id);
      
      // Remove connection strings from response for security
      const secureDevices = devices.map(device => {
        const { connectionString: _, ...secureDevice } = device;
        return secureDevice;
      });
      
      return ok({
        count: secureDevices.length,
        devices: secureDevices
      });
    } catch (error) {
      context.error('Error listing devices:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'ListDevices',
  Route: 'v1/devices',
  Handler: ListDevicesHandler,
  Methods: ['GET'] as HttpMethod[],
  Input: {} as Record<string, never>,
  Output: {} as { count: number, devices: Device[] },
};