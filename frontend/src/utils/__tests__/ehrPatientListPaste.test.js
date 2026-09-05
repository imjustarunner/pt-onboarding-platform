import { describe, expect, it } from 'vitest';
import {
  normalizeEhrDob,
  normalizeEhrPhone,
  parseEhrPatientListPaste
} from '../ehrPatientListPaste.js';

const SAMPLE = `Patient Name
DOB
Phone Number	
Last Appt
Next Appt
Payer
Clinicians
Sheldon Baron	12/11/1982	(218) 556-0827	8/27/2026	9/24/2026		MiMe	
3
Jakai Buice	6/28/2014	(719) 491-4104	8/29/2026	9/12/2026	Colorado Community Health Alliance	MiMe	
1
Frankie Eschberger	7/17/2014	(719) 229-2815	8/29/2026	9/8/2026	Colorado Community Health Alliance	MiMe	
4
Trevor Reynolds	10/14/1997		8/27/2026	9/10/2026		MiMe	
9
Eric Ruacho	2/9/1997	(719) 217-9755	8/30/2026	
None
MiMe	
2`;

describe('normalizeEhrDob / phone', () => {
  it('normalizes DOB and phone', () => {
    expect(normalizeEhrDob('2/9/1997')).toBe('1997-02-09');
    expect(normalizeEhrDob('12/11/1982')).toBe('1982-12-11');
    expect(normalizeEhrPhone('(218) 556-0827')).toBe('(218) 556-0827');
    expect(normalizeEhrPhone('7194914104')).toBe('(719) 491-4104');
  });
});

describe('parseEhrPatientListPaste', () => {
  it('parses the TherapyNotes-style sample and skips reminders/clinicians', () => {
    const { items, skipped } = parseEhrPatientListPaste(SAMPLE);
    expect(items.map((i) => i.fullName)).toEqual([
      'Sheldon Baron',
      'Jakai Buice',
      'Frankie Eschberger',
      'Trevor Reynolds',
      'Eric Ruacho'
    ]);
    expect(items[0]).toMatchObject({
      dateOfBirth: '1982-12-11',
      phone: '(218) 556-0827'
    });
    expect(items[3]).toMatchObject({
      fullName: 'Trevor Reynolds',
      dateOfBirth: '1997-10-14',
      phone: null
    });
    expect(items[4]).toMatchObject({
      fullName: 'Eric Ruacho',
      dateOfBirth: '1997-02-09',
      phone: '(719) 217-9755'
    });
    expect(skipped.some((s) => s.reason === 'noise' && s.line === '3')).toBe(true);
    expect(skipped.some((s) => s.line === 'MiMe')).toBe(true);
    expect(skipped.some((s) => s.line === 'None')).toBe(true);
  });

  it('dedupes identical name+DOB rows', () => {
    const text = `Ann Smith	1/2/2000	(555) 111-2222
Ann Smith	1/2/2000	(555) 111-2222`;
    const { items, skipped } = parseEhrPatientListPaste(text);
    expect(items.length).toBe(1);
    expect(skipped.some((s) => s.reason === 'duplicate')).toBe(true);
  });
});
