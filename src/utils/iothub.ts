// @filename: utils/iothub.ts
import type { Device } from '~/types/operational';
import { createItem } from '~/utils/cosmos/utils';
import IotHub from 'azure-iothub';
import { nanoid } from 'nanoid';
import process from 'node:process';

// IotHub.Registry cache
let registry: IotHub.Registry | null = null;

/**
 * Get or create an instance of the IoT Hub registry
 */
export function getIoTHubRegistry(): IotHub.Registry {
  if (!registry) {
    const connectionString = process.env.IOT_HUB_CONNECTION_STRING;
    
    // Validate connection string exists
    if (!connectionString) {
      console.error('IoT Hub connection string not found in environment variables');
      throw new Error('IoT Hub connection string not configured');
    }
    
    console.log('Initializing IoT Hub registry with connection string');
    registry = IotHub.Registry.fromConnectionString(connectionString);
  }
  return registry;
}

/**
 * Creates a new IoT device in Azure IoT Hub
 * @returns The device connection string or null if failed
 */
export async function createIoTHubDevice(): Promise<{ deviceId: string, connectionString: string } | null> {
  try {
    // Generate a unique device ID
    const deviceId = `device-${nanoid(8)}`;
    console.log(`Attempting to create device '${deviceId}' in IoT Hub`);
    
    // Validate IoT Hub hostname exists
    const hostName = process.env.IOT_HUB_HOSTNAME;
    if (!hostName) {
      console.error('IoT Hub hostname not found in environment variables');
      throw new Error('IoT Hub hostname not configured');
    }
    
    const registry = getIoTHubRegistry();
    
    // Create device with symmetric key authentication
    console.log(`Creating device with ID '${deviceId}'`);
    const createResult = await registry.create({
      deviceId,
      status: 'enabled',
      authentication: {
        type: 'sas',
        symmetricKey: {
          primaryKey: '',
          secondaryKey: ''
        }
      }
    });
    console.log(`Create result status: ${createResult.responseBody ? 'success' : 'failure'}`);
    
    // Get device information to generate connection string
    console.log(`Retrieving device information for '${deviceId}'`);
    const deviceInfo = await registry.get(deviceId);
    
    // Generate connection string
    if (deviceInfo.responseBody && deviceInfo.responseBody.authentication?.symmetricKey?.primaryKey) {
      const primaryKey = deviceInfo.responseBody.authentication.symmetricKey.primaryKey;
      const connectionString = `HostName=${hostName};DeviceId=${deviceId};SharedAccessKey=${primaryKey}`;
      console.log(`Device '${deviceId}' created successfully with connection string`);
      return { deviceId, connectionString };
    } else {
      console.error(`Could not get authentication information for device '${deviceId}'`, deviceInfo);
      return null;
    }
  } catch (error) {
    console.error(`Failed to create Azure IoT device: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Removes a device from Azure IoT Hub
 * @param deviceId The device ID to delete
 * @returns True if successful, false otherwise
 */
export async function deleteIoTHubDevice(deviceId: string): Promise<boolean> {
  try {
    console.log(`Attempting to delete device '${deviceId}' from IoT Hub`);
    const registry = getIoTHubRegistry();
    await registry.delete(deviceId);
    console.log(`Device '${deviceId}' removed from IoT Hub`);
    return true;
  } catch (error) {
    console.error(`Failed to remove device from IoT Hub: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return false;
  }
}

/**
 * Updates a device status in Azure IoT Hub
 * @param deviceId The device ID to update
 * @param status The new status ('enabled' or 'disabled')
 * @returns True if successful, false otherwise
 */
export async function updateIoTHubDeviceStatus(deviceId: string, status: 'enabled' | 'disabled'): Promise<boolean> {
  try {
    console.log(`Updating device '${deviceId}' status to '${status}' in IoT Hub`);
    const registry = getIoTHubRegistry();
    
    // Get current device info
    const deviceInfo = await registry.get(deviceId);
    if (!deviceInfo.responseBody) {
      console.error(`Device '${deviceId}' not found in IoT Hub`);
      return false;
    }
    
    // Update status
    deviceInfo.responseBody.status = status;
    await registry.update(deviceInfo.responseBody);
    
    console.log(`Device '${deviceId}' status updated to '${status}' in IoT Hub`);
    return true;
  } catch (error) {
    console.error(`Failed to update IoT Hub device status: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return false;
  }
}

/**
 * Registers a device in both IoT Hub and the GroovyBytes operational database
 * @param deviceInfo Information for the device to register
 * @param projectId ID of the project to associate the device with
 * @param userId ID of the user registering the device
 * @returns The created device object or null if failed
 */
export async function registerDevice(
  deviceInfo: {
    deviceName: string;
    sensorType: string;
    location: string;
    purpose: string;
  },
  projectId: string,
  userId: string
): Promise<Device | null> {
  try {
    console.log(`Registering new device for project '${projectId}'`);
    
    // Create device in IoT Hub
    const deviceResult = await createIoTHubDevice();
    if (!deviceResult) {
      console.error(`Failed to create device in IoT Hub`);
      return null;
    }
    
    const { deviceId, connectionString } = deviceResult;
    
    // Create timestamp for audit fields
    const timestamp = new Date().toISOString();
    
    // Create device record in operational database
    const deviceRecord: Device = {
      id: nanoid(),
      projectId,
      deviceName: deviceInfo.deviceName,
      sensorType: deviceInfo.sensorType,
      location: deviceInfo.location,
      purpose: deviceInfo.purpose,
      connectionString,
      status: "registered",
      processingState: "active",
      createdAt: timestamp,
      createdBy: userId,
      modifiedAt: timestamp,
      modifiedBy: userId
    };
    
    console.log(`Creating device record in operational database for '${deviceId}'`);
    const createdDevice = await createItem<Device>('devices', deviceRecord);
    console.log(`Device '${deviceId}' successfully registered`);
    
    // Remove connection string from returned object for security
    const { connectionString: _, ...secureDevice } = createdDevice;
    return secureDevice as Device;
  } catch (error) {
    console.error(`Failed to register device: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return null;
  }
}

/**
 * Get a list of devices registered in IoT Hub
 * @param maxCount Maximum number of devices to retrieve (default: 1000)
 * @returns Array of device info objects or empty array if failed
 */
export async function listIoTHubDevices(maxCount: number = 1000): Promise<any[]> {
  try {
    console.log(`Retrieving list of devices from IoT Hub (max: ${maxCount})`);
    const registry = getIoTHubRegistry();
    const response = await registry.list();
    
    if (response.responseBody) {
      console.log(`Retrieved ${response.responseBody.length} devices from IoT Hub`);
      return response.responseBody.slice(0, maxCount);
    }
    
    console.log('No devices found in IoT Hub');
    return [];
  } catch (error) {
    console.error(`Failed to list IoT Hub devices: ${error instanceof Error ? error.message : error}`);
    if (error instanceof Error && error.stack) {
      console.debug(`Stack trace: ${error.stack}`);
    }
    return [];
  }
}

/**
 * Check if a device exists in IoT Hub
 * @param deviceId The device ID to check
 * @returns True if the device exists, false otherwise
 */
export async function deviceExists(deviceId: string): Promise<boolean> {
  try {
    console.log(`Checking if device '${deviceId}' exists in IoT Hub`);
    const registry = getIoTHubRegistry();
    const deviceInfo = await registry.get(deviceId);
    const exists = !!deviceInfo.responseBody;
    console.log(`Device '${deviceId}' ${exists ? 'exists' : 'does not exist'} in IoT Hub`);
    return exists;
  } catch (error) {
    // If device doesn't exist, this will throw an error
    console.log(`Device '${deviceId}' does not exist in IoT Hub`);
    return false;
  }
}