import { safeMarketingHref } from '../utils/marketingPageQuality';

export const riseNav = [
  ['Home', ''], ['About', 'about'], ['Services', 'services'], ['Our Approach', 'approach'],
  ['Resources', 'resources'], ['Join Us', 'join'], ['Contact', 'contact']
];
export const riseAssets = '/assets/rise/';
export const riseConnectionDefaults = {
  enrollmentUrl: '', careersUrl: '', partnerUrl: '', contactUrl: '',
  contactEmail: '', contactPhone: '', contactAddress: '',
  openingMessage: 'We’re preparing to welcome you. Online enrollment and appointment requests are not open yet. Please check back for updates.',
  ctaImageUrl: '', homeMobileImageUrl: ''
};

// Only navigate to an explicit destination configured by the page administrator.
// A public website never creates a tenant or guesses its enrollment slug.
export function riseDestination(value) {
  const href = safeMarketingHref(value);
  return href && (/^\/(?!\/)/.test(href) || /^https:\/\//i.test(href)) ? href : '';
}
export function riseImage(value) { return riseDestination(value); }
export function resolveRiseConnections(branding = {}) {
  const input = branding.riseWebsite || {};
  const result = { ...riseConnectionDefaults, ...input };
  for (const field of ['enrollmentUrl', 'careersUrl', 'partnerUrl', 'contactUrl']) result[field] = riseDestination(input[field]);
  result.emailHref = /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(input.contactEmail || '') ? `mailto:${input.contactEmail}` : '';
  result.phoneHref = /^[+\d][\d ().-]{5,30}$/.test(input.contactPhone || '') ? `tel:${input.contactPhone.replace(/[ ().-]/g, '')}` : '';
  result.openingMessage = String(input.openingMessage || riseConnectionDefaults.openingMessage);
  return result;
}

export const riseHeroes = {
  '': { eyebrow: 'Heal today. Thrive tomorrow.', title: 'Rise in Strength.\nRevive in Purpose.', body: 'In-person and virtual counseling and coaching for individuals ready to build a healthier, more meaningful life.', image: 'mountain-sunrise.webp', note: 'A brighter you\nstarts here.' },
  about: { eyebrow: 'About Rise Revive', title: 'Real People.\nBrighter Tomorrows.', body: 'A welcoming space for people of all backgrounds to explore meaningful change through counseling and coaching.', image: 'forest-banner.webp', note: 'A stronger you\nstarts here.' },
  services: { eyebrow: 'Our services', title: 'Support for a\nStronger Tomorrow.', body: 'Find the kind of support that fits your goals, your life, and your next chapter.', image: 'mountain-sunrise.webp', note: 'Different paths.\nRoom to grow.' },
  approach: { eyebrow: 'Our approach', title: 'Real Support.\nLasting Change.', body: 'We meet you where you are and walk alongside you as you move toward a healthier, more meaningful life. Our approach is collaborative, practical, and grounded in your goals.', image: 'approach-hero.webp', note: 'Progress looks\ndifferent for everyone.' },
  resources: { eyebrow: 'Resources', title: 'Tools for a\nBrighter Tomorrow.', body: 'A thoughtful starting point for understanding your options, preparing for a conversation, and taking your next step.', image: 'resources-hero.webp', note: '' },
  join: { eyebrow: 'Your next chapter', title: 'Let’s Take the\nNext Step Together.', body: 'Whether you’re looking for care, exploring a partnership, or interested in joining our team, find your starting point here.', image: 'forest-banner.webp', note: 'There’s a place\nfor you here.' },
  contact: { eyebrow: 'Connect with Rise Revive', title: 'A Real Conversation.\nA Meaningful Start.', body: 'Explore how to get started and find the right way to connect with our team.', image: 'mountain-sunrise.webp', note: 'Clarity starts\nwith connection.' }
};
export const riseServices = [
  { id: 'individual-therapy', title: 'Individual Therapy', image: 'therapy.webp', alt: 'A conversation in a welcoming counseling room', body: 'Work through life’s challenges and build a stronger you.', detail: 'A space to talk about what matters to you, explore the challenges you’re facing, and work toward goals with a counselor.' },
  { id: 'life-coaching', title: 'Life Coaching', image: 'coaching.webp', alt: 'Balanced stones overlooking a mountain lake at sunrise', body: 'Gain clarity, set goals, and take action.', detail: 'A collaborative focus on your goals, decisions, and next steps. Discuss the kind of support you are looking for so the team can help you explore a suitable service.' },
  { id: 'in-person-care', title: 'In-Person Care', image: 'in-person.webp', alt: 'Sunlight falling across a quiet forest path', body: 'Connect face-to-face in a comfortable, supportive setting.', detail: 'Explore face-to-face support. Location, provider availability, and appointment details will be confirmed before a visit is scheduled.' },
  { id: 'virtual-sessions', title: 'Virtual Sessions', image: 'virtual.webp', alt: 'A laptop and notebook beside a window overlooking the mountains', body: 'Make room for support in your everyday life.', detail: 'Ask about meeting remotely and what you need for your session. The team will confirm whether virtual care is available for your location and needs.' }
];
export const riseValues = [
  ['leaf', 'Individualized Care', 'Support tailored to your goals and life stage.'],
  ['people', 'In-Person & Virtual', 'Explore options that fit into your life.'],
  ['mountain', 'Meaningful Progress', 'Practical tools for lasting change.'],
  ['heart', 'A Welcoming Space', 'You belong here. Exactly as you are.']
];
export const risePrinciples = [
  ['people', 'Person-Centered Care', 'You are more than a diagnosis or a goal. You are a person.'],
  ['leaf', 'Thoughtful Methods', 'Care guided by your needs and professional experience.'],
  ['heart', 'Collaborative Partnership', 'We work with you, with space for your voice.'],
  ['mountain', 'Whole-Person Focus', 'Your life, relationships, strengths, and purpose.']
];
export const riseSteps = [
  ['chat', 'Understand', 'We listen. We learn about you, your goals, challenges, and what matters most.'],
  ['target', 'Create a Plan', 'Together, we identify priorities and agree on a path forward.'],
  ['leaf', 'Take Action', 'Build skills, explore perspectives, and take steps at your own pace.'],
  ['chart', 'Thrive', 'Reflect on progress and adjust your goals as your life evolves.']
];
export const riseResources = [
  { id: 'first-conversation', title: 'Before your first conversation', category: 'Getting started', image: 'therapy.webp', intro: 'You don’t need a perfect explanation to begin. A few notes can help you share what matters.', items: ['What led you to look for support now?', 'What would you like the team to know about you?', 'What questions do you have about the process?', 'What schedule or accessibility needs should you discuss?'] },
  { id: 'find-your-fit', title: 'Questions to help you find your fit', category: 'Exploring support', image: 'coaching.webp', intro: 'Use these questions when discussing services with the team.', items: ['Which services are available for my needs?', 'What experience does the provider bring?', 'How will we agree on goals and review them?', 'What are the fees, payment options, and cancellation terms?'] },
  { id: 'virtual-visit', title: 'Preparing for a virtual visit', category: 'Session planning', image: 'virtual.webp', intro: 'Once your appointment is confirmed, follow the instructions provided by your care team.', items: ['Confirm the appointment time and time zone.', 'Use the session link supplied by the team.', 'Check your camera, microphone, and connection.', 'Choose a private space where you can speak comfortably.'] }
];
