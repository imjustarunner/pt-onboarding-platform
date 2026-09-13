const sites = {
 nlu:'nlu',nextlevelup:'nlu',nextleveluplcc:'nlu',itsco:'itsco',tisi:'tisi',innerstrength:'tisi',theinnerstrengthinstitute:'tisi',
 rise:'rise',riserevive:'rise',risereviveco:'rise',ptco:'ptco',plottwistco:'ptco',
 mh4kidz:'mh4kidz',range:'range',mentalrange:'range',mentalrangecollective:'range'
};
export function publicWebsitePath(slug) {
 const site=sites[String(slug||'').toLowerCase().replace(/[^a-z0-9]/g,'')];
 return site?`/p/${site}`:null;
}
