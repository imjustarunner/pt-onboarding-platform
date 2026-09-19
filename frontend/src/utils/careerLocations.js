// Combined postings belong in each city's filter without duplicating applications.
export const careerLocations = job => String(job?.city || '').split(/\s+(?:&|and)\s+/i).map(city => city.trim()).filter(Boolean);
