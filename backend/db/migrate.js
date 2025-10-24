import { db } from './index.js';

db.exec('PRAGMA foreign_keys = ON;');

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

const createSettingsTable = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

const createUsersTable = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createUserGroupsTable = `
CREATE TABLE IF NOT EXISTS user_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createUserGroupMembershipsTable = `
CREATE TABLE IF NOT EXISTS user_group_memberships (
  user_id INTEGER NOT NULL,
  group_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, group_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE
);
`;

const createUserSettingsTable = `
CREATE TABLE IF NOT EXISTS user_settings (
  user_id INTEGER NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, setting_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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

db.exec(createSettingsTable);
console.log('✅ settings table ready');

db.exec(createUsersTable);
console.log('✅ users table ready');

db.exec(createUserGroupsTable);
console.log('✅ user_groups table ready');

db.exec(createUserGroupMembershipsTable);
console.log('✅ user_group_memberships table ready');

db.exec(createUserSettingsTable);
console.log('✅ user_settings table ready');


db.close();
