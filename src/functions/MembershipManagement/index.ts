// @filename: user-management/membership/index.ts
import type { EndpointDefinition } from '~/types/endpoint';

import { app } from '@azure/functions';

import CreateMembership from './create';
import UpdateMembership from './update';
import DeleteMembership from './delete';
import ListMemberships from './list';
import GetMembership from './get';

import AcceptInvitation from './accept-invitation';
import SendReminder from './send-reminder';
import RevokeInvitation from './revoke-invitation';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  CreateMembership: {
    name: CreateMembership.Name,
    route: CreateMembership.Route,
    methods: CreateMembership.Methods,
    handler: CreateMembership.Handler,
  },
  UpdateMembership: {
    name: UpdateMembership.Name,
    route: UpdateMembership.Route,
    methods: UpdateMembership.Methods,
    handler: UpdateMembership.Handler,
  },
  DeleteMembership: {
    name: DeleteMembership.Name,
    route: DeleteMembership.Route,
    methods: DeleteMembership.Methods,
    handler: DeleteMembership.Handler,
  },
  ListMemberships: {
    name: ListMemberships.Name,
    route: ListMemberships.Route,
    methods: ListMemberships.Methods,
    handler: ListMemberships.Handler,
  },
  GetMembership: {
    name: GetMembership.Name,
    route: GetMembership.Route,
    methods: GetMembership.Methods,
    handler: GetMembership.Handler,
  },
  AcceptInvitation: {
    name: AcceptInvitation.Name,
    route: AcceptInvitation.Route,
    methods: AcceptInvitation.Methods,
    handler: AcceptInvitation.Handler,
  },
  SendReminder: {
    name: SendReminder.Name,
    route: SendReminder.Route,
    methods: SendReminder.Methods,
    handler: SendReminder.Handler,
  },
  RevokeInvitation: {
    name: RevokeInvitation.Name,
    route: RevokeInvitation.Route,
    methods: RevokeInvitation.Methods,
    handler: RevokeInvitation.Handler,
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
export type CreateMembershipInput = typeof CreateMembership.Input;
export type CreateMembershipOutput = typeof CreateMembership.Output;

export type UpdateMembershipInput = typeof UpdateMembership.Input;
export type UpdateMembershipOutput = typeof UpdateMembership.Output;

export type DeleteMembershipInput = typeof DeleteMembership.Input;
export type DeleteMembershipOutput = typeof DeleteMembership.Output;

export type ListMembershipsInput = typeof ListMemberships.Input;
export type ListMembershipsOutput = typeof ListMemberships.Output;

export type GetMembershipInput = typeof GetMembership.Input;
export type GetMembershipOutput = typeof GetMembership.Output;

export type AcceptInvitationInput = typeof AcceptInvitation.Input;
export type AcceptInvitationOutput = typeof AcceptInvitation.Output;

export type SendReminderInput = typeof SendReminder.Input;
export type SendReminderOutput = typeof SendReminder.Output;

export type RevokeInvitationInput = typeof RevokeInvitation.Input;
export type RevokeInvitationOutput = typeof RevokeInvitation.Output;

// Default export
export default Endpoints;