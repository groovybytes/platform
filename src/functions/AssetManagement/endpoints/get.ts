// @filename: functions/DeviceManagement/endpoints/get.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/operational';

import { getDeviceById } from '~/utils/cosmos/helpers';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to get a device by ID
 * GET /api/v1/devices/{id}
 */
const GetDeviceHandler = secureEndpoint(
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
      
      // Get device ID from route parameters
      const req = request as HttpRequest;
      const deviceId = req.params.id;
      
      if (!deviceId) {
        return badRequest('Device ID is required');
      }
      
      // Get device from database
      const device = await getDeviceById(deviceId, project.id);
      
      if (!device) {
        return notFound('Device', deviceId);
      }
      
      // Remove connection string from response for security
      const { connectionString: _, ...secureDevice } = device;
      
      return ok(secureDevice);
    } catch (error) {
      context.error('Error getting device:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'GetDevice',
  Route: 'v1/devices/{id}',
  Handler: GetDeviceHandler,
  Methods: ['GET'] as HttpMethod[],
  Input: {} as { id: string },
  Output: {} as Device,
};