THE CODE.GS SETUP.etc.
// function generateStaffReports() {
//   const ss = SpreadsheetApp.getActiveSpreadsheet();
  
//   // 1. SETUP & CLEANUP
//   let reportSheet = ss.getSheetByName("Staff_Reports");
//   if (reportSheet) { reportSheet.clear(); } 
//   else { reportSheet = ss.insertSheet("Staff_Reports"); }
  
//   // 2. GET DATA
//   const dashSheet = ss.getSheetByName("Payroll_Dashboard");
//   const masterSheet = ss.getSheetByName("Master_Ledger");
  
//   // Check for Empty Dashboard
//   const dashLastRow = dashSheet.getLastRow();
//   if (dashLastRow < 5) {
//     SpreadsheetApp.getUi().alert("No staff found on Dashboard!");
//     return;
//   }
  
//   // Get Basic Dashboard Data (Cols A-D)
//   const dashData = dashSheet.getRange(5, 1, dashLastRow - 4, 4).getValues(); 
  
//   const payPeriodEnd = dashSheet.getRange("B1").getDisplayValue(); 
//   const companyFilter = dashSheet.getRange("B2").getDisplayValue(); 
  
//   // Get Master Ledger Data
//   const masterLastRow = masterSheet.getLastRow();
//   const masterData = masterSheet.getRange(2, 1, masterLastRow - 1, 8).getValues(); 
  
//   // 3. STYLE SETTINGS
//   const headerColors = ["#f3f3f3", "#ffffff"]; // Subtle grey/white banding
//   const fontName = "Montserrat";
  
//   let printRow = 1;
//   let reportCount = 0;
  
//   // --- UPDATED COLUMN WIDTHS (Smaller/Tighter) ---
//   reportSheet.setColumnWidth(1, 200); // Service Codes
//   reportSheet.setColumnWidth(2, 80);  // Units (Much smaller)
  
//   dashData.forEach(person => {
//     let name = person[0];       
//     let finalTier = person[3];  // "Tier 3", "Tier 2", etc.
    
//     if (!name) return;

//     // --- GATHER DATA ---
//     let paidItems = [];
//     let noNoteItems = [];
    
//     // FILTER
//     let personRows = masterData.filter(row => 
//       row[2] === name && 
//       formatDate(row[0]) === payPeriodEnd &&
//       (row[1] + "").trim() === (companyFilter + "").trim()
//     );
    
//     personRows.forEach(row => {
//       let code = row[3];     
//       let noNote = row[4];   
//       let paid = row[7];     
      
//       if (paid > 0) paidItems.push([code, paid]);
//       if (noNote > 0) noNoteItems.push([code, noNote]);
//     });

//     if (paidItems.length === 0 && noNoteItems.length === 0) return;

//     // --- TIER COLOR LOGIC ---
//     let tierBg = "#ffffff";
//     let tierText = "#000000";
    
//     // Check if the string contains the number
//     if ((finalTier + "").includes("3")) { tierBg = "#d9ead3"; tierText = "#274e13"; } // Green
//     else if ((finalTier + "").includes("2")) { tierBg = "#cfe2f3"; tierText = "#1c4587"; } // Blue
//     else if ((finalTier + "").includes("1")) { tierBg = "#fce5cd"; tierText = "#b45f06"; } // Orange
//     else if ((finalTier + "").includes("0")) { tierBg = "#f4cccc"; tierText = "#990000"; } // Red

//     // --- PRINT HEADER ---
//     // Top Bar
//     reportSheet.getRange(printRow, 1).setValue("CLINICIAN PAY REPORT")
//       .setFontWeight("bold").setFontSize(10).setFontColor("#888888");
//     reportSheet.getRange(printRow, 2).setValue(payPeriodEnd)
//       .setHorizontalAlignment("right").setFontWeight("bold").setFontColor("#888888");
//     printRow++;
    
//     // Name Bar
//     reportSheet.getRange(printRow, 1, 1, 2).merge().setValue(name.toUpperCase())
//       .setFontWeight("bold").setFontSize(14)
//       .setBorder(false, false, true, false, false, false, "black", SpreadsheetApp.BorderStyle.SOLID_MEDIUM);
//     printRow++;
    
//     // --- TIER LEVEL (Highlighted) ---
//     reportSheet.getRange(printRow, 1).setValue("Final Tier Level:");
//     let tierCell = reportSheet.getRange(printRow, 2);
//     tierCell.setValue(finalTier)
//       .setBackground(tierBg)
//       .setFontColor(tierText)
//       .setFontWeight("bold")
//       .setHorizontalAlignment("center"); // Center the Tier box
//     printRow++;
//     printRow++; 
    
//     // --- PRINT PAID UNITS ---
//     if (paidItems.length > 0) {
//       reportSheet.getRange(printRow, 1, 1, 2).merge().setValue("PAID UNITS")
//         .setFontWeight("bold").setFontSize(10)
//         .setBorder(false, false, true, false, false, false, "#999999", SpreadsheetApp.BorderStyle.SOLID);
//       printRow++;
      
//       paidItems.forEach(item => {
//         // Col 1: Code
//         reportSheet.getRange(printRow, 1).setValue(item[0]).setHorizontalAlignment("left"); 
//         // Col 2: Units (Left Aligned as requested, Number format fixed)
//         reportSheet.getRange(printRow, 2).setValue(item[1])
//           .setNumberFormat("0.##")
//           .setHorizontalAlignment("left"); 
//         printRow++;
//       });
//     } else {
//       reportSheet.getRange(printRow, 1, 1, 2).merge().setValue("No Paid Units").setFontStyle("italic").setFontColor("#999999");
//       printRow++;
//     }
    
//     // --- PRINT NO NOTE ---
//     if (noNoteItems.length > 0) {
//       printRow++;
//       reportSheet.getRange(printRow, 1, 1, 2).merge().setValue("OUTSTANDING NOTES (UNPAID)")
//         .setFontWeight("bold").setFontColor("#cc0000")
//         .setBorder(false, false, true, false, false, false, "#cc0000", SpreadsheetApp.BorderStyle.SOLID);
//       printRow++;
      
//       noNoteItems.forEach(item => {
//         reportSheet.getRange(printRow, 1).setValue(item[0]).setHorizontalAlignment("left");
//         reportSheet.getRange(printRow, 2).setValue(item[1])
//           .setNumberFormat("0.##")
//           .setHorizontalAlignment("left");
//         printRow++;
//       });
//     }

//     // --- SECTION SPACER ---
//     printRow += 3; 
//     reportCount++;
//   });
  
//   // --- FINAL FORMATTING ---
//   // Apply Font to whole sheet
//   reportSheet.getRange(1, 1, printRow, 2).setFontFamily(fontName).setVerticalAlignment("middle");
  
//   if (reportCount === 0) {
//     SpreadsheetApp.getUi().alert("No active payroll data found for " + companyFilter + ".");
//   } else {
//     SpreadsheetApp.getUi().alert("Reports Generated for " + companyFilter + "! Check 'Staff_Reports'.");
//   }
// }

// // Helper Function
// function formatDate(dateObj) {
//   if (!dateObj) return "";
//   if (typeof dateObj === 'string') return dateObj; 
//   return Utilities.formatDate(dateObj, Session.getScriptTimeZone(), "M/d/yyyy"); 
// }

// function generateADPFile() {
//   var ss = SpreadsheetApp.getActiveSpreadsheet();
//   var sourceSheet = ss.getSheetByName("Payroll_Dashboard");
//   var targetSheet = ss.getSheetByName("ADP_Upload_File");
  
//   // 1. Get Data (Extended to U)
//   var lastRow = sourceSheet.getLastRow();
//   if (lastRow < 5) return; 
//   var dataRange = sourceSheet.getRange("A5:U" + lastRow).getValues();
  
//   var companyCode = sourceSheet.getRange("B2").getValue();
//   var outputData = [];
  
//   for (var i = 0; i < dataRange.length; i++) {
//     var row = dataRange[i];
//     var cleanNum = function(val) { return Number(val) || 0; };

//     var fullName = row[0]; 
    
//     // MAPPING
//     var colH = cleanNum(row[7]);   // Hours
//     var colI = cleanNum(row[8]);   // Rate
//     var colJ = cleanNum(row[9]);   // Hours 2
//     var colK = cleanNum(row[10]);  // Rate 2
//     var colL = cleanNum(row[11]);  // Hours 3 (Tutoring)
//     var colM = cleanNum(row[12]);  // Rate 3 (Tutoring)
//     var colO = cleanNum(row[14]);  // Mileage
//     var colP = cleanNum(row[15]);  // Other Taxable
    
//     var manualBonus = cleanNum(row[16]); // Q (Manual $)
//     var systemBonus = cleanNum(row[19]); // T (Base $)
//     var totalBonusDollars = manualBonus + systemBonus; // Total $

//     var colR = cleanNum(row[17]);  // Reimbursement
//     var colS = cleanNum(row[18]);  // Salary
//     var colU = cleanNum(row[20]);  // BONUS CREDITS (The 39)

//     // Salary Logic
//     if (colS > 0.001) {
//       colH = 80.0000;         
//       colI = colS / 80;       
//       colJ = 0; colK = 0;
//     }

//     // Filter: Check if they have ANY activity
//     if (colH > 0.0001 || colJ > 0.0001 || colL > 0.0001 || colO > 0.0001 || colP > 0.0001 || 
//         totalBonusDollars > 0.0001 || colR > 0.0001 || colU > 0.0001) {
      
//       var firstName = "", lastName = "";
//       if (fullName) {
//         var nameParts = fullName.toString().trim().split(" ");
//         if (nameParts.length > 1) { firstName = nameParts.shift(); lastName = nameParts.join(" "); }
//         else { firstName = fullName; lastName = ""; }
//       }
      
//       // Output Row
//       var newRow = [
//         companyCode, lastName, firstName, 
//         colH, colI,               // Regular
//         colJ, colK,               // Indirect
//         colL, colM,               // Tutoring
//         colO,                     // Mileage
//         colP,                     // Other Taxable
//         totalBonusDollars,        // Bonus (Flat $)
//         colR,                     // Reimbursement
//         colU                      // Bonus Credits (Quantity)
//       ];
//       outputData.push(newRow);
//     }
//   }

//   // Sorting
//   outputData.sort(function(a, b) {
//     var lastA = (a[1] || "").toUpperCase(); 
//     var lastB = (b[1] || "").toUpperCase(); 
//     if (lastA < lastB) return -1;
//     if (lastA > lastB) return 1;
//     var firstA = (a[2] || "").toUpperCase();
//     var firstB = (b[2] || "").toUpperCase();
//     return (firstA < firstB) ? -1 : (firstA > firstB) ? 1 : 0;
//   });

//   // Write & Format
//   targetSheet.clear(); 
//   if (outputData.length > 0) {
//     var headers = [
//     "Company", "Last Name", "First Name", 
//     "Hours", "Rate", "Hours 2", "Rate 2", "Hours 3", "Rate 3", 
//     "Mileage", "Other Taxable", "Bonus ($)", "Reimbursement", "Bonus PTO"
//   ];
//     outputData.unshift(headers);
    
//     var numRows = outputData.length, numCols = outputData[0].length;
//     var range = targetSheet.getRange(1, 1, numRows, numCols);
//     range.setValues(outputData);
    
//     // Styling
//     range.setFontFamily("Montserrat").setFontSize(10);
//     var headerRange = targetSheet.getRange(1, 1, 1, numCols);
//     headerRange.setFontSize(12).setFontWeight("bold").setBackground("#4a86e8").setFontColor("#ffffff");
//     targetSheet.getRange(2, 4, numRows - 1, 11).setNumberFormat("#,##0.0000");

//     // Colors
//     var dataValues = range.getValues();
//     for (var r = 1; r < numRows; r++) { 
//       var currentRowNum = r + 1;
//       var isEvenRow = (currentRowNum % 2 == 0);
//       targetSheet.getRange(currentRowNum, 1, 1, numCols).setBackground(isEvenRow ? "#e6e6e6" : "#ffffff");

//       for (var c = 3; c < numCols; c++) { 
//         if (typeof dataValues[r][c] === 'number' && dataValues[r][c] > 0.0001) {
//           targetSheet.getRange(currentRowNum, c + 1).setBackground(isEvenRow ? "#93c47d" : "#d9ead3").setFontWeight("bold");
//         }
//       }
//     }
//   }
//   SpreadsheetApp.getUi().alert("ADP File Generated (Includes Bonus Credits!)");
// }


THE MENU that was utilized: 
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('PAYROLL COMMAND CENTER')
      // --- STEP 1: IMPORT & ORGANIZE ---
      .addItem('1. Process Raw Billing Data', 'processPayrollData')
      .addSeparator()
      
      // --- STEP 2: EXPORT PAYROLL ---
      .addItem('2. Generate ADP Upload File', 'generateADPFile')
      .addItem('3. Generate Staff PDF Reports', 'generateStaffReports')
      .addSeparator()
      
      // --- STEP 3: MAINTENANCE ---
      .addItem('4. Check Missing Notes (Reconciliation)', 'checkMissingNotes')
      .addSeparator()
      .addItem('📁 5. Archive Data to History Log', 'archiveReportData') // NEW BUTTON
      .addItem('⚠️ 6. RESET / WIPE ALL DATA', 'clearAllWorkspaces')
      .addToUi();
}


The ADP Generator possibly not necessary. 

function generateADPFile() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName("Payroll_Dashboard");
  var targetSheet = ss.getSheetByName("ADP_Upload_File");
  
  // 1. Get Data (Extended to U)
  var lastRow = sourceSheet.getLastRow();
  if (lastRow < 5) return; 
  var dataRange = sourceSheet.getRange("A5:U" + lastRow).getValues();
  
  var companyCode = sourceSheet.getRange("B2").getValue();
  var outputData = [];
  
  for (var i = 0; i < dataRange.length; i++) {
    var row = dataRange[i];
    var cleanNum = function(val) { return Number(val) || 0; };

    var fullName = row[0]; 
    
    // MAPPING
    var colH = cleanNum(row[7]);   // Hours
    var colI = cleanNum(row[8]);   // Rate
    var colJ = cleanNum(row[9]);   // Hours 2
    var colK = cleanNum(row[10]);  // Rate 2
    var colL = cleanNum(row[11]);  // Hours 3 (Tutoring)
    var colM = cleanNum(row[12]);  // Rate 3 (Tutoring)
    var colO = cleanNum(row[14]);  // Mileage
    var colP = cleanNum(row[15]);  // Other Taxable
    
    var manualBonus = cleanNum(row[16]); // Q (Manual $)
    var systemBonus = cleanNum(row[19]); // T (Base $)
    var totalBonusDollars = manualBonus + systemBonus; // Total $

    var colR = cleanNum(row[17]);  // Reimbursement
    var colS = cleanNum(row[18]);  // Salary
    var colU = cleanNum(row[20]);  // BONUS CREDITS (The 39)

    // Salary Logic
    if (colS > 0.001) {
      colH = 80.0000;         
      colI = colS / 80;       
      colJ = 0; colK = 0;
    }

    // Filter: Check if they have ANY activity
    if (colH > 0.0001 || colJ > 0.0001 || colL > 0.0001 || colO > 0.0001 || colP > 0.0001 || 
        totalBonusDollars > 0.0001 || colR > 0.0001 || colU > 0.0001) {
      
      var firstName = "", lastName = "";
      if (fullName) {
        var nameParts = fullName.toString().trim().split(" ");
        if (nameParts.length > 1) { firstName = nameParts.shift(); lastName = nameParts.join(" "); }
        else { firstName = fullName; lastName = ""; }
      }
      
      // Output Row
      var newRow = [
        companyCode, lastName, firstName, 
        colH, colI, colJ, colK, colL, colM, 
        colO, colP, totalBonusDollars, colR, colU
      ];
      outputData.push(newRow);
    }
  }

  // Sorting
  outputData.sort(function(a, b) {
    var lastA = (a[1] || "").toUpperCase(); 
    var lastB = (b[1] || "").toUpperCase(); 
    if (lastA < lastB) return -1;
    if (lastA > lastB) return 1;
    var firstA = (a[2] || "").toUpperCase();
    var firstB = (b[2] || "").toUpperCase();
    return (firstA < firstB) ? -1 : (firstA > firstB) ? 1 : 0;
  });

  // Write & Format
  targetSheet.clear(); 
  if (outputData.length > 0) {
    var headers = [
    "Company", "Last Name", "First Name", 
    "Hours", "Rate", "Hours 2", "Rate 2", "Hours 3", "Rate 3", 
    "Mileage", "Other Taxable", "Bonus ($)", "Reimbursement", "Bonus PTO"
  ];
    outputData.unshift(headers);
    
    var numRows = outputData.length, numCols = outputData[0].length;
    var range = targetSheet.getRange(1, 1, numRows, numCols);
    range.setValues(outputData);
    
    // Styling
    range.setFontFamily("Montserrat").setFontSize(10);
    var headerRange = targetSheet.getRange(1, 1, 1, numCols);
    headerRange.setFontSize(12).setFontWeight("bold").setBackground("#4a86e8").setFontColor("#ffffff");
    targetSheet.getRange(2, 4, numRows - 1, 11).setNumberFormat("#,##0.0000");

    // Colors
    var dataValues = range.getValues();
    for (var r = 1; r < numRows; r++) { 
      var currentRowNum = r + 1;
      var isEvenRow = (currentRowNum % 2 == 0);
      targetSheet.getRange(currentRowNum, 1, 1, numCols).setBackground(isEvenRow ? "#e6e6e6" : "#ffffff");

      for (var c = 3; c < numCols; c++) { 
        if (typeof dataValues[r][c] === 'number' && dataValues[r][c] > 0.0001) {
          targetSheet.getRange(currentRowNum, c + 1).setBackground(isEvenRow ? "#93c47d" : "#d9ead3").setFontWeight("bold");
        }
      }
    }
  }
  SpreadsheetApp.getUi().alert("ADP File Generated (Includes Bonus Credits!)");
}


THE TOOL STAGING.GS

/**
 * TOOL: PAYROLL STAGING PROCESSOR
 * 1. Asks user to TYPE the Pay Period Date.
 * 2. Asks user to SELECT the Company.
 * 3. Processes Raw Data:
 * - Defaults empty Status (Col Z) to "NO NOTE".
 * - Defaults empty/zero Units (Col H) to 1.
 * - Applies "Missed Appointment" logic (Col B/AE/AG).
 */

const STAGING_CONFIG = {
  sheet_raw_import:   "Raw_Data_Import",
  sheet_staging:      "Payroll_Staging",
  sheet_ledger:       "Master_Ledger",
  
  // RAW REPORT COLUMN LETTERS
  col_provider_name: "N",   
  col_service_code:  "F",   
  col_note_status:   "Z",   
  col_units:         "H",
  
  // MISSED APPOINTMENT LOGIC COLUMNS
  col_appt_type:        "B",   
  col_amount_collected: "AE",  
  col_paid_status:      "AG",  
  
  // LEDGER COLUMN FOR COMPANY
  col_ledger_company: 1 // Column B
};

function processPayrollData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const srcSheet = ss.getSheetByName(STAGING_CONFIG.sheet_raw_import);
  const destSheet = staging_getOrCreateSheet(ss, STAGING_CONFIG.sheet_staging);
  
  if (!srcSheet || srcSheet.getLastRow() < 2) {
    ui.alert("No data found in '" + STAGING_CONFIG.sheet_raw_import + "'.");
    return;
  }

  // --- STEP 1: DATE ---
  const dateResponse = ui.prompt("Step 1/2: Pay Period Date", "Type Pay Period End Date (e.g., 12/19/2025):", ui.ButtonSet.OK_CANCEL);
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;
  let selectedDate = dateResponse.getResponseText().trim();
  if (!selectedDate || isNaN(Date.parse(selectedDate))) { ui.alert("Invalid Date."); return; }

  // --- STEP 2: COMPANY ---
  let companies = [];
  const ledgerSheet = ss.getSheetByName(STAGING_CONFIG.sheet_ledger);
  if (ledgerSheet && ledgerSheet.getLastRow() > 1) {
    const ledgerData = ledgerSheet.getRange(2, 1, ledgerSheet.getLastRow() - 1, 2).getValues();
    ledgerData.forEach(r => { let c = r[STAGING_CONFIG.col_ledger_company]; if (c && !companies.includes(c)) companies.push(c); });
  }
  companies.sort();
  if (companies.length === 0) companies = ["Growth", "Elevation"]; 
  let compPrompt = "Select Company:\n";
  companies.forEach((c, i) => compPrompt += (i + 1) + ". " + c + "\n");
  const compResponse = ui.prompt("Step 2/2: Company", compPrompt + "\nEnter NUMBER:", ui.ButtonSet.OK_CANCEL);
  if (compResponse.getSelectedButton() !== ui.Button.OK) return;
  let compSel = parseInt(compResponse.getResponseText());
  if (isNaN(compSel) || compSel < 1 || compSel > companies.length) { ui.alert("Invalid selection."); return; }
  let selectedCompany = companies[compSel - 1];

  // --- PROCESSING ---
  const values = srcSheet.getDataRange().getValues();
  
  // Get Column Indices (0-based)
  const nameIdx = staging_letterToColumn(STAGING_CONFIG.col_provider_name) - 1;
  const codeIdx = staging_letterToColumn(STAGING_CONFIG.col_service_code) - 1;
  const statusIdx = staging_letterToColumn(STAGING_CONFIG.col_note_status) - 1;
  const unitsIdx = staging_letterToColumn(STAGING_CONFIG.col_units) - 1;
  
  const apptTypeIdx = staging_letterToColumn(STAGING_CONFIG.col_appt_type) - 1;
  const amountIdx = staging_letterToColumn(STAGING_CONFIG.col_amount_collected) - 1;
  const paidStatusIdx = staging_letterToColumn(STAGING_CONFIG.col_paid_status) - 1;

  let summary = {};

  for (let i = 1; i < values.length; i++) { 
    let row = values[i];
    let name = row[nameIdx];
    
    // SKIP ROWS WITHOUT A CLINICIAN NAME
    if (!name || String(name).trim() === "") continue; 
    
    let code = row[codeIdx];
    let rawStatus = row[statusIdx];
    
    // 1. ROBUST STATUS CHECK
    // Trim spaces. If empty/null/undefined, force it to "NO NOTE"
    let status = (rawStatus == null) ? "NO NOTE" : String(rawStatus).trim();
    if (status === "") status = "NO NOTE";

    // 2. ROBUST UNIT CHECK
    // If Units is empty, text, or 0, we default to 1 so the row counts.
    let units = parseFloat(row[unitsIdx]);
    if (isNaN(units) || units <= 0.0001) {
      units = 1; 
    }

    // 3. MISSED APPOINTMENT CHECK
    let apptType = String(row[apptTypeIdx]);
    let paidStatus = String(row[paidStatusIdx]);
    let rawAmount = row[amountIdx];
    
    // Clean Amount (Currency/Parentheses)
    let amount = 0;
    if (typeof rawAmount === 'number') amount = Math.abs(rawAmount); 
    else if (rawAmount) amount = parseFloat(String(rawAmount).replace(/[$,()]/g, ''));
    if (isNaN(amount)) amount = 0;

    if (apptType.includes("Missed Appointment") && amount > 0 && paidStatus.includes("Paid in Full")) {
      code = "Missed Appt";      
      units = amount * 0.50;     
      status = "Finalized";      
    }

    // 4. BUCKETING
    if (!summary[name]) summary[name] = {};
    if (!summary[name][code]) summary[name][code] = { no_note: 0, draft: 0, finalized: 0 };

    let statusLower = status.toLowerCase();
    
    if (status === "NO NOTE") {
      summary[name][code].no_note += units;
    } 
    else if (statusLower.includes("draft")) {
      summary[name][code].draft += units;
    } 
    else if (statusLower.includes("final") || statusLower.includes("signed") || statusLower.includes("complete") || statusLower.includes("yes")) {
      summary[name][code].finalized += units;
    }
  }

  // --- OUTPUT GENERATION ---
  // Structure: Date, Company, Name, Code, No Note, Draft, Finalized
  let output = [["Date", "Company", "Clinician Name", "Service Code", "NO NOTE (Units)", "Draft (Units)", "Finalized (Units)"]];

  for (let name in summary) {
    for (let code in summary[name]) {
      let stats = summary[name][code];
      
      // Output if ANY category has value (even if only No Note)
      if (stats.no_note > 0 || stats.draft > 0 || stats.finalized > 0) {
        output.push([
          selectedDate, 
          selectedCompany, 
          name, 
          code, 
          stats.no_note, 
          stats.draft, 
          stats.finalized
        ]);
      }
    }
  }

  destSheet.clear();
  destSheet.getRange(1, 1, output.length, output[0].length).setValues(output);
  destSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#e0e0e0");
  destSheet.autoResizeColumns(1, 7);
  
  ss.setActiveSheet(destSheet);
  ui.alert("✅ Staging Complete!\n\nDate: " + selectedDate + "\nCompany: " + selectedCompany);
}

function staging_letterToColumn(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}

function staging_getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}



THE TOOL_RECONCILIATION.gs

/**
 * TOOL: RECONCILIATION & MAINTENANCE
 * 1. Checks Missing Notes (Robust Date Range Match).
 * 2. Archives Data to History.
 * 3. Wipes Workspaces.
 */

const RECON_CONFIG = {
  sheet_ledger:       "Master_Ledger",
  sheet_recon_import: "Reconciliation_Import",
  sheet_recon_report: "Reconciliation_Report",
  sheet_staging:      "Payroll_Staging",
  sheet_raw_import:   "Raw_Data_Import",
  
  sheet_hist_payroll: "History_Payroll_Log",
  sheet_hist_recon:   "History_Recon_Log",
  
  // LEDGER COLUMN INDICES (0-based)
  col_ledger_date:       0, // A
  col_ledger_company:    1, // B
  col_ledger_name:       2, // C
  col_ledger_code:       3, // D
  col_ledger_nonote:     4, // E (Old Missing)
  col_ledger_finalized:  7, // H (Old Finalized/Paid) <-- NEW!
  
  // REPORT IMPORT COLUMNS
  col_date:          "A",   
  col_provider_name: "N",   
  col_service_code:  "F",   
  col_note_status:   "Z",   
  col_units:         "H"
};

function checkMissingNotes() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const ledgerSheet = ss.getSheetByName(RECON_CONFIG.sheet_ledger);
  const reportSheet = recon_getOrCreateSheet(ss, RECON_CONFIG.sheet_recon_import);
  const outputSheet = recon_getOrCreateSheet(ss, RECON_CONFIG.sheet_recon_report);

  // 1. READ LEDGER (Now grabbing up to Column H/Index 7)
  const lastRowL = ledgerSheet.getLastRow();
  const ledgerData = ledgerSheet.getRange(2, 1, lastRowL - 1, 8).getValues(); 

  // --- STEP 1: TYPE PAY PERIOD DATE (Fixed) ---
  const dateResponse = ui.prompt(
    "Step 1/2: Pay Period", 
    "Please type the Pay Period End Date you are checking (e.g., 12/19/2025):", 
    ui.ButtonSet.OK_CANCEL
  );
  
  if (dateResponse.getSelectedButton() !== ui.Button.OK) return;
  let selectedDateInput = dateResponse.getResponseText().trim();
  
  if (!selectedDateInput || isNaN(Date.parse(selectedDateInput))) { 
    ui.alert("Invalid Date. Please run again and format as MM/DD/YYYY."); 
    return; 
  }
  
  // Normalize date string for comparison
  let targetDate = new Date(selectedDateInput);
  let selectedDateStr = Utilities.formatDate(targetDate, ss.getSpreadsheetTimeZone(), "M/d/yyyy");

  // --- STEP 2: COMPANY SELECT ---
  let companies = [];
  ledgerData.forEach(r => {
    let c = r[RECON_CONFIG.col_ledger_company];
    if (c && !companies.includes(c)) companies.push(c);
  });
  companies.sort();

  let compPrompt = "Which company matches the uploaded report?\n\n";
  companies.forEach((c, i) => compPrompt += (i + 1) + ". " + c + "\n");
  compPrompt += "\nEnter the NUMBER:";
  const compResponse = ui.prompt("Step 2/2: Company", compPrompt, ui.ButtonSet.OK_CANCEL);
  if (compResponse.getSelectedButton() !== ui.Button.OK) return;
  
  let selection = parseInt(compResponse.getResponseText());
  if (isNaN(selection) || selection < 1 || selection > companies.length) return;
  let selectedCompany = companies[selection - 1];

  // 2. READ REPORT
  const lastRowR = reportSheet.getLastRow();
  if (lastRowR < 2) { ui.alert("Import report is empty."); return; }
  const rawReportData = reportSheet.getRange(2, 1, lastRowR - 1, 26).getValues(); 

  const rDateIdx = recon_letterToColumn(RECON_CONFIG.col_date) - 1;
  const rNameIdx = recon_letterToColumn(RECON_CONFIG.col_provider_name) - 1;
  const rCodeIdx = recon_letterToColumn(RECON_CONFIG.col_service_code) - 1;
  const rStatusIdx = recon_letterToColumn(RECON_CONFIG.col_note_status) - 1;
  const rUnitsIdx = recon_letterToColumn(RECON_CONFIG.col_units) - 1;

  let reportObjects = [];
  for (let r = 0; r < rawReportData.length; r++) {
    let row = rawReportData[r];
    let d = new Date(row[rDateIdx]);
    if (!isNaN(d.getTime()) && row[rNameIdx]) {
       let rawStat = row[rStatusIdx];
       let status = (rawStat == null || String(rawStat).trim() === "") ? "no note" : String(rawStat).toLowerCase();
       
       reportObjects.push({
         date: d,
         name: String(row[rNameIdx]).trim().toLowerCase(),
         code: String(row[rCodeIdx]).trim(),
         status: status,
         units: (parseFloat(row[rUnitsIdx]) || 1)
       });
    }
  }

  // 3. COMPARE
  let outputRows = [];
  for (let i = 0; i < ledgerData.length; i++) {
    let lRow = ledgerData[i];
    
    // FILTERS
    if (String(lRow[RECON_CONFIG.col_ledger_company]).trim() !== String(selectedCompany).trim()) continue;
    let lDateObj = lRow[RECON_CONFIG.col_ledger_date];
    let lDateStr = (lDateObj instanceof Date) ? Utilities.formatDate(lDateObj, ss.getSpreadsheetTimeZone(), "M/d/yyyy") : String(lDateObj);
    if (lDateStr !== selectedDateStr) continue;
    
    let unitsOwed = lRow[RECON_CONFIG.col_ledger_nonote]; 
    if (typeof unitsOwed !== 'number' || unitsOwed <= 0) continue;

    // GET OLD FINALIZED (Column H)
    let oldFinalized = lRow[RECON_CONFIG.col_ledger_finalized] || 0;

    // MATCHING LOGIC
    let lName = String(lRow[RECON_CONFIG.col_ledger_name]).trim().toLowerCase();
    let lCode = String(lRow[RECON_CONFIG.col_ledger_code]).trim();
    let ppStart = new Date(lDateObj); 
    ppStart.setDate(lDateObj.getDate() - 14);

    let foundFinalized = 0;
    let foundDraft = 0;
    let foundNoNote = 0;
    let totalFound = 0;

    for (let k = 0; k < reportObjects.length; k++) {
      let item = reportObjects[k];
      if (item.name === lName && item.code === lCode && item.date > ppStart && item.date <= lDateObj) {
        totalFound += item.units;
        if (item.status.includes("final") || item.status.includes("signed") || item.status.includes("complete") || item.status.includes("yes")) {
          foundFinalized += item.units;
        } else if (item.status.includes("draft")) {
          foundDraft += item.units;
        } else {
          foundNoNote += item.units;
        }
      }
    }

    // STATUS DETERMINATION
    let statusResult = "";
    let actionNeeded = "";
    let color = "#ffffff"; 

    let vanished = unitsOwed - totalFound;
    
    if (vanished > 0 && totalFound === 0) {
      statusResult = "ALL VANISHED";
      actionNeeded = "CHECK EHR / DELETE";
      color = "#f4cccc"; // Red
    } else if (vanished > 0) {
      statusResult = vanished + " Vanished";
      actionNeeded = "CHECK EHR";
      color = "#f4cccc";
    } else if (foundFinalized >= unitsOwed) {
      statusResult = "Matched Finalized";
      actionNeeded = "PAY CLINICIAN";
      color = "#d9ead3"; // Green
    } else {
      statusResult = "Still Waiting";
      actionNeeded = "WAITING";
      color = "#fff2cc"; // Yellow
    }

    // PUSH ROW WITH NEW COLUMN ORDER
    outputRows.push([
      lRow[RECON_CONFIG.col_ledger_date], 
      lRow[RECON_CONFIG.col_ledger_name], 
      lCode, 
      unitsOwed,       // "Old No Note (Ledger)"
      foundNoNote,     // "New No Note (Report)"
      foundDraft,      // "Found Draft"
      oldFinalized,    // "Old Finalized (Ledger)" <-- NEW COLUMN
      foundFinalized,  // "Found Finalized (Report)"
      statusResult,
      actionNeeded, 
      i + 2,
      color
    ]);
  }

  // 4. OUTPUT
  outputSheet.clear();
  
  // UPDATED HEADER (11 Columns)
  let headers = [[
    "Pay Period", "Clinician", "Code", 
    "Old 'No Note'", "New 'No Note'", "Found Draft", 
    "Old Finalized", "Found Finalized", // <-- Side by Side
    "Result", "Action", "Row #"
  ]];
  
  outputSheet.getRange(1, 1, 1, 11).setValues(headers).setFontWeight("bold").setBackground("#4a86e8").setFontColor("white");
  
  if (outputRows.length > 0) {
    let dataToWrite = outputRows.map(r => r.slice(0, 11)); // Exclude color
    outputSheet.getRange(2, 1, dataToWrite.length, 11).setValues(dataToWrite);
    
    // Apply Colors
    for (let r = 0; r < outputRows.length; r++) {
      outputSheet.getRange(r + 2, 1, 1, 11).setBackground(outputRows[r][11]);
    }
    
    outputSheet.getRange(2, 1, outputRows.length, 1).setNumberFormat("M/d/yyyy");
    outputSheet.autoResizeColumns(1, 11);
    ui.alert("RECONCILIATION COMPLETE.\nShowing Old vs New counts for comparison.");
  } else {
    ui.alert("No missing notes found in Ledger for this period.");
  }
}

function archiveReportData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const timestamp = new Date(); 
  let savedCount = 0;

  // Archive Staging
  const stagingSheet = ss.getSheetByName(RECON_CONFIG.sheet_staging);
  if (stagingSheet && stagingSheet.getLastRow() > 1) {
    const stagingData = stagingSheet.getRange(2, 1, stagingSheet.getLastRow() - 1, 7).getValues(); 
    const archivedData = stagingData.map(row => [timestamp, ...row]);
    const historySheet = recon_getOrCreateSheet(ss, RECON_CONFIG.sheet_hist_payroll);
    historySheet.hideSheet();
    if (historySheet.getLastRow() === 0) historySheet.appendRow(["Timestamp", "Date", "Company", "Clinician", "Code", "NO NOTE", "Draft", "Finalized"]);
    historySheet.getRange(historySheet.getLastRow() + 1, 1, archivedData.length, archivedData[0].length).setValues(archivedData);
    savedCount++;
  }

  // Archive Recon (Updated for 11 columns)
  const reconSheet = ss.getSheetByName(RECON_CONFIG.sheet_recon_report);
  if (reconSheet && reconSheet.getLastRow() > 1) {
    const reconData = reconSheet.getRange(2, 1, reconSheet.getLastRow() - 1, 11).getValues(); 
    const archivedRecon = reconData.map(row => [timestamp, ...row]);
    const historyRecon = recon_getOrCreateSheet(ss, RECON_CONFIG.sheet_hist_recon);
    historyRecon.hideSheet(); 
    if (historyRecon.getLastRow() === 0) historyRecon.appendRow(["Timestamp", "Pay Period", "Clinician", "Code", "Old No Note", "New No Note", "Found Draft", "Old Final", "Found Final", "Result", "Action", "Row #"]);
    historyRecon.getRange(historyRecon.getLastRow() + 1, 1, archivedRecon.length, archivedRecon[0].length).setValues(archivedRecon);
    savedCount++;
  }

  if (savedCount > 0) SpreadsheetApp.getUi().alert("✅ Data saved to hidden History Logs.");
  else SpreadsheetApp.getUi().alert("⚠️ No data found to archive.");
}

function clearAllWorkspaces() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (SpreadsheetApp.getUi().alert('⚠️ CONFIRM WIPE', 'Clear all workspaces?', SpreadsheetApp.getUi().ButtonSet.YES_NO) == SpreadsheetApp.getUi().Button.NO) return;
  [RECON_CONFIG.sheet_raw_import, RECON_CONFIG.sheet_staging, RECON_CONFIG.sheet_recon_import, RECON_CONFIG.sheet_recon_report].forEach(n => {
    const s = ss.getSheetByName(n); if(s) s.clear();
  });
}

function recon_letterToColumn(letter) {
  let column = 0, length = letter.length;
  for (let i = 0; i < length; i++) {
    column += (letter.charCodeAt(i) - 64) * Math.pow(26, length - i - 1);
  }
  return column;
}

function recon_getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}


