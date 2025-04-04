// @filename: functions/AssetManagement/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import InitiateUpload from './endpoints/initiate-upload';
import CompleteUpload from './endpoints/complete-upload';
import GetAsset from './endpoints/get';
import ListAssets from './endpoints/list';
import UpdateAsset from './endpoints/update';
import DeleteAsset from './endpoints/delete';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  InitiateUpload: {
    name: InitiateUpload.Name,
    route: InitiateUpload.Route,
    methods: InitiateUpload.Methods,
    handler: InitiateUpload.Handler,
  },
  CompleteUpload: {
    name: CompleteUpload.Name,
    route: CompleteUpload.Route,
    methods: CompleteUpload.Methods,
    handler: CompleteUpload.Handler,
  },
  GetAsset: {
    name: GetAsset.Name,
    route: GetAsset.Route,
    methods: GetAsset.Methods,
    handler: GetAsset.Handler,
  },
  ListAssets: {
    name: ListAssets.Name,
    route: ListAssets.Route,
    methods: ListAssets.Methods,
    handler: ListAssets.Handler,
  },
  UpdateAsset: {
    name: UpdateAsset.Name,
    route: UpdateAsset.Route,
    methods: UpdateAsset.Methods,
    handler: UpdateAsset.Handler,
  },
  DeleteAsset: {
    name: DeleteAsset.Name,
    route: DeleteAsset.Route,
    methods: DeleteAsset.Methods,
    handler: DeleteAsset.Handler,
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
export type InitiateUploadInput = typeof InitiateUpload.Input;
export type InitiateUploadOutput = typeof InitiateUpload.Output;

export type CompleteUploadInput = typeof CompleteUpload.Input;
export type CompleteUploadOutput = typeof CompleteUpload.Output;

export type GetAssetInput = typeof GetAsset.Input;
export type GetAssetOutput = typeof GetAsset.Output;

export type ListAssetsInput = typeof ListAssets.Input;
export type ListAssetsOutput = typeof ListAssets.Output;

export type UpdateAssetInput = typeof UpdateAsset.Input;
export type UpdateAssetOutput = typeof UpdateAsset.Output;

export type DeleteAssetInput = typeof DeleteAsset.Input;
export type DeleteAssetOutput = typeof DeleteAsset.Output;

// Default export
export default Endpoints;