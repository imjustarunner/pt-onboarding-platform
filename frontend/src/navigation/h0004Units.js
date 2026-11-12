// Shared by the note preview and server billing resolver. Clinical documentation
// keeps actual minutes; the four-unit threshold flags billing review, not a code switch.
export function h0004UnitSummary(value,{maxUnits=4}={}) {
  const numeric=Number(value),minutes=Number.isFinite(numeric)?Math.trunc(numeric):0;
  const maximumUnits=Number.isSafeInteger(Number(maxUnits))&&Number(maxUnits)>0?Number(maxUnits):4;
  const maximumBandMinutes=8+maximumUnits*15-1;
  const units=minutes>=8?Math.floor((minutes-8)/15)+1:0;
  const requiresReview=minutes>maximumBandMinutes;
  return {minutes,units,maximumUnits,maximumBandMinutes,requiresReview,
    reason:requiresReview?`H0004 duration ${minutes} min exceeds the ${maximumUnits}-unit band ending at ${maximumBandMinutes} min. Retain actual time and review billing before submitting a claim.`:null};
}
