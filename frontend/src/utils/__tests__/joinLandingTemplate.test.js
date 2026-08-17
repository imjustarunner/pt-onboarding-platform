import { describe, expect, it } from 'vitest';
import {
  defaultJoinLayout,
  mergeIntakeStartLayout,
  mergeJoinLayout,
  mergePublicSupportLayout,
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
      { cards: { x: -500, y: 0 }, welcome: { x: 12, y: 8 } },
      { cards: { x: 0, y: 0 }, welcome: { x: 0, y: 0 } }
    );
    expect(out.cards).toEqual({ x: 0, y: 0 });
    expect(out.welcome).toEqual({ x: 12, y: 8 });
  });
});

describe('mergeJoinLayout', () => {
  it('uses the saved ITSCO join layout when nothing is stored yet', () => {
    const layout = mergeJoinLayout(null);
    expect(layout).toEqual(defaultJoinLayout());
    expect(layout.positions.cards).toEqual({ x: 156, y: 18 });
    expect(layout.positions.help).toEqual({ x: 18, y: -342 });
    expect(layout.sizes.logoWidth).toBe(218);
    expect(layout.sizes.lead).toBe(0.91);
  });
  it('does not treat hide as a deleted string', () => {
    const layout = mergeJoinLayout({ hidden: { welcome: true } });
    expect(layout.hidden.welcome).toBe(true);
    expect(layout.hidden.glad).toBe(false);
  });

  it('splits the left rail so logo, tagline, script, and values can move on their own', () => {
    const layout = mergeJoinLayout({
      positions: { brand: { x: 12, y: 8 } }
    });
    expect(layout.positions.logo).toEqual({ x: 12, y: 8 });
    expect(layout.positions.tagline).toEqual({ x: 12, y: 8 });
    expect(layout.positions.script).toEqual({ x: 12, y: 8 });
    expect(layout.positions.values).toEqual({ x: 12, y: 8 });
  });

  it('keeps independently saved rail positions', () => {
    const layout = mergeJoinLayout({
      positions: {
        brand: { x: 12, y: 8 },
        logo: { x: 4, y: 0 },
        tagline: { x: 0, y: 20 }
      }
    });
    expect(layout.positions.logo).toEqual({ x: 4, y: 0 });
    expect(layout.positions.tagline).toEqual({ x: 0, y: 20 });
    expect(layout.positions.script).toEqual({ x: 0, y: 0 });
  });
});

describe('mergeIntakeStartLayout', () => {
  it('widens the previous 860px default card so the start form can sit two-up', () => {
    expect(mergeIntakeStartLayout(null).width).toBe(1080);
    expect(mergeIntakeStartLayout({ width: 860 }).width).toBe(1080);
    expect(mergeIntakeStartLayout({ width: 980 }).width).toBe(980);
  });
});

describe('mergeQuickSidebarSteps', () => {
  it('keeps default guide labels when nothing is saved', () => {
    const steps = mergeQuickSidebarSteps(null);
    expect(steps[0].label).toBe('About You');
    expect(steps.map((s) => s.id)).not.toContain('providers');
    expect(steps).toHaveLength(5);
  });

  it('includes provider preview when requested', () => {
    const steps = mergeQuickSidebarSteps(null, { includeProviders: true });
    expect(steps).toHaveLength(6);
    expect(steps.some((s) => s.id === 'providers')).toBe(true);
  });

  it('collapses a previously saved 7-step who-for guide into About You', () => {
    const steps = mergeQuickSidebarSteps([
      { id: 'who', label: 'Who is this for?' },
      { id: 'basics', label: 'Your details' },
      { id: 'needs', label: 'Needs' },
      { id: 'prefs', label: 'Prefs' },
      { id: 'providers', label: 'Providers' },
      { id: 'consent', label: 'Auth' },
      { id: 'review', label: 'Review' }
    ], { includeProviders: true });
    expect(steps).toHaveLength(6);
    expect(steps[0].id).toBe('about');
    expect(steps[0].label).toBe('Your details');
    expect(steps[1].label).toBe('Needs');
  });
});

describe('mergePublicSupportLayout', () => {
  it('keeps independent positions for each support block', () => {
    const out = mergePublicSupportLayout({
      positions: { login: { x: 12, y: 40 }, billing: { x: -8, y: 18 } },
      sizes: { cardWidth: 1100 }
    });
    expect(out.positions.login).toEqual({ x: 12, y: 40 });
    expect(out.positions.billing).toEqual({ x: -8, y: 18 });
    expect(out.positions.join).toEqual({ x: 22, y: -153 });
    expect(out.sizes.cardWidth).toBe(1100);
  });
});
