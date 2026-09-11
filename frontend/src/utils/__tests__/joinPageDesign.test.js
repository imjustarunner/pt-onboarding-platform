import { describe, it, expect } from 'vitest';
import { createJoinDesign, normalizeJoinDesign, resolveJoinPresentation, joinCards, joinDesignIssues } from '../joinPageDesign';
import { mergeJoinLayout } from '../joinLandingTemplate';
describe('responsive Join design', () => {
  it('keeps desktop, tablet, and mobile layout and copy independent through serialization', () => {
    const layout = { design: createJoinDesign() };
    layout.design.views.mobile.copy.welcomeTitle = 'Mobile welcome';
    layout.design.views.mobile.sizes.welcome = 2.1;
    layout.design.views.mobile.hidden.script = true;
    layout.design.views.mobile.order.main = ['welcome', 'cards', 'glad', 'lead'];
    layout.design.views.tablet.sizes.welcome = 3.1;
    const saved = JSON.parse(JSON.stringify(mergeJoinLayout(layout)));
    const config = { agency: { name: 'Clinic' }, copy: { welcomeTitle: 'Shared welcome', layout: saved } };
    expect(resolveJoinPresentation(config, 390).copy.welcomeTitle).toBe('Mobile welcome');
    expect(resolveJoinPresentation(config, 390).view.hidden.script).toBe(true);
    expect(resolveJoinPresentation(config, 390).view.order.main[1]).toBe('cards');
    expect(resolveJoinPresentation(config, 1024).view.sizes.welcome).toBe(3.1);
    expect(resolveJoinPresentation(config, 1440).copy.welcomeTitle).toBe('Shared welcome');
    expect(resolveJoinPresentation(config, 1440).view.hidden.script).toBe(false);
  });
  it('does not restore deliberately empty optional copy or bullets', () => {
    const layout = { design: createJoinDesign() }; layout.design.views.mobile.copy.quickBullets = [];
    const copy = resolveJoinPresentation({ copy: { welcomeGlad: '', quickDescription: '', layout } }, 390).copy;
    expect(copy.welcomeGlad).toBe('');
    expect(joinCards(copy, { description: 'fallback', bullets: ['fallback'] }).quick.description).toBe('');
    expect(joinCards(copy, { bullets: ['fallback'] }).quick.bullets).toEqual([]);
  });
  it('rejects unsafe image URLs and normalizes malformed controls and element order', () => {
    const layout = { design: { backgroundUrl: 'javascript:alert(1)', views: { mobile: { sizes: { logoWidth: -40 }, positions: { welcome: { x: 90000, y: 'bad' } }, order: { main: ['cards', 'cards', 'injected'] }, hidden: { cards: true } } } } };
    const design = normalizeJoinDesign(layout);
    expect(design.backgroundUrl).toBe(''); expect(design.views.mobile.sizes.logoWidth).toBe(48);
    expect(design.views.mobile.positions.welcome).toEqual({ x: 200, y: 0 });
    expect(design.views.mobile.order.main).toEqual(['cards', 'welcome', 'glad', 'lead']);
    expect(design.views.mobile.hidden.cards).toBe(false);
  });
  it('prevents hiding the only available intake action on one view', () => {
    const copy = { welcomeTitle: 'Welcome', quickTitle: 'Interest', quickCta: 'Start', fullTitle: 'Enrollment', fullCta: 'Start', layout: { design: createJoinDesign() } };
    copy.layout.design.views.mobile.hidden.quick = true;
    expect(joinDesignIssues(copy, false)).toContain('Mobile: keep at least one available intake choice visible.');
    expect(joinDesignIssues(copy, true)).toEqual([]);
  });
});

describe('custom Join elements', () => {
  it('preserves custom element order, device visibility, and text after a save round trip', () => {
    const layout = { design: createJoinDesign() };
    layout.design.elements = [{ id: 'custom_intro', type: 'text', label: 'Our approach', group: 'main' }];
    layout.design.views.mobile.order.main.push('custom_intro');
    layout.design.views.mobile.hidden.custom_intro = true;
    const config = { copy: { custom_introTitle: 'Our approach', custom_introBody: 'A real description.', layout: JSON.parse(JSON.stringify(mergeJoinLayout(layout))) } };
    expect(resolveJoinPresentation(config, 1440).view.order.main).toContain('custom_intro');
    expect(resolveJoinPresentation(config, 390).view.hidden.custom_intro).toBe(true);
    expect(resolveJoinPresentation(config, 1440).copy.custom_introTitle).toBe('Our approach');
  });
  it('requires real content and destinations for newly added elements', () => {
    const copy = { welcomeTitle: 'Welcome', quickTitle: 'Start', quickCta: 'Start', layout: { design: { elements: [{ id: 'custom_action', type: 'link', label: 'Learn more', group: 'main' }] } } };
    expect(joinDesignIssues(copy, false)).toContain('Mobile: Learn more needs link text and a valid destination.');
    copy.custom_actionLabel = 'Learn more'; copy.custom_actionHref = '/p/tisi';
    expect(joinDesignIssues(copy, false)).toEqual([]);
  });
});
