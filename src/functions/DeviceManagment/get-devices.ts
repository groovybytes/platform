import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device } from '~/types/device';

import { app } from '@azure/functions';
import { queryItems } from '~/utils/cosmos';
import { handleApiError } from '~/utils/error';

/**
 * HTTP Trigger to get all registered devices
 * GET /api/devices/fetch
 */
const GetDevicesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Query all devices from CosmosDB
    const devices = await queryItems<Device>('devices', 'SELECT * FROM c');

    // Remove connection strings for security
    const sanitizedDevices = devices.map(({ connectionString, ...device }) => device);

    return {
      status: 200,
      jsonBody: sanitizedDevices
    };
  } catch (error) {
    context.error('Error fetching devices:', error);
    return handleApiError(error);
  }
};

// Register the HTTP trigger
const _FunctionName = 'GetDevices';
const _FunctionRoute = 'devices/fetch';
const _FunctionHandler = GetDevicesHandler;

app.http(_FunctionName, {
  route: _FunctionRoute,
  methods: ['GET'],
  authLevel: 'anonymous', // Consider using 'function' in production
  handler: _FunctionHandler,
});

export default {
  name: _FunctionName,
  route: _FunctionRoute,
  handler: _FunctionHandler,
};