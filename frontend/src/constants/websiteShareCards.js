// Public crawler cards use the same landscape size as the other website previews.
const landscape = { imageWidth: 1200, imageHeight: 630, imageType: 'image/png' };
export const websiteShareCards = {
  range: {
    ...landscape,
    name: 'Mental Range Collective',
    title: 'Mental Range Collective — Stronger Together',
    description: 'Find mental health support and connect with a network of providers and partner organizations serving individuals, families, schools, and communities.',
    image: '/assets/range/link-preview-wide-v2.png',
    imageAlt: 'Mental Range Collective. Expanding mental health, together. Find support, meet our network, and build partnerships.'
  },
  schoolcarebridge: {
    ...landscape,
    name: 'SchoolCareBridge',
    title: 'SchoolCareBridge — Schools, care teams & families',
    description: 'Connect schools, care teams, and families through school portals, enrollment, referrals, and care coordination. A program of MH4Kidz.',
    image: '/assets/schoolcarebridge/link-preview-wide-v2.png',
    imageAlt: 'SchoolCareBridge. Schools, care teams, and families, connected. School portals, enrollment, and care coordination. A program of MH4Kidz.'
  },
  michael: {
    ...landscape,
    name: 'Michael V. Mendez',
    title: 'Michael V. Mendez — Consulting & Coaching',
    description: 'Business consulting, practice growth, AI app development, running coaching, and college planning with Michael V. Mendez. Turn your next chapter into a practical plan.',
    image: '/assets/michael/link-preview-wide-v2.png',
    imageAlt: 'Michael V. Mendez. Your vision. A real plan. Consulting and coaching for business, running, and college decisions.'
  }
};
