// @filename: onboarding/orchestrators/index.ts
import type { OrchestratorDefinition } from '~/types/definitions';
import * as df from 'durable-functions';

// Import all orchestrator definitions
import OnboardingOrchestrator from './onboarding';

// Create the Orchestrators object
export const Orchestrators: Record<string, OrchestratorDefinition> = {
  OnboardingOrchestrator: {
    name: OnboardingOrchestrator.Name,
    handler: OnboardingOrchestrator.Handler,
    input: OnboardingOrchestrator.Input,
    output: OnboardingOrchestrator.Output,
  }
};

// Register all orchestration functions
Object.values(Orchestrators).forEach(orchestrator => {
  df.app.orchestration(orchestrator.name, orchestrator.handler);
});

// Input/Output type definitions
export type OnboardingOrchestratorInput = typeof OnboardingOrchestrator.Input;
export type OnboardingOrchestratorOutput = typeof OnboardingOrchestrator.Output;

// Default export
export default Orchestrators;