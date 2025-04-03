


/**
 * Input for device registration
 */
export interface RegisterDeviceInput {
  deviceId: string;
  projectId: string;
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