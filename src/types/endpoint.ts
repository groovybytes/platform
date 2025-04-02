import type { HttpHandler, HttpMethod } from "@azure/functions";

// Define endpoints structure
export interface EndpointDefinition {
  name: string;
  route: string;
  methods: HttpMethod[];
  handler: HttpHandler;
}