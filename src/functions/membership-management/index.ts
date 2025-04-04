// @filename: membership-management/index.ts
import type { EndpointDefinition, TimerDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import CreateMembership from './endpoints/create';
import AcceptInvitation from './endpoints/invitation/accept';
import SendReminder from './endpoints/invitation/remind';
import CleanupFunction from './cron/cleanup';

import DeleteMembership from './endpoints/delete';
import ListMemberships from './endpoints/list';
import GetMembership from './endpoints/get';
import RevokeInvitation from './endpoints/invitation/revoke';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  CreateMembership: {
    name: CreateMembership.Name,
    route: CreateMembership.Route,
    methods: CreateMembership.Methods,
    handler: CreateMembership.Handler,
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

// Also export timer functions (not HTTP endpoints)
export const TimerFunctions: Record<string, TimerDefinition> = {
  CleanupExpiredInvitations: {
    name: CleanupFunction.Name,
    schedule: CleanupFunction.Schedule,
    handler: CleanupFunction.Handler,
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

// Register the timer function
Object.values(TimerFunctions).forEach(timer => {
  // Register the timer trigger to run once a day at 3:00 AM
  app.timer(timer.name, {
    schedule: timer.schedule, // CRON format: second minute hour day month day-of-week
    handler: timer.handler,
    runOnStartup: false     // Don't run immediately when the app starts
  });
});


// Input/Output type definitions
export type CreateMembershipInput = typeof CreateMembership.Input;
export type CreateMembershipOutput = typeof CreateMembership.Output;

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
export default {
  Endpoints,
  TimerFunctions
};