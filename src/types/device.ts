/**
 * Device representation in the operational database
 */
export interface Device {
  id: string;
  deviceID: string;
  deviceName: string;
  sensorType: string;
  location: string;
  purpose: string;
  connectionString: string;
  createdAt: string;
  createdBy?: string;
  modifiedAt: string;
  modifiedBy?: string;
}

/**
 * Input for device registration
 */
export interface RegisterDeviceInput {
  deviceID: string;
  deviceName?: string;
  sensorType?: string;
  location?: string;
  purpose?: string;
}

/**
 * Input for device update
 */
export interface UpdateDeviceInput {
  deviceName?: string;
  sensorType?: string;
  location?: string;
  purpose?: string;
}