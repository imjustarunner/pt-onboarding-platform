import { PROGRAM_RATE_SCHEDULES, programRatesHandbookHtml } from './programServiceRates.js';
/** Retained for generator callers; current rates are category-specific. */
export const NLU_TUTORING_LEVEL_RATES = PROGRAM_RATE_SCHEDULES.tutoring.rates[1];
export const NLU_TUTORING_HANDBOOK_SECTION = {
  slug:'nlu-tutoring-and-h2014-compensation',
  title:'Homework Help, Tutoring and Therapy + Tutoring rates',
  bodyHtml:programRatesHandbookHtml('nlu')
};
