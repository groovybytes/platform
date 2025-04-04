// @filename: functions/DeviceManagement/endpoints/update.ts
import type { HttpMethod, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/operational';
import type { PatchOperation } from '@azure/cosmos';

import { updateIoTHubDeviceStatus } from '~/utils/iothub';
import { patchItem, readItem } from '~/utils/cosmos/utils';
import { badRequest, handleApiError, notFound } from '~/utils/error';
import { getRequestContext } from '~/utils/context';
import { secureEndpoint } from '~/utils/protect';
import { ok } from '~/utils/response';

/**
 * HTTP Trigger to update a device
 * PATCH /api/v1/devices/{id}
 */
const UpdateDeviceHandler = secureEndpoint(
  {
    permissions: "project:*:devices:update:allow",
    requireResource: "project"
  },
  async (request: Request | HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    try {
      // Get user ID and project ID from request context
      const { request: { userId }, project } = await getRequestContext(request);
      
      if (!project || !project.id) {
        return badRequest('Project ID is required. Please specify a project context.');
      }
      
      // Get device ID from route parameters
      const req = request as HttpRequest;
      const deviceId = req.params.id;
      
      if (!deviceId) {
        return badRequest('Device ID is required');
      }
      
      // Parse request body
      const updates = await request.json() as Partial<Device>;
      
      // Validate updates
      const allowedUpdates: (keyof Device)[] = ['deviceName', 'sensorType', 'location', 'purpose', 'status', 'processingState'];
      const invalidKeys = Object.keys(updates).filter(key => !allowedUpdates.includes(key as keyof Device));
      
      if (invalidKeys.length > 0) {
        return badRequest(`Invalid update fields: ${invalidKeys.join(', ')}`);
      }
      
      // Get existing device
      const existingDevice = await readItem<Device>('devices', deviceId, project.id);
      
      if (!existingDevice) {
        return notFound('Device', deviceId);
      }
      
      // Prepare update operations
      const operations: PatchOperation[] = [];
      
      if (updates.deviceName) {
        operations.push({ op: 'replace', path: '/deviceName', value: updates.deviceName });
      }
      
      if (updates.sensorType) {
        operations.push({ op: 'replace', path: '/sensorType', value: updates.sensorType });
      }
      
      if (updates.location) {
        operations.push({ op: 'replace', path: '/location', value: updates.location });
      }
      
      if (updates.purpose) {
        operations.push({ op: 'replace', path: '/purpose', value: updates.purpose });
      }
      
      // Handle status update in IoT Hub if needed
      if (updates.status && updates.status !== existingDevice.status) {
        if (updates.status === 'connected' || updates.status === 'disconnected') {
          // Update in IoT Hub
          const iotHubStatus = updates.status === 'connected' ? 'enabled' : 'disabled';
          const success = await updateIoTHubDeviceStatus(existingDevice.id, iotHubStatus);
          
          if (!success) {
            context.warn(`Failed to update device status in IoT Hub, but continuing with database update`);
          }
        }
        
        operations.push({ op: 'replace', path: '/status', value: updates.status });
      }
      
      if (updates.processingState) {
        operations.push({ op: 'replace', path: '/processingState', value: updates.processingState });
      }
      
      // Add audit fields
      operations.push({ op: 'replace', path: '/modifiedAt', value: new Date().toISOString() });
      operations.push({ op: 'replace', path: '/modifiedBy', value: userId });
      
      // Update device in database
      const updatedDevice = await patchItem<Device>('devices', deviceId, operations, project.id);
      
      // Remove connection string from response for security
      const { connectionString: _, ...secureDevice } = updatedDevice;
      
      return ok({
        message: 'Device updated successfully',
        device: secureDevice
      });
    } catch (error) {
      context.error('Error updating device:', error);
      return handleApiError(error);
    }
  }
);

// Register the HTTP trigger
export default {
  Name: 'UpdateDevice',
  Route: 'v1/devices/{id}',
  Handler: UpdateDeviceHandler,
  Methods: ['PATCH'] as HttpMethod[],
  Input: {} as { id: string } & Partial<Device>,
  Output: {} as { message: string, device: Device },
};