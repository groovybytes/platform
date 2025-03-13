import type { OrchestrationContext } from 'durable-functions';
import * as df from 'durable-functions';

/**
 * Options for waiting for an external event with retries
 */
export interface WaitForEventOptions<T, K> {
  /** Name of the external event to wait for */
  eventName: string;

  /** 
   * Retry options for the wait operation
   * Uses the standard df.RetryOptions from durable-functions
   */
  retryOptions?: df.RetryOptions;

  /** 
   * Activity to call after each timeout/retry
   * If not provided, no activity will be called
   */
  onRetryActivity?: {
    /** Name of the activity function to call */
    name: string;

    /** 
     * Function to prepare input for the activity 
     * Receives the original input, current retry count, and max retries
     */
    getInput: (input: T, retryCount: number, maxRetries: number) => any;
  };

  /** 
   * Activity to call if all retries are exhausted 
   * If not provided, no activity will be called
   */
  onAbandonedActivity?: {
    /** Name of the activity function to call */
    name: string;

    /** 
     * Function to prepare input for the activity 
     * Receives the original input and max retries
     */
    getInput: (input: T, maxRetries: number) => any;
  };

  /** 
   * Original input passed to the orchestrator 
   * Used for activity input preparation
   */
  originalInput: T;
}

/**
 * Result of waiting for an event with retries
 */
export interface WaitForEventResult<K> {
  /** Whether the event was received successfully */
  succeeded: boolean;

  /** The event data if succeeded, null otherwise */
  eventData: K | null;

  /** Number of retry attempts made */
  retryCount: number;

  /** Status of the wait operation */
  status: 'completed' | 'abandoned';
}

/**
 * Waits for an external event with multiple retry attempts
 * 
 * @param context - The orchestration context
 * @param options - Configuration options for the wait operation
 * @returns A result object containing success status and event data
 */
export function* waitForEventWithRetries<T, K>(
  context: OrchestrationContext,
  options: WaitForEventOptions<T, K>
): Generator<df.Task, WaitForEventResult<K>, any> {
  const {
    eventName,
    retryOptions = new df.RetryOptions(24 * 60 * 60 * 1000, 5), // Default: 24 hours timeout, 5 retries
    onRetryActivity,
    onAbandonedActivity,
    originalInput
  } = options;

  // Extract retry parameters from the retry options
  const maxRetries = retryOptions.maxNumberOfAttempts || 5;
  const timeoutPerAttemptMs = retryOptions.firstRetryIntervalInMilliseconds;

  let eventData: K | null = null;
  let retryCount = 0;

  while (retryCount < maxRetries && !eventData) {
    // Set timeout for this attempt
    const now = context.df.currentUtcDateTime.getTime();
    const expiration = new Date(now + timeoutPerAttemptMs);

    // Create timer and event tasks
    const timeoutTask = context.df.createTimer(expiration);
    const eventTask = context.df.waitForExternalEvent(eventName);

    // Wait for either the event or the timeout, whichever comes first
    const winner = yield context.df.Task.any([timeoutTask, eventTask]);

    // Cancel the timer if the event came first
    if (!timeoutTask.isCompleted) {
      timeoutTask.cancel();
    }

    if (winner === eventTask) {
      // Event received successfully
      eventData = eventTask.result as K;
    } else {
      // Timeout occurred
      retryCount++;

      // Call the retry activity if provided and we haven't exceeded max retries
      if (onRetryActivity && retryCount < maxRetries) {
        yield context.df.callActivity(
          onRetryActivity.name,
          onRetryActivity.getInput(originalInput, retryCount, maxRetries)
        );
      }
    }
  }

  // If we exited the loop without event data, all retries were exhausted
  if (!eventData) {
    // Call the abandoned activity if provided
    if (onAbandonedActivity) {
      yield context.df.callActivity(
        onAbandonedActivity.name,
        onAbandonedActivity.getInput(originalInput, maxRetries)
      );
    }

    return {
      succeeded: false,
      eventData: null,
      retryCount,
      status: 'abandoned'
    };
  }

  return {
    succeeded: true,
    eventData,
    retryCount,
    status: 'completed'
  };
}