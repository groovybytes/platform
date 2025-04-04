// @filename: functions/DeviceManagement/endpoints/register.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/operational';

import { badRequest, handleApiError, serverError } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { registerDevice } from '~/utils/iothub';
import { created } from '~/utils/response';

// Counter for incrementing default device names (in-memory, resets on function restart)
let defaultDeviceCounter = 1;

/**
 * HTTP Trigger to register a new IoT device
 * POST /api/v1/devices
 */
const RegisterDeviceHandler = secureEndpoint(
  {
    permissions: "project:*:devices:create:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID and project ID from request context
      const { request: { userId }, project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Parse request body
      const data = await request.json() as RegisterDeviceInput;
      context.log('Received data:', data);
      
      // Assign default values for optional fields
      const deviceName = data.deviceName || `Unknown Device ${defaultDeviceCounter++}`;
      
      // Register the device
      const device = await registerDevice(
        {
          deviceName,
          sensorType: data.sensorType || 'Unknown Sensor',
          location: data.location || 'Unknown Location',
          purpose: data.purpose || 'Not Specified',
        },
        project.id,
        userId
      );
      
      if (!device) {
        return serverError('Failed to register device');
      }

      return created({
        message: 'Device registered successfully',
        device
      });
    } catch (error) {
      context.error('Error registering device:', error);
      return handleApiError(error);
    }
  }
);

/**
 * Input for device registration
 */
export interface RegisterDeviceInput {
  deviceName?: string;
  sensorType?: string;
  location?: string;
  purpose?: string;
}

// Register the HTTP trigger
export default {
  Name: 'RegisterDevice',
  Route: 'v1/devices',
  Handler: RegisterDeviceHandler,
  Methods: ['POST'] as HttpMethod[],
  Input: {} as RegisterDeviceInput,
  Output: {} as Device,
};