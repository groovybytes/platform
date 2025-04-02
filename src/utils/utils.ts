import { Buffer } from "node:buffer";

/**
 * Creates a Promise and exposes its `resolve` and `reject` functions, along with the Promise itself.
 * This utility function is useful when you need to resolve or reject a Promise outside of the Promise's executor function.
 * 
 * The function is generic, allowing you to specify the type of value that the Promise will resolve with.
 * 
 * @typeparam T - The type of the value with which the Promise will be resolved.
 * 
 * @returns An object containing the `resolve` and `reject` functions for the Promise, and the `promise` itself.
 * 
 * @example
 * Here's how you can use `withResolvers` to create a Promise that you might resolve or reject later:
 * 
 * ```ts
 * // Import the `withResolvers` function.
 * import { withResolvers } from './util.ts';
 * 
 * // Create a Promise with exposed resolvers.
 * const { resolve, reject, promise } = withResolvers<string>();
 * 
 * // You can now use `resolve` and `reject` outside of the Promise's executor.
 * // For example, resolving the Promise after 2 seconds.
 * setTimeout(() => {
 *   resolve('Promise resolved after 2 seconds');
 * }, 2000);
 * 
 * // Use the `promise` as you would any other Promise.
 * promise.then(value => {
 *   console.log(value); // Output: 'Promise resolved after 2 seconds'
 * }).catch(reason => {
 *   console.error(reason);
 * });
 * ```
 * 
 * @example
 * You can also reject the Promise if an error occurs:
 * 
 * ```ts
 * const { reject, promise } = withResolvers<number>();
 * 
 * // Assume an error condition is met.
 * reject(new Error('An error occurred'));
 * 
 * // Handle the rejected Promise.
 * promise.catch(error => {
 *   console.error(error.message); // Output: 'An error occurred'
 * });
 * ```
 * 
 * This function is particularly useful in scenarios where the timing or condition for resolving or rejecting a Promise
 * is not immediately known or is dependent on external factors.
 */
export function withResolvers<T>() {
  let resolve: (value: T | PromiseLike<T>) => void = () => { };
  let reject: (reason?: unknown) => void = () => { };
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { resolve, reject, promise } as const;
}

/**
 * Creates a timeout signal that can be used to abort asynchronous operations after a specified duration.
 * This function returns an object containing the timeout ID, the abort signal, and a method to cancel the timeout.
 * 
 * The `AbortController` and `AbortSignal` are part of the DOM API that provide a way to abort web requests.
 * 
 * @remarks
 * The returned `signal` can be passed to fetch or other APIs that support aborting.
 * Calling the `cancel` method will clear the timeout without triggering the abort signal.
 * 
 * For added context, there is now a standard [`AbortSignal.timeout(...)`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) function in the DOM API, 
 * but it does not support canceling the timeout `AbortSignal`.
 * 
 * @param duration - The duration in milliseconds after which the abort signal should be triggered.
 * @returns An object containing the `id` of the timeout, the `signal` for aborting, and a `cancel` method to cancel the timeout.
 * 
 * @example
 * Here's how you can use the `timeout` function to abort a fetch request if it takes too long:
 * 
 * ```ts
 * import { timeout } from './timeout.ts';
 * 
 * // Create a timeout signal that will be triggered after 5000 milliseconds (5 seconds).
 * const { signal, cancel } = timeout(5000);
 * 
 * fetch('https://example.com/data', { signal })
 *   .then(response => response.json())
 *   .then(data => {
 *     console.log('Data fetched successfully:', data);
 *     // Since the fetch was successful, cancel the timeout to prevent unnecessary abort.
 *     cancel();
 *   })
 *   .catch(error => {
 *     if (error.name === 'AbortError') {
 *       console.error('Fetch request was aborted due to timeout.');
 *     } else {
 *       console.error('Fetch request failed:', error);
 *     }
 *   });
 * ```
 * 
 * @example
 * You can also manually cancel the timeout at any time before it triggers:
 * 
 * ```ts
 * const { cancel } = timeout(10000); // 10 seconds
 * 
 * // Cancel the timeout early for any reason.
 * cancel();
 * ```
 */
export function timeout(duration: number) {
  // Create a new instance of AbortController, which can be used to abort an asynchronous task.
  const controller = new AbortController();

  // Use the native `setTimeout` function to schedule the abort signal to be triggered
  // after the specified `duration`. The `setTimeout` function returns an identifier
  // for the timeout, which can be used to cancel the timeout if needed.
  const timeoutId = setTimeout(() => controller.abort(), duration);

  // Return an object containing the timeout identifier, the abort signal, and a `cancel`
  // method that can be used to cancel the timeout without triggering the abort signal.
  return {
    id: timeoutId,
    signal: controller.signal,
    // Define a `cancel` method that clears the timeout using `clearTimeout`.
    // This prevents the abort signal from being triggered if the timeout is no longer needed.
    cancel() {
      clearTimeout(timeoutId);
    }
  } as const; // Use `as const` to indicate that the returned object is a readonly tuple.
}

/**
 * Generates a random hexadecimal string of the specified size.
 * 
 * @param size - The size of the random hexadecimal string to generate.
 * @returns A hexadecimal string representation of the random values.
 * 
 * @example
 * // Generate a random hexadecimal string of size 8
 * const hex8 = generateRandomHex(8);
 * console.log(hex8); // Example output: 'a3f4b2c1d6e7f8a9'
 * 
 * @example
 * // Generate a random hexadecimal string of size 16
 * const hex16 = generateRandomHex(16);
 * console.log(hex16); // Example output: 'd4e5f6a7b8c9d0e1f2g3h4i5j6k7l8m'
 * 
 * @example
 * // Generate a random hexadecimal string of size 32
 * const hex32 = generateRandomHex(32);
 * console.log(hex32); // Example output: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
 */
export function generateRandomHex(size: number): string {
  // Create a new Uint8Array with the specified size
  const uint8arr = new Uint8Array(size);

  // Fill the array with cryptographically secure random values
  crypto.getRandomValues(uint8arr);

  // Convert the random values to a hexadecimal string and return it
  return Buffer.from(uint8arr).toString('hex');
}