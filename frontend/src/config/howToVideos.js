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
 *   routeNames: ['ActualRouterName'], // Recommended; works with tenant aliases.
 *   pathPrefixes: ['/some-page'], // Optional alternative; matches path segments.
 *   routeQueries: [{ tab: 'my' }], // Optional matches for tabs within a page.
 *   roles: ['admin', 'provider'], // Optional audience restriction.
 *   agencyIds: [123], // Optional tenant restriction.
 * }
 * Omit routeNames/pathPrefixes/routeQueries for an app-wide video. Matching highlights
 * relevant videos; the library still offers all videos allowed for this audience.
 * Only add videos intended for the selected audience; YouTube URLs are not secrets.
 * The launcher stays hidden when no valid videos are available.
 */
export const HOW_TO_VIDEOS = [
  {
    id: 'my-account-business-cards',
    title: 'My Account & business cards',
    url: 'https://youtu.be/Gj3-Xc8NkPY?is=5_x2E71u8ZOV6zOT',
    routeNames: ['AccountInfo', 'OrganizationAccountInfo'],
    routeQueries: [{ tab: 'my' }]
  }
];
