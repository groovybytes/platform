// @filename: functions/DeviceManagement/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import RegisterDevice from './endpoints/register';
import GetDevice from './endpoints/get';
import ListDevices from './endpoints/list';
import UpdateDevice from './endpoints/update';
import DeleteDevice from './endpoints/delete';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  RegisterDevice: {
    name: RegisterDevice.Name,
    route: RegisterDevice.Route,
    methods: RegisterDevice.Methods,
    handler: RegisterDevice.Handler,
  },
  GetDevice: {
    name: GetDevice.Name,
    route: GetDevice.Route,
    methods: GetDevice.Methods,
    handler: GetDevice.Handler,
  },
  ListDevices: {
    name: ListDevices.Name,
    route: ListDevices.Route,
    methods: ListDevices.Methods,
    handler: ListDevices.Handler,
  },
  UpdateDevice: {
    name: UpdateDevice.Name,
    route: UpdateDevice.Route,
    methods: UpdateDevice.Methods,
    handler: UpdateDevice.Handler,
  },
  DeleteDevice: {
    name: DeleteDevice.Name,
    route: DeleteDevice.Route,
    methods: DeleteDevice.Methods,
    handler: DeleteDevice.Handler,
  }
};

// Register all HTTP triggers
Object.values(Endpoints).forEach(endpoint => {
  app.http(endpoint.name, {
    route: endpoint.route,
    methods: endpoint.methods,
    authLevel: 'anonymous', // Relies on auth middleware/token validation
    handler: endpoint.handler
  });
});

// Input/Output type definitions
export type RegisterDeviceInput = typeof RegisterDevice.Input;
export type RegisterDeviceOutput = typeof RegisterDevice.Output;

export type GetDeviceInput = typeof GetDevice.Input;
export type GetDeviceOutput = typeof GetDevice.Output;

export type ListDevicesInput = typeof ListDevices.Input;
export type ListDevicesOutput = typeof ListDevices.Output;

export type UpdateDeviceInput = typeof UpdateDevice.Input;
export type UpdateDeviceOutput = typeof UpdateDevice.Output;

export type DeleteDeviceInput = typeof DeleteDevice.Input;
export type DeleteDeviceOutput = typeof DeleteDevice.Output;

// Default export
export default Endpoints;