// @filename=src/functions/DeviceManagement/devices.ts
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { Device, RegisterDeviceInput, UpdateDeviceInput } from '~/types/device';

import { app } from '@azure/functions';
import { nanoid } from 'nanoid';
import { createItem, queryItems, replaceItem, deleteItem } from '~/utils/cosmos';
import { createIoTHubDevice, deleteIoTHubDevice } from '~/utils/iothub';
import { badRequest, handleApiError, unauthorized, forbidden, notFound } from '~/utils/error';
import { getUserIdFromToken, hasWorkspaceRole } from '~/utils/auth';
import { hasPermission } from '~/utils/permissions';

// Counter for incrementing default device names (in-memory, resets on function restart)
let defaultDeviceCounter = 1;

/**
 * HTTP Trigger for RESTful Device Management API
 * GET/POST/PUT/DELETE /api/v1/devices?workspace={workspaceId}&project={projectId}
 */
const DevicesHandler = async (
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> => {
  try {
    // Get workspace and project IDs from query parameters
    const workspaceId = request.query.get('workspace');
    const projectId = request.query.get('project');

    if (!workspaceId) {
      return badRequest('workspace parameter is required');
    }

    // Get authenticated user
    let userId: string;
    try {
      userId = getUserIdFromToken(request);
    } catch (error) {
      return unauthorized('Authentication required');
    }

    // Check workspace access (basic access check for all operations)
    const hasAccess = await hasPermission(userId, workspaceId, 'workspace:read');
    if (!hasAccess) {
      return forbidden('You do not have permission to access this workspace');
    }

    // Handle request based on HTTP method
    const method = request.method.toLowerCase();
    const deviceId = request.params.id;

    // Route to appropriate handler
    switch (method) {
      case 'get':
        return deviceId
          ? await getDeviceById(deviceId, workspaceId, projectId, context)
          : await getDevices(workspaceId, projectId, context);

      case 'post':
        // Additional permission check for creating devices
        const canCreate = await hasWorkspaceRole(userId, workspaceId, ['admin', 'owner', 'member']);
        if (!canCreate) {
          return forbidden('You do not have permission to create devices');
        }

        // Project-specific permission check if applicable
        if (projectId) {
          // In a real app, check project-specific permissions here
          // For now, we'll just use workspace roles
        }

        return await createDevice(request, userId, workspaceId, projectId, context);

      case 'put':
        if (!deviceId) {
          return badRequest('Device ID is required for update operations');
        }

        // Check permission for updating devices
        const canUpdate = await hasPermission(userId, workspaceId, 'devices:update', projectId || undefined);
        if (!canUpdate) {
          return forbidden('You do not have permission to update devices');
        }

        return await updateDevice(deviceId, request, userId, workspaceId, projectId, context);

      case 'delete':
        if (!deviceId) {
          return badRequest('Device ID is required for delete operations');
        }

        // Check permission for deleting devices
        const canDelete = await hasPermission(userId, workspaceId, 'devices:delete', projectId || undefined);
        if (!canDelete) {
          return forbidden('You do not have permission to delete devices');
        }

        return await deleteDevice(deviceId, workspaceId, projectId, context);

      default:
        return {
          status: 405,
          body: 'Method Not Allowed',
          headers: { 'Allow': 'GET, POST, PUT, DELETE' }
        };
    }
  } catch (error) {
    context.error('Error in device management API:', error);
    return handleApiError(error);
  }
};

/**
 * Get all devices with filtering by workspace and optional project
 */
async function getDevices(
  workspaceId: string,
  projectId?: string | null,
  context?: InvocationContext
): Promise<HttpResponseInit> {
  // Build the query based on workspace and optional project
  let query = 'SELECT * FROM c WHERE c.workspaceId = @workspaceId';
  const parameters = [{ name: '@workspaceId', value: workspaceId }];

  // Add project filter if provided
  if (projectId) {
    query += ' AND c.projectId = @projectId';
    parameters.push({ name: '@projectId', value: projectId });
  }

  // Query devices from CosmosDB based on workspace/project context
  const devices = await queryItems<Device>('devices', query, parameters);

  // Remove connection strings for security
  const sanitizedDevices = devices.map(({ connectionString, ...device }) => device);

  return {
    status: 200,
    jsonBody: sanitizedDevices
  };
}

/**
 * Get a specific device by ID
 */
async function getDeviceById(
  deviceId: string,
  workspaceId: string,
  projectId?: string | null,
  context?: InvocationContext
): Promise<HttpResponseInit> {
  // Query the device with proper workspace/project isolation
  let query = `SELECT * FROM c WHERE c.deviceID = @deviceID AND c.workspaceId = @workspaceId`;
  const parameters = [
    { name: '@deviceID', value: deviceId },
    { name: '@workspaceId', value: workspaceId }
  ];

  // Add project filter if provided
  if (projectId) {
    query += ' AND c.projectId = @projectId';
    parameters.push({ name: '@projectId', value: projectId });
  }

  const devices = await queryItems<Device>('devices', query, parameters);

  if (!devices || devices.length === 0) {
    return notFound('Device', deviceId);
  }

  // Remove connection string for security
  const { connectionString, ...device } = devices[0];

  return {
    status: 200,
    jsonBody: device
  };
}

/**
 * Create a new device
 */
async function createDevice(
  request: HttpRequest,
  userId: string,
  workspaceId: string,
  projectId?: string | null,
  context?: InvocationContext
): Promise<HttpResponseInit> {
  // Parse request body
  const data = await request.json() as RegisterDeviceInput;

  if (context) context.log('Received data:', data);

  // Validate deviceID exists
  if (!data.deviceID || !data.deviceID.trim()) {
    return badRequest('deviceID is required');
  }

  // Assign default values for optional fields
  const deviceName = data.deviceName || `Unknown Device ${defaultDeviceCounter++}`;

  // Prepare device info
  const deviceInfo: Omit<Device, 'connectionString' | 'id' | 'createdAt' | 'modifiedAt' | 'workspaceId' | 'projectId'> = {
    deviceID: data.deviceID,
    deviceName,
    sensorType: data.sensorType || 'Unknown Sensor',
    location: data.location || 'Unknown Location',
    purpose: data.purpose || 'Not Specified',
  };

  if (context) context.log('Processed device info:', deviceInfo);

  // Create device in IoT Hub
  const connectionString = await createIoTHubDevice(deviceInfo.deviceID);
  if (!connectionString) {
    return {
      status: 500,
      jsonBody: { error: 'Failed to create device in IoT Hub' }
    };
  }

  const timestamp = new Date().toISOString();

  // Save to CosmosDB with workspace and project context
  const deviceRecord: Device = {
    ...deviceInfo,
    id: nanoid(),
    connectionString,
    workspaceId,
    ...(projectId && { projectId }),
    createdAt: timestamp,
    createdBy: userId,
    modifiedAt: timestamp,
    modifiedBy: userId
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
}

/**
 * Update an existing device
 */
async function updateDevice(
  deviceId: string,
  request: HttpRequest,
  userId: string,
  workspaceId: string,
  projectId?: string | null,
  context?: InvocationContext
): Promise<HttpResponseInit> {
  // Parse request body
  const data = await request.json() as UpdateDeviceInput;

  // Query the device by deviceID and workspaceId for proper isolation
  let query = `SELECT * FROM c WHERE c.deviceID = @deviceID AND c.workspaceId = @workspaceId`;
  const parameters = [
    { name: '@deviceID', value: deviceId },
    { name: '@workspaceId', value: workspaceId }
  ];

  // Add project filter if provided
  if (projectId) {
    query += ' AND c.projectId = @projectId';
    parameters.push({ name: '@projectId', value: projectId });
  }

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
    modifiedAt: new Date().toISOString(),
    modifiedBy: userId
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
}

/**
 * Delete a device
 */
async function deleteDevice(
  deviceId: string,
  workspaceId: string,
  projectId?: string | null,
  context?: InvocationContext
): Promise<HttpResponseInit> {
  // Query the device by deviceID and workspaceId for proper isolation
  let query = `SELECT * FROM c WHERE c.deviceID = @deviceID AND c.workspaceId = @workspaceId`;
  const parameters = [
    { name: '@deviceID', value: deviceId },
    { name: '@workspaceId', value: workspaceId }
  ];

  // Add project filter if provided
  if (projectId) {
    query += ' AND c.projectId = @projectId';
    parameters.push({ name: '@projectId', value: projectId });
  }

  const devices = await queryItems<Device>('devices', query, parameters);

  if (!devices || devices.length === 0) {
    return notFound('Device', deviceId);
  }

  // Get the existing device
  const device = devices[0];

  if (context) context.log(`Attempting to delete from CosmosDB: id=${device.id}, partition_key=${device.deviceID}`);

  // Delete from CosmosDB
  await deleteItem('devices', device.id, device.deviceID);
  if (context) context.log(`Device '${deviceId}' deleted from CosmosDB.`);

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
}

// Register the HTTP trigger with multiple routes for RESTful API
const _FunctionName = 'DevicesAPI';
const _FunctionHandler = DevicesHandler;

// Route for collection endpoints (GET all, POST new)
app.http('DevicesCollectionEndpoint', {
  route: 'api/v1/devices',
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  handler: _FunctionHandler,
});

// Route for individual device endpoints (GET one, PUT update, DELETE)
app.http('DeviceItemEndpoint', {
  route: 'api/v1/devices/{id}',
  methods: ['GET', 'PUT', 'DELETE'],
  authLevel: 'anonymous',
  handler: _FunctionHandler,
});

export default {
  name: _FunctionName,
  handler: _FunctionHandler,
};