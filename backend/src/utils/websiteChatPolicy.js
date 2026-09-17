// Deliberately whole-word based so ordinary words such as “class” are untouched.
const profanity = /\b(?:fuck(?:ing|ed|er|ers|s)?|motherfuck(?:er|ers|ing)?|shit(?:ty|ting|s|head)?|bullshit|bitch(?:es|ing)?|asshole(?:s)?|bastard(?:s)?|cunt(?:s)?|dick(?:head|s)?|piss(?:ed|ing)?|damn(?:ed)?|crap)\b/gi;
export function moderateWebsiteChat(value) {
 const original=String(value || '');
 const body=original.replace(profanity,'****');
 return {body,filtered:body!==original};
}
export function websitePagePath(value) {
 // No query strings, fragments, full URLs, or form contents in visitor presence.
 const path=String(value || '/').split(/[?#]/)[0];
 return path.startsWith('/')&&!path.startsWith('//')?path.slice(0,500):'/';
}
export const standardsNotice = 'This chat has been flagged for Community Standards. We are here to help and ask that everyone communicate respectfully. If the conversation becomes unproductive or abusive, we may end it. Live Chat is for quick answers. For detailed concerns or an escalation, please submit a ticket so our full support team can follow up.';
