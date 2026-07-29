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
 *
 * ADMIN: set ADMIN_PASSWORD below to enable the app's Admin screen (add/remove
 * players, view everyone's picks and when they were made). Every pick is also
 * logged to a "Log" tab (auto-created) so you have a timestamped audit trail.
 */

var SHEET_NAME = 'Picks';
var LOG_NAME = 'Log';
var LIVES = 3;

// Set this to a private password to unlock the Admin screen. Leave as '' to keep
// admin disabled. Change it, then re-deploy the web app.
var ADMIN_PASSWORD = '';

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
    if (body.action === 'admin') return json(handleAdmin(body));
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
        logPick(name, gw, team);
        return { ok: true };
      }
    }
    return { ok: false, error: 'Player not found' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------- Admin ----------------------------------- */

function handleAdmin(body) {
  if (!ADMIN_PASSWORD) return { ok: false, error: 'Admin is not enabled' };
  if (String(body.pass || '') !== ADMIN_PASSWORD) return { ok: false, error: 'Wrong password' };

  var sub = body.sub;
  if (sub === 'data') return adminData();
  if (sub === 'add') return adminAddPlayer(body);
  if (sub === 'remove') return adminRemovePlayer(body);
  return { ok: false, error: 'Unknown admin action' };
}

// Full picture for the admin: every player with PIN, picks, and when each pick
// was last submitted (from the Log). Unlike the public feed, nothing is hidden.
function adminData() {
  var sheet = getSheet();
  var values = sheet.getDataRange().getValues();
  var col = columnMap(headerRow(values));
  var times = readLogTimes(); // { "name|GW": isoString }

  var players = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var name = String(row[col.name] || '').trim();
    if (!name) continue;
    var picks = {};
    var pickTimes = {};
    for (var gw in col.gw) {
      var v = row[col.gw[gw]];
      if (v !== '' && v !== null && v !== undefined) {
        picks[gw] = String(v).trim();
        var t = times[name.toLowerCase() + '|' + gw];
        if (t) pickTimes[gw] = t;
      }
    }
    players.push({
      name: name,
      pin: String(row[col.pin] || '').trim(),
      paid: /^y(es)?$/i.test(String(row[col.paid] || '').trim()),
      picks: picks,
      times: pickTimes,
    });
  }
  return { ok: true, players: players, lives: LIVES };
}

function adminAddPlayer(body) {
  var name = String(body.name || '').trim();
  var pin = String(body.pin || '').trim();
  if (!name) return { ok: false, error: 'Name required' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var col = columnMap(headerRow(values));
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][col.name] || '').trim().toLowerCase() === name.toLowerCase()) {
        return { ok: false, error: 'Player already exists' };
      }
    }
    var newRow = new Array(sheet.getLastColumn()).fill('');
    newRow[col.name] = name;
    newRow[col.paid] = 'N';
    newRow[col.pin] = pin;
    sheet.appendRow(newRow);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function adminRemovePlayer(body) {
  var name = String(body.name || '').trim();
  if (!name) return { ok: false, error: 'Name required' };

  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var sheet = getSheet();
    var values = sheet.getDataRange().getValues();
    var col = columnMap(headerRow(values));
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][col.name] || '').trim().toLowerCase() === name.toLowerCase()) {
        sheet.deleteRow(r + 1); // 1-indexed
        return { ok: true };
      }
    }
    return { ok: false, error: 'Player not found' };
  } finally {
    lock.releaseLock();
  }
}

/* ------------------------------- Log ------------------------------------- */

function getLogSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(LOG_NAME);
  if (!log) {
    log = ss.insertSheet(LOG_NAME);
    log.appendRow(['Timestamp', 'Name', 'Gameweek', 'Team']);
  }
  return log;
}

function logPick(name, gw, team) {
  try {
    getLogSheet().appendRow([new Date(), name, gw, team]);
  } catch (err) {
    /* logging must never block a pick */
  }
}

// Latest submission time per player+gameweek, keyed "name(lowercased)|GW".
function readLogTimes() {
  var out = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = ss.getSheetByName(LOG_NAME);
  if (!log || log.getLastRow() < 2) return out;
  var rows = log.getRange(2, 1, log.getLastRow() - 1, 4).getValues();
  for (var i = 0; i < rows.length; i++) {
    var ts = rows[i][0];
    var name = String(rows[i][1] || '').trim().toLowerCase();
    var gw = String(rows[i][2] || '').trim().toUpperCase();
    if (!name || !gw || !ts) continue;
    var iso = ts instanceof Date ? ts.toISOString() : String(ts);
    out[name + '|' + gw] = iso; // later rows overwrite → keeps the latest
  }
  return out;
}

/* ------------------------------ Helpers ---------------------------------- */

function headerRow(values) {
  return values[0].map(function (h) {
    return String(h).trim();
  });
}

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
