// @filename: query-api/index.ts
import type { EndpointDefinition } from '~/types/definitions';

import { app } from '@azure/functions';

import ExecuteQuery from './endpoints/execute';
import SavedQueries from './endpoints/queries/list';
import GetSavedQuery from './endpoints/queries/get';
import SaveQuery from './endpoints/queries/save';
// import DeleteSavedQuery from './endpoints/queries/delete';
// import QueryStatus from './endpoints/status';

// Create the Endpoints object
export const Endpoints: Record<string, EndpointDefinition> = {
  ExecuteQuery: {
    name: ExecuteQuery.Name,
    route: ExecuteQuery.Route,
    methods: ExecuteQuery.Methods,
    handler: ExecuteQuery.Handler,
  },
  SavedQueries: {
    name: SavedQueries.Name,
    route: SavedQueries.Route,
    methods: SavedQueries.Methods,
    handler: SavedQueries.Handler,
  },
  GetSavedQuery: {
    name: GetSavedQuery.Name,
    route: GetSavedQuery.Route,
    methods: GetSavedQuery.Methods,
    handler: GetSavedQuery.Handler,
  },
  SaveQuery: {
    name: SaveQuery.Name,
    route: SaveQuery.Route,
    methods: SaveQuery.Methods,
    handler: SaveQuery.Handler,
  },
  // DeleteSavedQuery: {
  //   name: DeleteSavedQuery.Name,
  //   route: DeleteSavedQuery.Route,
  //   methods: DeleteSavedQuery.Methods,
  //   handler: DeleteSavedQuery.Handler,
  // },
  // QueryStatus: {
  //   name: QueryStatus.Name,
  //   route: QueryStatus.Route,
  //   methods: QueryStatus.Methods,
  //   handler: QueryStatus.Handler,
  // }
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
export type ExecuteQueryInput = typeof ExecuteQuery.Input;
export type ExecuteQueryOutput = typeof ExecuteQuery.Output;

export type SavedQueriesInput = typeof SavedQueries.Input;
export type SavedQueriesOutput = typeof SavedQueries.Output;

export type GetSavedQueryInput = typeof GetSavedQuery.Input;
export type GetSavedQueryOutput = typeof GetSavedQuery.Output;

export type SaveQueryInput = typeof SaveQuery.Input;
export type SaveQueryOutput = typeof SaveQuery.Output;

// export type DeleteSavedQueryInput = typeof DeleteSavedQuery.Input;
// export type DeleteSavedQueryOutput = typeof DeleteSavedQuery.Output;

// export type QueryStatusInput = typeof QueryStatus.Input;
// export type QueryStatusOutput = typeof QueryStatus.Output;

// Default export
export default Endpoints;