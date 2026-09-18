import { AsyncLocalStorage } from 'node:async_hooks';

// Carries only the current request object inside its own asynchronous execution
// chain. Background work after response completion is not attributed as a read.
export const evidenceRequestContext = new AsyncLocalStorage();
