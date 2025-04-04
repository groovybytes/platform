// @filename: utils/iothub.ts
import type { Device } from '~/types/operational';

import { createItem } from '~/utils/cosmos/utils';
import { nanoid } from 'nanoid';

import IotHub from 'azure-iothub';
import process from 'node:process';

// Registry cache
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
 * @param deviceId Unique device identifier
 * @returns The device connection string or null if failed
 */
export async function createIoTHubDevice(deviceId: string): Promise<string | null> {
  try {
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
      return connectionString;
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
    const deviceId = nanoid();
    console.log(`Registering device '${deviceId}' for project '${projectId}'`);
    
    // Create device in IoT Hub
    const connectionString = await createIoTHubDevice(deviceId);
    if (!connectionString) {
      console.error(`Failed to create device '${deviceId}' in IoT Hub`);
      return null;
    }
    
    // Create timestamp for audit fields
    const timestamp = new Date().toISOString();
    
    // Create device record in operational database
    const deviceRecord: Device = {
      id: deviceId,
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
    
    // Create item in Cosmos DB
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