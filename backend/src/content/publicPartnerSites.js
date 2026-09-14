// Public website destinations, independent of tenant provisioning and network membership.
export const publicPartnerSites = [
 ['itsco','ITSCO','app.itsco.health'],
 ['nlu','Next Level Up','app.nextleveluplcc.com'],
 ['tisi','The Inner Strength Institute','app.theinnerstrengthinstitute.com'],
 ['rise','Rise Revive','app.risereviveco.com'],
 ['ptco','Plot Twist Co.','app.plottwistco.com'],
 ['mh4kidz','MH4Kidz','app.mh4kidz.com'],
 ['range','Mental Range Collective','plottwisthq.com']
].map(([slug,name,host])=>({slug,name,url:`https://${host}/p/${slug}`}));
