// Offline only. Never queries live clients or sends data to an external service.
import { readFileSync } from 'node:fs';
import { summarizeNluPilotStudy } from '../services/nluPilotStudySummary.js';
const [file]=process.argv.slice(2);
if (!file) { console.error('Usage: node src/scripts/analyzeNluLearningPilot.mjs /path/to/reviewed-pseudonymous-export.json'); process.exitCode=1; }
else { try { console.log(JSON.stringify(summarizeNluPilotStudy(JSON.parse(readFileSync(file,'utf8'))),null,2)); } catch(error) { console.error(error.message); process.exitCode=1; } }
