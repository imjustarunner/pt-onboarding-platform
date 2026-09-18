import { describe, it, expect } from 'vitest';
import { bootstrapResponse } from '../bootstrapHealth.js';

describe('security prerequisite readiness gate', () => {
  it('keeps readiness unavailable during startup while retaining liveness', () => {
    expect(bootstrapResponse('/readyz?probe=1').statusCode).toBe(503);
    expect(bootstrapResponse('/healthz').statusCode).toBe(200);
    expect(bootstrapResponse('/api/clients').statusCode).toBe(503);
  });
  it('refuses readiness after a failed startup without exposing the error', () => {
    const result = bootstrapResponse('/readyz', { loadError: 'private database error' });
    expect(result.statusCode).toBe(503);
    expect(result.body.phase).toBe('degraded');
    expect(JSON.stringify(result)).not.toContain('private database error');
    expect(bootstrapResponse('/readyz', { appLoaded: true, loadError: 'failure' }).statusCode).toBe(503);
  });
  it('permits readiness only once loading completes successfully', () => {
    expect(bootstrapResponse('/readyz', { appLoaded: true })).toMatchObject({
      statusCode: 200, body: { status: 'ok', phase: 'ready' }
    });
  });
});
