import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device, UpdateDeviceInput } from '~/types/device';

import { app } from '@azure/functions';
import { queryItems, replaceItem } from '~/utils/cosmos';
import { notFound, handleApiError } from '~/utils/error';

/**
 * HTTP Trigger to update a device's details
 * PUT /api/devices/update/{id}
 */
const UpdateDeviceHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get device ID from route parameter
    const deviceId = request.params.id;
    if (!deviceId) {
      return notFound('Device');
    }

    // Parse request body
    const data = await request.json() as UpdateDeviceInput;

    // Query the device by deviceID
    const query = `SELECT * FROM c WHERE c.deviceID = @deviceID`;
    const parameters = [{ name: '@deviceID', value: deviceId }];

    const devices = await queryItems<Device>('devices', query, parameters);

    if (!devices || devices.length === 0) {
      return notFound('Device', deviceId);
    }

    // Get the existing device
    const existingDevice = devices[0];

    // Update the device properties
    const updatedDevice: Device = {
      ...existingDevice,
      deviceName: data.deviceName || existingDevice.deviceName,
      sensorType: data.sensorType || existingDevice.sensorType,
      location: data.location || existingDevice.location,
      purpose: data.purpose || existingDevice.purpose,
      modifiedAt: new Date().toISOString()
    };

    // Replace the item in CosmosDB
    const result = await replaceItem<Device>(
      'devices',
      existingDevice.id,
      updatedDevice,
      existingDevice.deviceID
    );

    // Remove connection string from response for security
    const { connectionString: _, ...deviceResponse } = result;

    return {
      status: 200,
      jsonBody: {
        message: 'Device updated successfully',
        device: deviceResponse
      }
    };
  } catch (error) {
    context.error('Error updating device:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
const _FunctionName = 'UpdateDevice';
const _FunctionRoute = 'devices/update/{id}';
const _FunctionHandler = UpdateDeviceHandler;

app.http(_FunctionName, {
  route: _FunctionRoute,
  methods: ['PUT'],
  authLevel: 'anonymous', // Consider using 'function' in production
  handler: _FunctionHandler,
});

export default {
  name: _FunctionName,
  route: _FunctionRoute,
  handler: _FunctionHandler,
};