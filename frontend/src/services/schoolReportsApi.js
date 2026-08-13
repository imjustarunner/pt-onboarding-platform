import api from './api';

const quiet = { skipGlobalLoading: true };

export async function fetchSchoolReportsSnapshot(agencyId, { schoolYear } = {}) {
  const params = {};
  if (agencyId) params.agencyId = agencyId;
  if (schoolYear) params.schoolYear = schoolYear;
  const { data } = await api.get('/school-reports/snapshot', { params, ...quiet });
  return data;
}
