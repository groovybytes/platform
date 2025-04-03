import type { HttpHandler, HttpMethod } from "@azure/functions";
import type { OrchestrationHandler, ActivityHandler } from 'durable-functions';

// Define endpoints structure
export interface EndpointDefinition {
  name: string;
  route: string;
  methods: HttpMethod[];
  handler: HttpHandler;
}

/**
 * Definition of an orchestrator function
 */
export interface OrchestratorDefinition<TInput = any, TOutput = any> {
  name: string;
  handler: OrchestrationHandler;
  input: TInput;
  output: TOutput;
}

/**
 * Definition of an activity function
 */
export interface ActivityDefinition<TInput = any, TOutput = any> {
  name: string;
  handler: ActivityHandler;
  input: TInput;
  output: TOutput;
}