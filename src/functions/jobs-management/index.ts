// @filename: job-management/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import CreateJob from './endpoints/create';
import GetJob from './endpoints/create';
import ListJobs from './endpoints/create';

import CancelJob from './endpoints/cancel';
import GetJobStatus from './endpoints/status';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  CreateJob: {
    name: CreateJob.Name,
    route: CreateJob.Route,
    methods: CreateJob.Methods,
    handler: CreateJob.Handler,
  },
  GetJob: {
    name: GetJob.Name,
    route: GetJob.Route,
    methods: GetJob.Methods,
    handler: GetJob.Handler,
  },
  ListJobs: {
    name: ListJobs.Name,
    route: ListJobs.Route,
    methods: ListJobs.Methods,
    handler: ListJobs.Handler,
  },
  CancelJob: {
    name: CancelJob.Name,
    route: CancelJob.Route,
    methods: CancelJob.Methods,
    handler: CancelJob.Handler,
  },
  GetJobStatus: {
    name: GetJobStatus.Name,
    route: GetJobStatus.Route,
    methods: GetJobStatus.Methods,
    handler: GetJobStatus.Handler,
  },
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
export type CreateJobInput = typeof CreateJob.Input;
export type CreateJobOutput = typeof CreateJob.Output;

export type GetJobInput = typeof GetJob.Input;
export type GetJobOutput = typeof GetJob.Output;

export type ListJobsInput = typeof ListJobs.Input;
export type ListJobsOutput = typeof ListJobs.Output;

export type CancelJobInput = typeof CancelJob.Input;
export type CancelJobOutput = typeof CancelJob.Output;

export type GetJobStatusInput = typeof GetJobStatus.Input;
export type GetJobStatusOutput = typeof GetJobStatus.Output;

// Default export
export default Endpoints;





