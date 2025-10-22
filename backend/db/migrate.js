import { db } from './index.js';

const createRedeployLogsTable = `
CREATE TABLE IF NOT EXISTS redeploy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  stack_id TEXT NOT NULL,
  stack_name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  endpoint INTEGER,
  redeploy_type TEXT
);
`;



db.exec(createRedeployLogsTable);

try {
  const columns = db.prepare('PRAGMA table_info(redeploy_logs)').all();
  const hasRedeployType = columns.some((column) => column.name === 'redeploy_type');
  if (!hasRedeployType) {
    db.exec('ALTER TABLE redeploy_logs ADD COLUMN redeploy_type TEXT');
    console.log('ℹ️ redeploy_type column hinzugefügt');
  }
} catch (err) {
  console.error('⚠️ Konnte redeploy_type Spalte nicht prüfen/erstellen:', err.message);
}

console.log('✅ redeploy_logs table ready');

const createSettingsTable = `
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`;

db.exec(createSettingsTable);

console.log('✅ settings table ready');


db.close();
