// @filename: user-management/users/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import GetCurrentUser from './endpoints/me/get';
import UpdateCurrentUser from './endpoints/me/update';

import GetUser from './endpoints/get';
import ListUsers from './endpoints/list';
import UpdateUser from './endpoints/update';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  GetCurrentUser: {
    name: GetCurrentUser.Name,
    route: GetCurrentUser.Route,
    methods: GetCurrentUser.Methods,
    handler: GetCurrentUser.Handler,
  },
  UpdateCurrentUser: {
    name: UpdateCurrentUser.Name,
    route: UpdateCurrentUser.Route,
    methods: UpdateCurrentUser.Methods,
    handler: UpdateCurrentUser.Handler,
  },
  GetUser: {
    name: GetUser.Name,
    route: GetUser.Route,
    methods: GetUser.Methods,
    handler: GetUser.Handler,
  },
  ListUsers: {
    name: ListUsers.Name,
    route: ListUsers.Route,
    methods: ListUsers.Methods,
    handler: ListUsers.Handler,
  },
  UpdateUser: {
    name: UpdateUser.Name,
    route: UpdateUser.Route,
    methods: UpdateUser.Methods,
    handler: UpdateUser.Handler,
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
export type GetCurrentUserInput = typeof GetCurrentUser.Input;
export type GetCurrentUserOutput = typeof GetCurrentUser.Output;

export type UpdateCurrentUserInput = typeof UpdateCurrentUser.Input;
export type UpdateCurrentUserOutput = typeof UpdateCurrentUser.Output;

export type GetUserInput = typeof GetUser.Input;
export type GetUserOutput = typeof GetUser.Output;

export type ListUsersInput = typeof ListUsers.Input;
export type ListUsersOutput = typeof ListUsers.Output;

export type UpdateUserInput = typeof UpdateUser.Input;
export type UpdateUserOutput = typeof UpdateUser.Output;

// Default export
export default Endpoints;