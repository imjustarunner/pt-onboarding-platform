import { describe, expect, it } from 'vitest';
import {
  mergeJoinLayout,
  mergeQuickSidebarSteps,
  restoreJoinWelcomeCopy,
  sanitizeJoinPositions
} from '../joinLandingTemplate.js';

describe('restoreJoinWelcomeCopy', () => {
  it('fills blank welcome lines with the original ITSCO wording', () => {
    const out = restoreJoinWelcomeCopy({
      welcomeTitle: '',
      welcomeGlad: '   ',
      welcomeLead: ''
    }, 'ITSCO');
    expect(out.welcomeTitle).toBe('Welcome to ITSCO!');
    expect(out.welcomeGlad).toBe("We're so glad you're here.");
    expect(out.welcomeLead).toMatch(/Choose the type of intake that works best for you with ITSCO/);
  });

  it('keeps custom welcome text when it is present', () => {
    const out = restoreJoinWelcomeCopy({ welcomeTitle: 'Hello there' }, 'ITSCO');
    expect(out.welcomeTitle).toBe('Hello there');
  });
});

describe('sanitizeJoinPositions', () => {
  it('drops off-canvas saved offsets', () => {
    const out = sanitizeJoinPositions(
      { cards: { x: -180, y: 0 }, welcome: { x: 12, y: 8 } },
      { cards: { x: 0, y: 0 }, welcome: { x: 0, y: 0 } }
    );
    expect(out.cards).toEqual({ x: 0, y: 0 });
    expect(out.welcome).toEqual({ x: 12, y: 8 });
  });
});

describe('mergeJoinLayout', () => {
  it('does not treat hide as a deleted string', () => {
    const layout = mergeJoinLayout({ hidden: { welcome: true } });
    expect(layout.hidden.welcome).toBe(true);
    expect(layout.hidden.glad).toBe(false);
  });
});

describe('mergeQuickSidebarSteps', () => {
  it('keeps default guide labels when nothing is saved', () => {
    const steps = mergeQuickSidebarSteps(null);
    expect(steps[0].label).toBe('Who is this for?');
    expect(steps).toHaveLength(7);
  });
});
