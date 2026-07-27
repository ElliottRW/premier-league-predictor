/**
 * Last Man Standing — Google Sheet backend (Apps Script Web App).
 *
 * Sheet tab "Picks" layout (row 1 = headers):
 *   Name | Paid? | PIN | GW1 | GW2 | ... | GW38
 * One player per row from row 2. Each GW cell holds the team short name picked.
 *
 * SETUP (see docs/SETUP.md):
 *   1. Extensions ▸ Apps Script, paste this file.
 *   2. Deploy ▸ New deployment ▸ Web app.
 *        Execute as: Me       Who has access: Anyone
 *   3. Copy the /exec URL into the app's config (VITE_SHEET_URL).
 *
 * Security note: the 2-digit PIN prevents *accidentally* picking as the wrong
 * player. It's verified here, server-side, and PINs are never sent to browsers.
 */

var SHEET_NAME = 'Picks';
var LIVES = 3;

/* ----------------------------- HTTP handlers ----------------------------- */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'players';
  if (action === 'players') return json(getPlayers());
  return json({ error: 'Unknown action: ' + action });
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (body.action === 'pick') return json(submitPick(body));
    if (body.action === 'verify') return json(verifyPlayer(body));
    return json({ ok: false, error: 'Unknown action' });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

/* ----------------------------- Verify PIN -------------------------------- */

// Confirms a name + PIN without writing anything. Used to gate the pick screen
// so you must prove it's you before seeing your teams/current pick.
function verifyPlayer(body) {
  var name = String(body.name || '').trim();
  var pin = String(body.pin || '').trim();
  if (!name) return { ok: false, error: 'Missing name' };

  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var col = columnMap(
    values[0].map(function (h) {
      return String(h).trim();
    }),
  );
  for (var r = 1; r < values.length; r++) {
    if (String(values[r][col.name] || '').trim().toLowerCase() === name.toLowerCase()) {
      var actualPin = String(values[r][col.pin] || '').trim();
      if (actualPin && actualPin !== pin) return { ok: false, error: 'Incorrect PIN' };
      return { ok: true };
    }
  }
  return { ok: false, error: 'Player not found' };
}

/* ------------------------------- Read ------------------------------------ */

function getPlayers() {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return { players: [], lives: LIVES };

  var header = values[0].map(function (h) {
    return String(h).trim();
  });
  var col = columnMap(header);

  var players = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[col.name] || '').trim();
    if (!name) continue;
    var picks = {};
    for (var gw in col.gw) {
      var v = row[col.gw[gw]];
      if (v !== '' && v !== null && v !== undefined) picks[gw] = String(v).trim();
    }
    players.push({
      name: name,
      paid: /^y(es)?$/i.test(String(row[col.paid] || '').trim()),
      picks: picks,
    });
  }
  return { players: players, lives: LIVES };
}

/* ------------------------------- Write ----------------------------------- */

function submitPick(body) {
  var name = String(body.name || '').trim();
  var pin = String(body.pin || '').trim();
  var gw = String(body.gw || '').trim();
  var team = String(body.team || '').trim();

  if (!name || !gw || !team) return { ok: false, error: 'Missing fields' };
  if (!/^GW\d+$/.test(gw)) return { ok: false, error: 'Bad gameweek' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var header = values[0].map(function (h) {
      return String(h).trim();
    });
    var col = columnMap(header);

    if (col.gw[gw] === undefined) return { ok: false, error: gw + ' column not found' };

    for (var r = 1; r < values.length; r++) {
      if (String(values[r][col.name] || '').trim().toLowerCase() === name.toLowerCase()) {
        var actualPin = String(values[r][col.pin] || '').trim();
        if (actualPin && actualPin !== pin) return { ok: false, error: 'Incorrect PIN' };
        // Row/column are 1-indexed in getRange.
        sheet.getRange(r + 1, col.gw[gw] + 1).setValue(team);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Player not found' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------ Helpers ---------------------------------- */

function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('Tab "' + SHEET_NAME + '" not found');
  return sheet;
}

function columnMap(header) {
  var map = { name: 0, paid: 1, pin: 2, gw: {} };
  for (var i = 0; i < header.length; i++) {
    var h = header[i];
    var lower = h.toLowerCase();
    if (lower === 'name') map.name = i;
    else if (lower === 'paid?' || lower === 'paid') map.paid = i;
    else if (lower === 'pin') map.pin = i;
    else if (/^gw\d+$/i.test(h)) map.gw[h.toUpperCase()] = i;
  }
  return map;
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON,
  );
}
