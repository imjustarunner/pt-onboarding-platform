import { describe, expect, it } from 'vitest';
import { participantsLikelyIncludeOthers } from '../noteAidSessionQueue.js';

describe('participantsLikelyIncludeOthers', () => {
  const familyDiscussion = `
    Client and clinician processed a continuation of what they built on last session.
    The client processed the upcoming changes that her brother is going to endure as he has
    been removed from his father's home. The client processed his interactions and how they
    continue to cause distress in the household and now this is the third brother that has been
    arrested. The client is now in some type of foster care, and the mother won't take him.
    The client expressed significant distress regarding the unknown nature of this sibling's
    situation. The client also processed for other brothers who one is incarcerated.
  `;

  it('does not flag family discussed in session when client only attended', () => {
    expect(participantsLikelyIncludeOthers(familyDiscussion)).toBe(false);
  });

  it('flags explicit presence language', () => {
    expect(participantsLikelyIncludeOthers('Mother was present in the session.')).toBe(true);
    expect(participantsLikelyIncludeOthers('Client accompanied by her father.')).toBe(true);
    expect(participantsLikelyIncludeOthers('Session included the client\'s mother.')).toBe(true);
  });
});
