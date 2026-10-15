/**
 * Curated by code: add each owner-supplied YouTube link here as it arrives.
 * No uploads or video-management screen are exposed in the app.
 *
 * Entry shape:
 * {
 *   id: 'unique-stable-id',
 *   title: 'How to ...',
 *   url: '<YouTube watch, share, Shorts, or embed URL>',
 *   description: 'Optional short explanation',
 *   roles: ['admin', 'provider'], // Optional audience restriction.
 *   agencyIds: [123], // Optional tenant restriction.
 * }
 * Add a HowToVideoButton with the entry’s video-id only at the relevant location.
 * Catalog entries never create app-wide buttons or a video library.
 * Only add videos intended for the selected audience; YouTube URLs are not secrets.
 */
export const HOW_TO_VIDEOS = [
  {
    id: 'my-account-business-cards',
    title: 'My Account & business cards',
    url: 'https://youtu.be/Gj3-Xc8NkPY?is=5_x2E71u8ZOV6zOT'
  }
];
