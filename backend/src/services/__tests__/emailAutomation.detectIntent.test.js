import { describe, it, expect } from 'vitest';
import { detectIntent } from '../emailAutomation.service.js';

describe('emailAutomation.detectIntent', () => {
  it('detects cancellation language', () => {
    const r = detectIntent('Please cancel tomorrow', 'We cannot make the appointment');
    expect(r?.kind).toBe('cancellation');
    expect(r.confidence).toBeGreaterThan(0.5);
  });

  it('detects termination language', () => {
    const r = detectIntent('Ending services', 'We want to terminate care');
    expect(r?.kind).toBe('termination');
  });

  it('returns null for unrelated mail', () => {
    expect(detectIntent('Hello', 'Looking forward to session')).toBeNull();
  });
});
