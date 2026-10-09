/* Presentation-only migration; payroll keys and code mappings remain unchanged. */
const replacements = [
  [
    "Clinical service-credit category",
    "Clinical Session Rate — approved 9-series services"
  ],
  [
    "Clinical service-credit rate",
    "Clinical Session Rate"
  ],
  [
    "clinical service-credit rate",
    "Clinical Session Rate"
  ],
  [
    "Clinical service-credit pay",
    "Clinical Session Rate"
  ],
  [
    "clinical service-credit pay",
    "Clinical Session Rate"
  ],
  [
    "H-code direct-service pay",
    "Direct Care Rate"
  ],
  [
    "H-code direct-service rate",
    "Direct Care Rate"
  ],
  [
    "H-code direct rate",
    "Direct Care Rate"
  ],
  [
    "H-code rate",
    "Direct Care Rate"
  ],
  [
    "H-code direct pay",
    "Direct Care Rate"
  ],
  [
    "Clinical service pay",
    "Clinical Session Rate"
  ],
  [
    "Direct clinical credit rate",
    "Clinical Session Rate"
  ],
  [
    "Clinical credit rate",
    "Clinical Session Rate"
  ],
  [
    "clinical credit rate",
    "Clinical Session Rate"
  ],
  [
    "H-code direct + paid indirect",
    "Direct Care Rate + applicable indirect pay"
  ],
  [
    "9-series clinical services and equivalent credits",
    "Clinical Session Rate — approved 9-series codes and credits"
  ],
  [
    "H-codes and compensation quantities",
    "Direct Care Rate — approved H-codes and quantities"
  ],
  [
    "Service codes: approval, clinical credits and H-code quantities",
    "Service codes: Clinical Session Rate and Direct Care Rate"
  ],
  [
    "H-code compensation: units, encounters and the EHR transition",
    "Direct Care Rate: H-code units, encounters and the EHR transition"
  ],
  [
    "Fee-for-service clinical compensation",
    "Clinical Session Rate compensation"
  ],
  [
    "H-code compensation and automatic indirect pay",
    "Direct Care Rate compensation and applicable indirect pay"
  ],
  [
    "service-credit rate",
    "Clinical Session Rate"
  ],
  [
    "your H-code terms",
    "your Direct Care Rate terms"
  ],
  [
    "Your H-code terms",
    "Your Direct Care Rate terms"
  ]
];
export function renamePayRateLabels(text) {
 return replacements.reduce((value,[before,after])=>value.replaceAll(before,after),String(text ?? ""));
}
export const PAY_RATE_SCOPE = "Clinical Session Rate currently covers approved 9-series clinical services at their assigned credit values. Direct Care Rate currently covers approved H-code services at their documented hour or unit equivalents. Additional service codes may be assigned to either rate through a dated handbook update and an approved payroll mapping before use; a code prefix alone does not authorize a service or determine pay. Existing code-specific eligibility, indirect allowances and group restrictions continue to apply.";
