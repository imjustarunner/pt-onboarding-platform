export function pollDeadline(event) {
  let config = event.votingConfig || event.voting_config_json || {};
  if (typeof config === 'string') { try { config = JSON.parse(config); } catch { config = {}; } }
  return config.closesAt || event.endsAt || event.ends_at || null;
}

export function pollClosedAt(event, now = Date.now()) {
  if (event.votingClosedAt || event.voting_closed_at) return event.votingClosedAt || event.voting_closed_at;
  const value = pollDeadline(event), deadline = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(deadline) && deadline <= now ? value : null;
}

export function participantPollResponse(response, options) {
  if (!response) return null;
  const key = response.response_key || null;
  const option = options.find(option => option.key === key);
  return {
    key, original: response.response_body || '',
    label: key === '__UNCLASSIFIED__' ? response.response_body : response.response_label || option?.label || response.response_body,
    bucketKey: response.bucketKey, excluded: response.excluded,
    source: response.source || null, receivedAt: response.received_at || null
  };
}

export function sharedPollResultsAvailable(config, closedAt) {
  return config.shareResults !== false && (!!closedAt || config.resultsVisibility === 'live');
}
