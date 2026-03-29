const providerName = String(process.env.SSC_MESSAGE_BRIDGE_PROVIDER || 'in_app').toLowerCase();

const inAppProvider = {
  async postMessageToChannel(_payload) {
    return { delivered: true, provider: 'in_app', mode: 'native' };
  },
  async ingestExternalMessage(_payload) {
    return { accepted: false, provider: 'in_app', reason: 'external ingestion disabled for in_app provider' };
  },
  mapExternalAuthor(author) {
    return { displayName: author?.name || 'External User', externalId: author?.id || null };
  }
};

const whatsappProvider = {
  async postMessageToChannel(_payload) {
    const enabled = String(process.env.WHATSAPP_BRIDGE_ENABLED || '').trim() === '1';
    if (!enabled) return { delivered: false, provider: 'whatsapp', reason: 'bridge disabled by WHATSAPP_BRIDGE_ENABLED' };
    // Scaffold only: posting hook intentionally does not send until WhatsApp API contract is finalized.
    return { delivered: false, provider: 'whatsapp', reason: 'scaffold mode: outbound adapter not activated yet' };
  },
  async ingestExternalMessage(payload) {
    const enabled = String(process.env.WHATSAPP_BRIDGE_ENABLED || '').trim() === '1';
    if (!enabled) return { accepted: false, provider: 'whatsapp', reason: 'bridge disabled by WHATSAPP_BRIDGE_ENABLED' };
    return { accepted: false, provider: 'whatsapp', reason: 'scaffold mode: inbound adapter not activated yet', payload };
  },
  mapExternalAuthor(author) {
    return {
      displayName: author?.profileName || author?.phoneNumber || 'WhatsApp User',
      externalId: author?.waId || author?.phoneNumber || null
    };
  }
};

const provider = providerName === 'whatsapp' ? whatsappProvider : inAppProvider;

export const challengeMessageBridge = {
  providerName,
  postMessageToChannel: (payload) => provider.postMessageToChannel(payload),
  ingestExternalMessage: (payload) => provider.ingestExternalMessage(payload),
  mapExternalAuthor: (author) => provider.mapExternalAuthor(author)
};
