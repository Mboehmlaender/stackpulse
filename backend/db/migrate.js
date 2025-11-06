import { db } from './index.js';

db.exec('PRAGMA foreign_keys = ON;');

const createEventLogsTable = `
CREATE TABLE IF NOT EXISTS event_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  category TEXT NOT NULL,
  event_type TEXT,
  action TEXT,
  status TEXT,
  severity TEXT,
  entity_type TEXT,
  entity_id TEXT,
  entity_name TEXT,
  actor_type TEXT,
  actor_id TEXT,
  actor_name TEXT,
  source TEXT,
  context_type TEXT,
  context_id TEXT,
  context_label TEXT,
  message TEXT,
  metadata TEXT
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
  security_phrase_content TEXT,
  security_phrase_iv TEXT,
  security_phrase_tag TEXT,
  security_phrase_downloaded_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createUserGroupsTable = `
CREATE TABLE IF NOT EXISTS user_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  avatar_color TEXT,
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

const createPermissionSectionsTable = `
CREATE TABLE IF NOT EXISTS permission_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  has_navigation_flag INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

const createPermissionGroupsTable = `
CREATE TABLE IF NOT EXISTS permission_groups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  key TEXT NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(section_id, key),
  FOREIGN KEY (section_id) REFERENCES permission_sections(id) ON DELETE CASCADE
);
`;

const createPermissionItemsTable = `
CREATE TABLE IF NOT EXISTS permission_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id INTEGER NOT NULL,
  group_id INTEGER,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  default_level TEXT NOT NULL,
  available_levels TEXT NOT NULL,
  is_required INTEGER NOT NULL DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES permission_sections(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES permission_groups(id) ON DELETE SET NULL
);
`;

const createPermissionDependenciesTable = `
CREATE TABLE IF NOT EXISTS permission_dependencies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  permission_id INTEGER NOT NULL,
  depends_on_permission_id INTEGER NOT NULL,
  required_level TEXT DEFAULT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (permission_id) REFERENCES permission_items(id) ON DELETE CASCADE,
  FOREIGN KEY (depends_on_permission_id) REFERENCES permission_items(id) ON DELETE CASCADE,
  UNIQUE(permission_id, depends_on_permission_id)
);
`;

const createPermissionDependenciesIndex = `
CREATE INDEX IF NOT EXISTS idx_permission_dependencies_required
ON permission_dependencies (permission_id, depends_on_permission_id);
`;

const createGroupPermissionValuesTable = `
CREATE TABLE IF NOT EXISTS group_permission_values (
  group_id INTEGER NOT NULL,
  permission_id INTEGER NOT NULL,
  level TEXT NOT NULL,
  effective_level TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (group_id, permission_id),
  FOREIGN KEY (group_id) REFERENCES user_groups(id) ON DELETE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES permission_items(id) ON DELETE CASCADE
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

const tableExists = (tableName) => {
  return Boolean(
    db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(tableName)
  );
};

const serializeMetadata = (payload) => {
  if (!payload || typeof payload !== 'object' || !Object.keys(payload).length) {
    return null;
  }
  try {
    return JSON.stringify(payload);
  } catch (err) {
    console.error('⚠️ Konnte Migrations-Metadaten nicht serialisieren:', err.message);
    return null;
  }
};

db.exec(createEventLogsTable);
db.exec('CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp ON event_logs (timestamp DESC);');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_logs_category ON event_logs (category);');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON event_logs (event_type);');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_logs_entity ON event_logs (entity_type, entity_id);');
db.exec('CREATE INDEX IF NOT EXISTS idx_event_logs_context ON event_logs (context_type, context_id);');
console.log('✅ event_logs table ready');

if (tableExists('redeploy_logs')) {
  try {
    const legacyRows = db.prepare(`
      SELECT id, timestamp, stack_id, stack_name, status, message, endpoint, redeploy_type
      FROM redeploy_logs
      ORDER BY id ASC
    `).all();

    if (legacyRows.length) {
      const insertEventLog = db.prepare(`
        INSERT INTO event_logs (
          id,
          timestamp,
          category,
          event_type,
          action,
          status,
          entity_type,
          entity_id,
          entity_name,
          context_type,
          context_id,
          message,
          metadata
        ) VALUES (
          @id,
          @timestamp,
          'stack',
          @eventType,
          'redeploy',
          @status,
          'stack',
          @entityId,
          @entityName,
          @contextType,
          @contextId,
          @message,
          @metadata
        )
      `);

      const migrate = db.transaction((rows) => {
        rows.forEach((row) => {
          const contextType = row.endpoint !== null && row.endpoint !== undefined ? 'endpoint' : null;
          const contextId = contextType ? String(row.endpoint) : null;
          const metadataPayload = {
            origin: 'redeploy_logs'
          };
          if (row.redeploy_type) {
            metadataPayload.redeployType = row.redeploy_type;
          }
          if (contextId) {
            metadataPayload.endpointId = contextId;
          }
          insertEventLog.run({
            id: row.id,
            timestamp: row.timestamp,
            eventType: row.redeploy_type ?? null,
            status: row.status ?? null,
            entityId: row.stack_id !== undefined && row.stack_id !== null ? String(row.stack_id) : null,
            entityName: row.stack_name ?? null,
            contextType,
            contextId,
            message: row.message ?? null,
            metadata: serializeMetadata(metadataPayload)
          });
        });
      });

      migrate(legacyRows);
      console.log(`ℹ️ ${legacyRows.length} Einträge aus redeploy_logs migriert`);
    }

    db.exec('DROP TABLE redeploy_logs;');
    console.log('ℹ️ Alte Tabelle redeploy_logs entfernt');
  } catch (err) {
    console.error('⚠️ Migration von redeploy_logs fehlgeschlagen:', err.message);
  }
}

db.exec(createSettingsTable);
console.log('✅ settings table ready');

db.exec(createUsersTable);
console.log('✅ users table ready');

try {
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  const hasAvatarColor = userColumns.some((column) => column.name === 'avatar_color');
  if (!hasAvatarColor) {
    db.exec('ALTER TABLE users ADD COLUMN avatar_color TEXT');
    console.log('ℹ️ avatar_color column in Tabelle users hinzugefügt');
  }
  const userGroupColumns = db.prepare('PRAGMA table_info(user_groups)').all();
  const hasAvatarColorGroup = userGroupColumns.some((column) => column.name === 'avatar_color');
  if (!hasAvatarColorGroup) {
    db.exec('ALTER TABLE user_groups ADD COLUMN avatar_color TEXT');
    console.log('ℹ️ avatar_color column in Tabelle user_groups hinzugefügt');
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

db.exec(createPermissionSectionsTable);
console.log('✅ permission_sections table ready');

db.exec(createPermissionGroupsTable);
console.log('✅ permission_groups table ready');

db.exec(createPermissionItemsTable);
console.log('✅ permission_items table ready');

db.exec(createPermissionDependenciesTable);
db.exec(createPermissionDependenciesIndex);
console.log('✅ permission_dependencies table ready');

db.exec(createGroupPermissionValuesTable);
console.log('✅ group_permission_values table ready');

const permissionsSeeded = () => {
  try {
    const row = db.prepare('SELECT COUNT(*) as count FROM permission_sections').get();
    return row?.count > 0;
  } catch (err) {
    return false;
  }
};

const seedPermissions = () => {
  if (permissionsSeeded()) {
    console.log('ℹ️ permission structure already seeded');
    return;
  }

  const insertSection = db.prepare(`
    INSERT INTO permission_sections (key, title, sort_order, has_navigation_flag)
    VALUES (@key, @title, @sort_order, @has_navigation_flag)
  `);

  const insertGroup = db.prepare(`
    INSERT INTO permission_groups (section_id, key, title, sort_order)
    VALUES (@section_id, @key, @title, @sort_order)
  `);

  const insertItem = db.prepare(`
    INSERT INTO permission_items (
      section_id,
      group_id,
      key,
      label,
      sort_order,
      default_level,
      available_levels,
      is_required
    ) VALUES (
      @section_id,
      @group_id,
      @key,
      @label,
      @sort_order,
      @default_level,
      @available_levels,
      @is_required
    )
  `);

  const insertDependency = db.prepare(`
    INSERT INTO permission_dependencies (permission_id, depends_on_permission_id, required_level)
    VALUES (@permission_id, @depends_on_permission_id, @required_level)
  `);

  const sections = [
    {
      key: 'stacks',
      title: 'Stacks',
      sortOrder: 0,
      hasNavigation: 0,
      groups: [],
      items: [
        {
          key: 'stacks-redeploy-single',
          label: 'Redeploy einzeln',
          sortOrder: 0,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: []
        },
        {
          key: 'stacks-redeploy-selection',
          label: 'Redeploy Auswahl',
          sortOrder: 1,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: []
        },
        {
          key: 'stacks-redeploy-all',
          label: 'Redeploy Alle',
          sortOrder: 2,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: []
        }
      ]
    },
    {
      key: 'logs',
      title: 'Logs',
      sortOrder: 1,
      hasNavigation: 1,
      groups: [],
      items: [
        {
          key: 'logs-access',
          label: 'Bereich & Navigation',
          sortOrder: 0,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 1,
          dependencies: []
        },
        {
          key: 'logs-export',
          label: 'Logs Exportieren',
          sortOrder: 1,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'logs-access',
              requiredLevel: '!=none'
            }
          ]
        },
        {
          key: 'logs-delete',
          label: 'Logs löschen',
          sortOrder: 2,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'logs-access',
              requiredLevel: '!=none'
            }
          ]
        }
      ]
    },
    {
      key: 'users',
      title: 'Benutzer',
      sortOrder: 2,
      hasNavigation: 1,
      groups: [],
      items: [
        {
          key: 'users-access',
          label: 'Bereich & Navigation',
          sortOrder: 0,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 1,
          dependencies: []
        },
        {
          key: 'users-edit',
          label: 'Benutzer bearbeiten',
          sortOrder: 1,
          defaultLevel: 'read',
          levels: ['full', 'read'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'users-access',
              requiredLevel: '!=none'
            }
          ]
        },
        {
          key: 'users-delete',
          label: 'Benutzer löschen',
          sortOrder: 2,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'users-access',
              requiredLevel: '!=none'
            }
          ]
        },
        {
          key: 'users-security-phrase',
          label: 'Sicherheitsschlüssel',
          sortOrder: 3,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'users-access',
              requiredLevel: '!=none'
            }
          ]
        }
      ]
    },
    {
      key: 'user-groups',
      title: 'Benutzergruppen',
      sortOrder: 3,
      hasNavigation: 1,
      groups: [],
      items: [
        {
          key: 'user-groups-access',
          label: 'Bereich & Navigation',
          sortOrder: 0,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 1,
          dependencies: []
        },
        {
          key: 'user-groups-edit',
          label: 'Benutzergruppen bearbeiten',
          sortOrder: 1,
          defaultLevel: 'read',
          levels: ['full', 'read'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'user-groups-access',
              requiredLevel: '!=none'
            }
          ]
        },
        {
          key: 'user-groups-delete',
          label: 'Benutzergruppen löschen',
          sortOrder: 2,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 0,
          dependencies: [
            {
              dependsOnKey: 'user-groups-access',
              requiredLevel: '!=none'
            }
          ]
        }
      ]
    },
    {
      key: 'maintenance',
      title: 'Wartung',
      sortOrder: 4,
      hasNavigation: 1,
      groups: [
        {
          key: 'maintenance-server-group',
          title: 'Server & Endpoints',
          sortOrder: 0,
          items: [
            {
              key: 'maintenance-server-manage',
              label: 'Server/Endpoint-Sektion',
              sortOrder: 0,
              defaultLevel: 'none',
              levels: ['full', 'read', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                }
              ]
            },
            {
              key: 'maintenance-server-delete',
              label: 'Server/Endpoint löschen',
              sortOrder: 1,
              defaultLevel: 'none',
              levels: ['full', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                },
                {
                  dependsOnKey: 'maintenance-server-manage',
                  requiredLevel: '!=none'
                }
              ]
            }
          ]
        },
        {
          key: 'maintenance-portainer-group',
          title: 'Portainer',
          sortOrder: 1,
          items: [
            {
              key: 'maintenance-portainer',
              label: 'Portainer-Sektion',
              sortOrder: 0,
              defaultLevel: 'none',
              levels: ['full', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                }
              ]
            },
            {
              key: 'maintenance-ssh-update',
              label: 'SSH/Update-Skript',
              sortOrder: 1,
              defaultLevel: 'none',
              levels: ['full', 'read', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                },
                {
                  dependsOnKey: 'maintenance-portainer',
                  requiredLevel: '!=none'
                }
              ]
            },
            {
              key: 'maintenance-update',
              label: 'Update durchführen',
              sortOrder: 2,
              defaultLevel: 'none',
              levels: ['full', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                },
                {
                  dependsOnKey: 'maintenance-portainer',
                  requiredLevel: '!=none'
                }
              ]
            }
          ]
        },
        {
          key: 'maintenance-duplicates-group',
          title: 'Doppelte Stacks',
          sortOrder: 2,
          items: [
            {
              key: 'maintenance-duplicates',
              label: 'Doppelte Stacks',
              sortOrder: 0,
              defaultLevel: 'none',
              levels: ['full', 'read', 'none'],
              isRequired: 0,
              dependencies: [
                {
                  dependsOnKey: 'maintenance-access',
                  requiredLevel: '!=none'
                }
              ]
            }
          ]
        }
      ],
      items: [
        {
          key: 'maintenance-access',
          label: 'Bereich & Navigation',
          sortOrder: 0,
          defaultLevel: 'none',
          levels: ['full', 'none'],
          isRequired: 1,
          dependencies: []
        }
      ]
    }
  ];

  const itemKeyToId = new Map();

  const insertPermissions = db.transaction(() => {
    sections.forEach((section) => {
      const sectionResult = insertSection.run({
        key: section.key,
        title: section.title,
        sort_order: section.sortOrder,
        has_navigation_flag: section.hasNavigation ? 1 : 0
      });

      const sectionId = sectionResult.lastInsertRowid;

      const sectionItems = section.items ?? [];
      sectionItems.forEach((item, index) => {
        const itemResult = insertItem.run({
          section_id: sectionId,
          group_id: null,
          key: item.key,
          label: item.label,
          sort_order: item.sortOrder ?? index,
          default_level: item.defaultLevel,
          available_levels: JSON.stringify(item.levels),
          is_required: item.isRequired ? 1 : 0
        });
        itemKeyToId.set(item.key, itemResult.lastInsertRowid);
      });

      const groups = section.groups ?? [];
      groups.forEach((group, groupIdx) => {
        const groupResult = insertGroup.run({
          section_id: sectionId,
          key: group.key,
          title: group.title,
          sort_order: group.sortOrder ?? groupIdx
        });
        const groupId = groupResult.lastInsertRowid;
        const groupItems = group.items ?? [];
        groupItems.forEach((item, itemIdx) => {
          const itemResult = insertItem.run({
            section_id: sectionId,
            group_id: groupId,
            key: item.key,
            label: item.label,
            sort_order: item.sortOrder ?? itemIdx,
            default_level: item.defaultLevel,
            available_levels: JSON.stringify(item.levels),
            is_required: item.isRequired ? 1 : 0
          });
          itemKeyToId.set(item.key, itemResult.lastInsertRowid);
        });
      });
    });

    sections.forEach((section) => {
      const collectDependencies = (items = []) => {
        items.forEach((item) => {
          if (!item.dependencies || !item.dependencies.length) {
            return;
          }
          const permissionId = itemKeyToId.get(item.key);
          item.dependencies.forEach((dependency) => {
            const dependsId = itemKeyToId.get(dependency.dependsOnKey);
            if (!dependsId) {
              console.warn(`⚠️ dependency target ${dependency.dependsOnKey} not found for ${item.key}`);
              return;
            }
            insertDependency.run({
              permission_id: permissionId,
              depends_on_permission_id: dependsId,
              required_level: dependency.requiredLevel ?? null
            });
          });
        });
      };

      collectDependencies(section.items);
      (section.groups ?? []).forEach((group) => collectDependencies(group.items));
    });
  });

  insertPermissions();
  console.log('✅ permission structure seeded');
};

seedPermissions();

const ensureUserSecurityPhraseColumns = () => {
  const columns = db.prepare('PRAGMA table_info(users)').all();
  const columnNames = new Set(columns.map((column) => column.name));

  const addColumnIfMissing = (name, sql) => {
    if (!columnNames.has(name)) {
      db.exec(sql);
    }
  };

  addColumnIfMissing('security_phrase_content', 'ALTER TABLE users ADD COLUMN security_phrase_content TEXT');
  addColumnIfMissing('security_phrase_iv', 'ALTER TABLE users ADD COLUMN security_phrase_iv TEXT');
  addColumnIfMissing('security_phrase_tag', 'ALTER TABLE users ADD COLUMN security_phrase_tag TEXT');
  addColumnIfMissing('security_phrase_downloaded_at', 'ALTER TABLE users ADD COLUMN security_phrase_downloaded_at DATETIME');
};

ensureUserSecurityPhraseColumns();

const ensurePermissionDefaultLevels = () => {
  const desiredDefaults = [
    { key: 'stacks-redeploy-single', defaultLevel: 'none' },
    { key: 'stacks-redeploy-selection', defaultLevel: 'none' },
    { key: 'stacks-redeploy-all', defaultLevel: 'none' },
    { key: 'logs-access', defaultLevel: 'none' },
    { key: 'logs-export', defaultLevel: 'none' },
    { key: 'logs-delete', defaultLevel: 'none' },
    { key: 'users-access', defaultLevel: 'none' },
    { key: 'users-edit', defaultLevel: 'read' },
    { key: 'users-delete', defaultLevel: 'none' },
    { key: 'users-security-phrase', defaultLevel: 'none' },
    { key: 'user-groups-access', defaultLevel: 'none' },
    { key: 'user-groups-edit', defaultLevel: 'read' },
    { key: 'user-groups-delete', defaultLevel: 'none' },
    { key: 'maintenance-access', defaultLevel: 'none' },
    { key: 'maintenance-server-manage', defaultLevel: 'none' },
    { key: 'maintenance-server-delete', defaultLevel: 'none' },
    { key: 'maintenance-portainer', defaultLevel: 'none' },
    { key: 'maintenance-ssh-update', defaultLevel: 'none' },
    { key: 'maintenance-update', defaultLevel: 'none' },
    { key: 'maintenance-duplicates', defaultLevel: 'none' }
  ];

  const updateDefaultLevel = db.prepare(`
    UPDATE permission_items
    SET default_level = @default_level
    WHERE key = @key AND default_level != @default_level
  `);

  db.transaction(() => {
    desiredDefaults.forEach(({ key, defaultLevel }) => {
      updateDefaultLevel.run({ key, default_level: defaultLevel });
    });
  })();
};

ensurePermissionDefaultLevels();

db.exec(
  "DELETE FROM group_permission_values WHERE group_id IN (SELECT id FROM user_groups WHERE lower(name) = 'superuser')"
);

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
