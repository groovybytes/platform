import IotHub from 'azure-iothub';

// Initialize IoT Hub registry
let registry: IotHub.Registry | null = null;

/**
 * Get or create an instance of the IoT Hub registry
 */
export function getIoTHubRegistry(): IotHub.Registry {
  if (!registry) {
    const connectionString = process.env.IOT_HUB_CONNECTION_STRING as string;
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
    const registry = getIoTHubRegistry();

    // Create device with symmetric key authentication
    const device = await registry.create({
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

    // Get device information to generate connection string
    const deviceInfo = await registry.get(deviceId);

    // Generate connection string
    if (deviceInfo.responseBody && deviceInfo.responseBody.authentication?.symmetricKey?.primaryKey) {
      const hostName = process.env.IOT_HUB_HOSTNAME;
      const primaryKey = deviceInfo.responseBody.authentication.symmetricKey.primaryKey;

      const connectionString =
        `HostName=${hostName};DeviceId=${deviceId};SharedAccessKey=${primaryKey}`;

      console.log(`Device '${deviceId}' created successfully`);
      return connectionString;
    }

    return null;
  } catch (error) {
    console.error(`Failed to create Azure IoT device: ${error}`);
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
    const registry = getIoTHubRegistry();
    await registry.delete(deviceId);
    console.log(`Device '${deviceId}' removed from IoT Hub`);
    return true;
  } catch (error) {
    console.error(`Failed to remove device from IoT Hub: ${error}`);
    return false;
  }
}