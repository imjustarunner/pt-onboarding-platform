// Public planning estimates, not invoices, metering or provisioning policy.
// Existing contracts require an explicit agreement before pricing changes.
export const PLOTLINE_PRODUCT = Object.freeze({
  id:'plotline', name:'Plotline', publisher:'PlotTwistCo', domain:'plotlinepo.com',
  currency:'USD', interval:'month', monthlyMinimumCents:2900,
  employeeBands:Object.freeze([
    Object.freeze({through:25, cents:300}),
    Object.freeze({through:100, cents:250}),
    Object.freeze({through:100000, cents:200})
  ]),
  screeningCents:200, interviewHourCents:1200, onboardingCents:2000,
  interviewParticipantLimit:4,
  pilot:Object.freeze({days:30, interviews:5, minutesPerInterview:60, screenings:10, employees:10}),
  includedFeatures:Object.freeze(['hiringEnabled','peopleOpsEnabled','onboardingTraining'])
});

function wholeCount(value, label, max) {
  if (!Number.isSafeInteger(value) || value<0 || value>max) throw new RangeError(`Enter a whole ${label} count from 0 to ${max.toLocaleString('en-US')}.`);
}

export function estimatePlotlinePrice({employees=10, screenings=0, interviewMinutes=0, onboardings=0}={}, pricing=PLOTLINE_PRODUCT) {
  wholeCount(employees,'employee',100000);
  wholeCount(screenings,'screening',1000000);
  wholeCount(interviewMinutes,'interview-minute',1000000);
  wholeCount(onboardings,'onboarding',1000000);
  let remaining=employees, previous=0;
  const employeeBreakdown=pricing.employeeBands.map(band=>{
    const count=Math.min(remaining,band.through-previous);
    remaining-=count;previous=band.through;
    return {count,rateCents:band.cents,cents:count*band.cents};
  });
  const employeeCents=employeeBreakdown.reduce((total,band)=>total+band.cents,0);
  const minimumAdjustmentCents=Math.max(0,pricing.monthlyMinimumCents-employeeCents);
  const recurringCents=employeeCents+minimumAdjustmentCents;
  const screeningCents=screenings*pricing.screeningCents;
  // Aggregate connected minutes for the month; round once to the nearest cent.
  const interviewCents=Math.round(interviewMinutes*pricing.interviewHourCents/60);
  const onboardingCents=onboardings*pricing.onboardingCents;
  return {employees,screenings,interviewMinutes,onboardings,employeeBreakdown,employeeCents,minimumAdjustmentCents,recurringCents,screeningCents,interviewCents,onboardingCents,usageCents:screeningCents+interviewCents,monthlyCents:recurringCents+screeningCents+interviewCents+onboardingCents};
}

// Carry only a complete, validated public estimate to the established inquiry.
export function plotlineQuoteFromQuery(query={}) {
  if (query.plan!=='usage') return null;
  const count=key=>typeof query[key]==='string' && /^\d{1,7}$/.test(query[key])?Number(query[key]):NaN;
  try{return estimatePlotlinePrice({employees:count('employees'),screenings:count('screenings'),interviewMinutes:count('interviewMinutes'),onboardings:count('onboardings')});}catch{return null;}
}
export const formatPlotlineMoney=cents=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:cents%100===0?0:2}).format(cents/100);
