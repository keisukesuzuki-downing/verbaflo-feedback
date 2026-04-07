// ============================================================
// Chatbot Feedback Intake — Google Apps Script Web App
// ============================================================
// SETUP INSTRUCTIONS:
//   1. Make new Google Sheet. Copy ID into SHEET_ID below.
//      (long string in Sheet URL between /d/ and /edit)
//   2. Make folder in Google Drive for screenshots. Copy ID into FOLDER_ID.
//      (string at end of folder URL)
//   3. Deploy as Web App:
//      Extensions > Apps Script > Deploy > New Deployment
//      Type: Web App | Execute as: Me | Who has access: Anyone
//   4. Copy Web App URL into index.html (APPS_SCRIPT_URL)
// ============================================================

const SHEET_ID  = '1f3TUiZp_F6vqgQdwOC16cBw5F1gZUwAkD2ObImviNOk';
const FOLDER_ID = '1RzC9eeEZvVb4BKpvH5lhR8fBELauNBqo';
const SHEET_NAME = 'Feedback';

// ----------------------------------------------------------
// Put headers in sheet. Run once from editor.
// ----------------------------------------------------------
function setupSheet() {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  sheet.getRange(1, 1, 1, 13).setValues([[
    'Timestamp', 'Chat Session ID', 'Submitted By',
    'No issues', 'Incorrect information', 'Repetitive responses',
    'Not answering properly', 'Failed to escalate', 'Information captured too early', 'Other',
    'Feedback', 'Screenshot URL', 'Status'
  ]]);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
}

// ----------------------------------------------------------
// GET  ?action=check&chatId=XXX
// Say if chat ID exist or not
// ----------------------------------------------------------
function doGet(e) {
  const action = e.parameter.action;

  if (action === 'check') {
    const chatId = (e.parameter.chatId || '').trim().toLowerCase();
    const exists = chatIdExists(chatId);
    return jsonResponse({ exists });
  }

  return jsonResponse({ error: 'No know this action' });
}

// ----------------------------------------------------------
// POST  body: JSON string (send as text/plain, no CORS problem)
// { name, chatId, feedback, screenshot, screenshotName }
// Give back { success: true } or { success: false, error: '...' }
// ----------------------------------------------------------
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const chatId   = (data.chatId   || '').trim();
    const name     = (data.name     || '').trim();
    const feedback   = (data.feedback   || '').trim();
    const categories = Array.isArray(data.categories) ? data.categories : [];
    const screenshot     = data.screenshot     || null; // base64 data URL
    const screenshotName = data.screenshotName || 'screenshot.png';

    if (!chatId)   return jsonResponse({ success: false, error: 'Need Chat Session ID.' });
    if (!name)     return jsonResponse({ success: false, error: 'Need name.' });
    if (!feedback) return jsonResponse({ success: false, error: 'Need feedback.' });

    // Put screenshot in Drive if got one
    let screenshotUrl = '';
    if (screenshot) {
      screenshotUrl = saveScreenshot(screenshot, screenshotName, chatId);
    }

    // Add row to Sheet
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
    const CAT_KEYS = [
      'No issues', 'Incorrect information', 'Repetitive responses',
      'Not answering properly', 'Failed to escalate', 'Information captured too early', 'Other'
    ];
    sheet.appendRow([
      new Date(),
      chatId,
      name,
      ...CAT_KEYS.map(k => categories.includes(k) ? 'Y' : ''),
      feedback,
      screenshotUrl,
      'New'
    ]);

    return jsonResponse({ success: true });

  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// ----------------------------------------------------------
// Helper functions
// ----------------------------------------------------------

function chatIdExists(chatIdLower) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  // Column B (index 1) = Chat Session ID
  const ids = sheet.getRange(2, 2, lastRow - 1, 1).getValues().flat();
  return ids.some(id => (id || '').toString().trim().toLowerCase() === chatIdLower);
}

function saveScreenshot(base64DataUrl, filename, chatId) {
  // Cut off data:image/...;base64, part at front
  const matches = base64DataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return '';
  const mimeType   = matches[1];
  const base64Data = matches[2];

  const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, filename);
  const folder = DriveApp.getFolderById(FOLDER_ID);

  // Put in subfolder for this chat ID
  let subFolder;
  const existing = folder.getFoldersByName(chatId);
  subFolder = existing.hasNext() ? existing.next() : folder.createFolder(chatId);

  const file = subFolder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return file.getUrl();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
