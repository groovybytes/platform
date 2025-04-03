// @filename: workspace-management/index.ts
import type { EndpointDefinition } from '~/types/endpoint';

import { app } from '@azure/functions';

import DeleteWorkspace from './delete';
import CreateWorkspace from './create';
import UpdateWorkspace from './update';
import ListWorkspace from './list';
import GetWorkspace from './get';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  CreateWorkspace: {
    name: CreateWorkspace.Name,
    route: CreateWorkspace.Route,
    methods: CreateWorkspace.Methods,
    handler: CreateWorkspace.Handler,
  },
  GetWorkspace: {
    name: GetWorkspace.Name,
    route: GetWorkspace.Route,
    methods: GetWorkspace.Methods,
    handler: GetWorkspace.Handler,
  },
  ListWorkspaces: {
    name: ListWorkspace.Name,
    route: ListWorkspace.Route,
    methods: ListWorkspace.Methods,
    handler: ListWorkspace.Handler,
  },
  UpdateWorkspace: {
    name: UpdateWorkspace.Name,
    route: UpdateWorkspace.Route,
    methods: UpdateWorkspace.Methods,
    handler: UpdateWorkspace.Handler,
  },
  DeleteWorkspace: {
    name: DeleteWorkspace.Name,
    route: DeleteWorkspace.Route,
    methods: DeleteWorkspace.Methods,
    handler: DeleteWorkspace.Handler,
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
export type CreateWorkspaceInput = typeof CreateWorkspace.Input;
export type CreateWorkspaceOutput = typeof CreateWorkspace.Output;

export type GetWorkspaceInput = typeof GetWorkspace.Input;
export type GetWorkspaceOutput = typeof GetWorkspace.Output;

export type ListWorkspacesInput = typeof ListWorkspace.Input;
export type ListWorkspacesOutput = typeof ListWorkspace.Output;

export type UpdateWorkspaceInput = typeof UpdateWorkspace.Input;
export type UpdateWorkspaceOutput = typeof UpdateWorkspace.Output;

export type DeleteWorkspaceInput = typeof DeleteWorkspace.Input;
export type DeleteWorkspaceOutput = typeof DeleteWorkspace.Output;

// Default export
export default Endpoints;