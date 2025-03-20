import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device, RegisterDeviceInput } from '~/types/device';

import { app } from '@azure/functions';
import { nanoid } from 'nanoid';
import { createItem } from '~/utils/cosmos';
import { createIoTHubDevice } from '~/utils/iothub';
import { badRequest, handleApiError } from '~/utils/error';

// Counter for incrementing default device names (in-memory, resets on function restart)
let defaultDeviceCounter = 1;

/**
 * HTTP Trigger to register a new IoT device
 * POST /api/devices/register
 */
const RegisterDeviceHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Parse request body
    const data = await request.json() as RegisterDeviceInput;

    context.log('Received data:', data);

    // Validate deviceID exists
    if (!data.deviceID || !data.deviceID.trim()) {
      return badRequest('deviceID is required');
    }

    // Assign default values for optional fields
    const deviceName = data.deviceName || `Unknown Device ${defaultDeviceCounter++}`;

    // Prepare device info
    const deviceInfo: Omit<Device, 'connectionString' | 'id' | 'createdAt' | 'modifiedAt'> = {
      deviceID: data.deviceID,
      deviceName,
      sensorType: data.sensorType || 'Unknown Sensor',
      location: data.location || 'Unknown Location',
      purpose: data.purpose || 'Not Specified',
    };

    context.log('Processed device info:', deviceInfo);

    // Create device in IoT Hub
    const connectionString = await createIoTHubDevice(deviceInfo.deviceID);
    if (!connectionString) {
      return {
        status: 500,
        jsonBody: { error: 'Failed to create device in IoT Hub' }
      };
    }

    const timestamp = new Date().toISOString();

    // Save to CosmosDB
    const deviceRecord: Device = {
      ...deviceInfo,
      id: nanoid(),
      connectionString,
      createdAt: timestamp,
      modifiedAt: timestamp
    };

    const createdDevice = await createItem<Device>('devices', deviceRecord);

    // Remove connection string from response for security
    const { connectionString: _, ...deviceResponse } = createdDevice;

    return {
      status: 201,
      jsonBody: {
        message: 'Device registered successfully',
        device: deviceResponse
      }
    };
  } catch (error) {
    context.error('Error registering device:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
const _FunctionName = 'RegisterDevice';
const _FunctionRoute = 'devices/register';
const _FunctionHandler = RegisterDeviceHandler;

app.http(_FunctionName, {
  route: _FunctionRoute,
  methods: ['POST'],
  authLevel: 'anonymous', // Consider using 'function' in production
  handler: _FunctionHandler,
});

export default {
  name: _FunctionName,
  route: _FunctionRoute,
  handler: _FunctionHandler,
};