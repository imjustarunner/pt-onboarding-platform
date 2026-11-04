import { describe, expect, it } from 'vitest';
import { credentialAllows, filterServiceCodesForCredential } from '../billingRules.service.js';

describe('Colorado credential rules', () => {
  it('keeps community codes for a QBHA and hides psychotherapy', () => {
    expect(credentialAllows('qbha', 'H2014')).toBe(true);
    expect(credentialAllows('qbha', '90837')).toBe(false);
    expect(credentialAllows('qbha', 'H0002')).toBe(false);
  });

  it('lets a bachelor use counseling codes and not codes that start with 9', () => {
    expect(credentialAllows('bachelors', 'H0004')).toBe(true);
    expect(credentialAllows('bachelors', '90837')).toBe(false);
    expect(credentialAllows('bachelors', 'H0002')).toBe(false);
  });

  it('lets an intern or licensed clinician use the catalog except H0002', () => {
    expect(credentialAllows('intern_plus', '90837')).toBe(true);
    expect(credentialAllows('intern_plus', 'H2014')).toBe(true);
    expect(credentialAllows('intern_plus', 'H0002')).toBe(false);
  });

  it('limits an unrecognized credential to the QBHA list', () => {
    const visible = filterServiceCodesForCredential(['H2014', '90837', 'H0002'], 'unknown');
    expect(visible).toEqual(['H2014']);
  });

  it('uses a saved Colorado update and a person exception', () => {
    const overrides = new Map([['bachelors|90837', true], ['intern_plus|H0002', false]]);
    expect(credentialAllows('bachelors', '90837', overrides)).toBe(true);
    const forAneta = filterServiceCodesForCredential(['90834', 'H0002'], 'intern_plus', overrides, ['H0002']);
    const forSomeoneElse = filterServiceCodesForCredential(['90834', 'H0002'], 'intern_plus', overrides, []);
    expect(forAneta).toEqual(['90834', 'H0002']);
    expect(forSomeoneElse).toEqual(['90834']);
  });

  it('adds a granted code when the catalog did not include it', () => {
    expect(filterServiceCodesForCredential([{ code: '90834' }], 'qbha', new Map(), ['H0002'])).toEqual([
      { code: 'H0002', label: 'Behavioral health screening' }
    ]);
  });
});
