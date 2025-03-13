import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/device';

import { app } from '@azure/functions';
import { queryItems, deleteItem } from '~/utils/cosmos';
import { notFound, handleApiError } from '~/utils/error';
import { deleteIoTHubDevice } from '~/utils/iothub';

/**
 * HTTP Trigger to delete a device
 * DELETE /api/devices/{id}
 */
const DeleteDeviceHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get device ID from route parameter
    const deviceId = request.params.id;
    if (!deviceId) {
      return notFound('Device');
    }

    // Query the device by deviceID
    const query = `SELECT * FROM c WHERE c.deviceID = @deviceID`;
    const parameters = [{ name: '@deviceID', value: deviceId }];

    const devices = await queryItems<Device>('devices', query, parameters);

    if (!devices || devices.length === 0) {
      return notFound('Device', deviceId);
    }

    // Get the existing device
    const device = devices[0];

    context.log(`Attempting to delete from CosmosDB: id=${device.id}, partition_key=${device.deviceID}`);

    // Delete from CosmosDB
    await deleteItem('devices', device.id, device.deviceID);
    context.log(`Device '${deviceId}' deleted from CosmosDB.`);

    // Remove from IoT Hub
    const iotHubResult = await deleteIoTHubDevice(deviceId);
    if (!iotHubResult) {
      return {
        status: 500,
        jsonBody: {
          error: `Failed to remove device '${deviceId}' from IoT Hub`
        }
      };
    }

    return {
      status: 200,
      jsonBody: {
        message: `Device '${deviceId}' deleted successfully`
      }
    };
  } catch (error) {
    context.error('Error deleting device:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
const _FunctionName = 'DeleteDevice';
const _FunctionRoute = 'devices/{id}';
const _FunctionHandler = DeleteDeviceHandler;

app.http(_FunctionName, {
  route: _FunctionRoute,
  methods: ['DELETE'],
  authLevel: 'anonymous', // Consider using 'function' in production
  handler: _FunctionHandler,
});

export default {
  name: _FunctionName,
  route: _FunctionRoute,
  handler: _FunctionHandler,
};