// @filename: functions/DeviceManagement/endpoints/delete.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/operational';

import { badRequest, handleApiError, notFound } from '~/utils/error';
import { deleteItem, readItem } from '~/utils/cosmos/utils';

import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';

import { deleteIoTHubDevice } from '~/utils/iothub';
import { noContent } from '~/utils/response';

/**
 * HTTP Trigger to delete a device
 * DELETE /api/v1/devices/{id}
 */
const DeleteDeviceHandler = secureEndpoint(
  {
    permissions: "project:*:devices:delete:allow",
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
      
      // Get device to check if it exists and to get IoT Hub device ID
      const device = await readItem<Device>('devices', deviceId, project.id);
      
      if (!device) {
        return notFound('Device', deviceId);
      }
      
      // Delete from IoT Hub
      const iotHubDeleted = await deleteIoTHubDevice(device.id);
      
      if (!iotHubDeleted) {
        context.warn(`Failed to delete device from IoT Hub, but continuing with database deletion`);
      }
      
      // Delete from database
      await deleteItem('devices', deviceId, project.id);
      
      return noContent();
    } catch (error) {
      context.error('Error deleting device:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'DeleteDevice',
  Route: 'v1/devices/{id}',
  Handler: DeleteDeviceHandler,
  Methods: ['DELETE'] as HttpMethod[],
  Input: {} as { id: string },
  Output: void 0 as void,
};