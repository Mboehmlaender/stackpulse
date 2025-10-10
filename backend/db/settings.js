import { db } from './index.js';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

db.prepare(CREATE_TABLE_SQL).run();

const getSettingStmt = db.prepare('SELECT key, value, updated_at FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (@key, @value, CURRENT_TIMESTAMP)
  ON CONFLICT(key) DO UPDATE SET
    value = excluded.value,
    updated_at = CURRENT_TIMESTAMP
`);
const deleteSettingStmt = db.prepare('DELETE FROM settings WHERE key = ?');

export function getSetting(key) {
  try {
    return getSettingStmt.get(key) || null;
  } catch (err) {
    console.error(`❌ [Settings] Fehler beim Lesen des Settings "${key}":`, err.message);
    return null;
  }
}

export function setSetting(key, value) {
  try {
    setSettingStmt.run({ key, value });
    return true;
  } catch (err) {
    console.error(`❌ [Settings] Fehler beim Speichern des Settings "${key}":`, err.message);
    return false;
  }
}

export function deleteSetting(key) {
  try {
    deleteSettingStmt.run(key);
    return true;
  } catch (err) {
    console.error(`❌ [Settings] Fehler beim Löschen des Settings "${key}":`, err.message);
    return false;
  }
}

export function getJsonSetting(key, defaultValue = null) {
  const row = getSetting(key);
  if (!row || row.value === null || row.value === undefined) return defaultValue;
  try {
    return JSON.parse(row.value);
  } catch (err) {
    console.warn(`⚠️ [Settings] Konnte JSON für Setting "${key}" nicht parsen:`, err.message);
    return defaultValue;
  }
}

export function setJsonSetting(key, value) {
  try {
    const payload = value === undefined ? null : JSON.stringify(value);
    return setSetting(key, payload);
  } catch (err) {
    console.error(`❌ [Settings] Fehler beim Serialisieren von Setting "${key}":`, err.message);
    return false;
  }
}
