/**
 * Help / capability list for Email App Assistant.
 */

export const helpIntents = [
  {
    key: 'help',
    label: 'Help',
    roles: 'any_member',
    examples: ['help', 'what can you do?', 'commands'],
    match: (text) => {
      const s = String(text || '').toLowerCase().trim();
      if (/^(help|commands|\?|hi|hello)\b/.test(s)) return {};
      if (/\bwhat\s+can\s+you\s+(do|answer)\b/.test(s)) return {};
      if (/\bhow\s+(do|does)\s+(this|email\s+app)\b/.test(s)) return {};
      return null;
    },
    handle: async (ctx) => {
      // Dynamic import avoids circular dependency with registry.js
      const { listIntentsForRole } = await import('../registry.js');
      const intents = listIntentsForRole(ctx.isPrivileged);
      const lines = [
        `Hi — I am the ${ctx.agency?.name || 'tenant'} App email assistant.`,
        'Ask from your approved account email. Replies come from this mailbox.',
        '',
        'You can ask:'
      ];
      for (const intent of intents) {
        if (intent.key === 'help') continue;
        lines.push(`• ${intent.label}`);
        for (const ex of (intent.examples || []).slice(0, 2)) {
          lines.push(`    e.g. ${ex}`);
        }
      }
      lines.push('');
      lines.push('Presence / planned-out status also works via time@plottwistco.com.');
      return { text: lines.join('\n'), clearSession: true };
    }
  }
];
