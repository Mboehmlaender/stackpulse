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
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  password_salt TEXT,
  avatar_color TEXT,
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

const createPermissionsTable = `
CREATE TABLE IF NOT EXISTS permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createUserGroupPermissionsTable = `
CREATE TABLE IF NOT EXISTS user_group_permissions (
  group_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, permission_id),
  FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
`;


const createServersTable = `
CREATE TABLE IF NOT EXISTS servers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createEndpointsTable = `
CREATE TABLE IF NOT EXISTS endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  external_id TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  UNIQUE (server_id, external_id)
);
`;

const createUserServerPermissionOverridesTable = `
CREATE TABLE IF NOT EXISTS user_server_permission_overrides (
  user_id INTEGER NOT NULL,
  server_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('ADD', 'REMOVE')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, server_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
`;

const createUserEndpointPermissionOverridesTable = `
CREATE TABLE IF NOT EXISTS user_endpoint_permission_overrides (
  user_id INTEGER NOT NULL,
  endpoint_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('ADD', 'REMOVE')),
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, endpoint_id, permission_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (endpoint_id) REFERENCES endpoints(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);
`;

const createUserServerPermissionOverridesIndex = `
CREATE INDEX IF NOT EXISTS idx_user_server_permission_overrides_user_server
ON user_server_permission_overrides (user_id, server_id);
`;

const createUserEndpointPermissionOverridesIndex = `
CREATE INDEX IF NOT EXISTS idx_user_endpoint_permission_overrides_user_endpoint
ON user_endpoint_permission_overrides (user_id, endpoint_id);
`;


const createServerApiKeysTable = `
CREATE TABLE IF NOT EXISTS server_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  server_id INTEGER NOT NULL UNIQUE,
  key_cipher TEXT NOT NULL,
  key_iv TEXT NOT NULL,
  key_tag TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (server_id) REFERENCES servers(id) ON DELETE CASCADE
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

try {
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasAvatarColor = userColumns.some((column) => column.name === 'avatar_color');
  if (!hasAvatarColor) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_color TEXT');
    console.log('ℹ️ avatar_color column hinzugefügt');
  }
  const emailColumn = userColumns.find((column) => column.name === 'email');
  if (emailColumn && emailColumn.notnull === 1) {
    try {
      db.exec('PRAGMA foreign_keys = OFF;');
      db.exec('DROP TABLE IF EXISTS users_backup;');
      db.exec('ALTER TABLE users RENAME TO users_backup;');
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT,
          avatar_color TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          last_login DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.exec(`
        INSERT INTO users (id, username, email, password_hash, password_salt, avatar_color, is_active, last_login, created_at, updated_at)
        SELECT id, username, email, password_hash, password_salt, avatar_color, is_active, last_login, created_at, updated_at
        FROM users_backup;
      `);
      db.exec('DROP TABLE IF EXISTS users_backup;');
      console.log('ℹ️ users.email Spalte erlaubt jetzt NULL-Werte');
    } catch (migrationError) {
      console.error('⚠️ Umbau der users Tabelle fehlgeschlagen:', migrationError.message);
      try {
        db.exec('ALTER TABLE users_backup RENAME TO users;');
      } catch (restoreError) {
        console.error('⚠️ Konnte ursprüngliche users Tabelle nicht wiederherstellen:', restoreError.message);
      }
    } finally {
      db.exec('PRAGMA foreign_keys = ON;');
    }
  }
} catch (err) {
  console.error('⚠️ Konnte avatar_color Spalte nicht prüfen/erstellen:', err.message);
}

db.exec(createUserGroupsTable);
console.log('✅ user_groups table ready');

db.exec(createUserGroupMembershipsTable);
console.log('✅ user_group_memberships table ready');

db.exec(createPermissionsTable);
console.log('✅ permissions table ready');

db.exec(createUserGroupPermissionsTable);
console.log('✅ user_group_permissions table ready');

db.exec(createServersTable);
console.log('✅ servers table ready');

db.exec(createEndpointsTable);
console.log('✅ endpoints table ready');

db.exec(createUserServerPermissionOverridesTable);
console.log('✅ user_server_permission_overrides table ready');

db.exec(createUserEndpointPermissionOverridesTable);
console.log('✅ user_endpoint_permission_overrides table ready');

db.exec(createUserServerPermissionOverridesIndex);
db.exec(createUserEndpointPermissionOverridesIndex);

db.exec(createServerApiKeysTable);
console.log('✅ server_api_keys table ready');

db.exec(createUserSettingsTable);
console.log('✅ user_settings table ready');


db.close();
