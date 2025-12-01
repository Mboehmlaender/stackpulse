import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './index.js';

const BLUEPRINT_FILENAME = 'dbs';
const PERMISSION_BLUEPRINT = [
  {
    key: 'stacks',
    title: 'Stacks',
    sortOrder: 0,
    hasNavigation: 0,
    items: [
      {
        key: 'stacks-redeploy-single',
        label: 'Redeploy einzeln',
        sortOrder: 0,
        global: false,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: []
      },
      {
        key: 'stacks-redeploy-selection',
        label: 'Redeploy Auswahl',
        sortOrder: 1,
        global: false,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: []
      },
      {
        key: 'stacks-redeploy-all',
        label: 'Redeploy Alle',
        sortOrder: 2,
        global: false,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: []
      }
    ]
  },
  {
    key: 'logs',
    title: 'Logs',
    sortOrder: 1,
    hasNavigation: 1,
    items: [
      {
        key: 'logs-access',
        label: 'Bereich & Navigation',
        sortOrder: 0,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        isRequired: 1,
        dependencies: []
      },
      {
        key: 'logs-export',
        label: 'Logs Exportieren',
        sortOrder: 1,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: [
          { dependsOnKey: 'logs-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'logs-delete',
        label: 'Logs löschen',
        sortOrder: 2,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: [
          { dependsOnKey: 'logs-access', requiredLevel: '!=none' }
        ]
      }
    ]
  },
  {
    key: 'users',
    title: 'Benutzer',
    sortOrder: 2,
    hasNavigation: 1,
    items: [
      {
        key: 'users-access',
        label: 'Bereich & Navigation',
        sortOrder: 0,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        isRequired: 1,
        dependencies: []
      },
      {
        key: 'users-edit',
        label: 'Benutzer bearbeiten',
        sortOrder: 1,
        global: true,
        defaultLevel: 'read',
        levels: ['full', 'read'],
        dependencies: [
          { dependsOnKey: 'users-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'users-delete',
        label: 'Benutzer löschen',
        sortOrder: 2,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: [
          { dependsOnKey: 'users-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'users-security-phrase',
        label: 'Sicherheitsschlüssel',
        sortOrder: 3,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: [
          { dependsOnKey: 'users-access', requiredLevel: '!=none' }
        ]
      }
    ]
  },
  {
    key: 'user-groups',
    title: 'Benutzergruppen',
    sortOrder: 3,
    hasNavigation: 1,
    items: [
      {
        key: 'user-groups-access',
        label: 'Bereich & Navigation',
        sortOrder: 0,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        isRequired: 1,
        dependencies: []
      },
      {
        key: 'user-groups-edit',
        label: 'Benutzergruppen bearbeiten',
        sortOrder: 1,
        global: true,
        defaultLevel: 'read',
        levels: ['full', 'read'],
        dependencies: [
          { dependsOnKey: 'user-groups-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'user-groups-delete',
        label: 'Benutzergruppen löschen',
        sortOrder: 2,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: [
          { dependsOnKey: 'user-groups-access', requiredLevel: '!=none' }
        ]
      }
    ]
  },
  {
    key: 'maintenance',
    title: 'Wartung',
    sortOrder: 4,
    hasNavigation: 1,
    items: [
      {
        key: 'maintenance-access',
        label: 'Bereich & Navigation',
        sortOrder: 0,
        global: true,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        isRequired: 1,
        dependencies: []
      }
    ],
    groups: [
      {
        key: 'maintenance-server-group',
        title: 'Server',
        sortOrder: 0,
        items: [
          {
            key: 'maintenance-server-manage',
            label: 'Server-Sektion',
            sortOrder: 0,
            global: true,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' }
            ]
          },
          {
            key: 'maintenance-server-edit',
            label: 'Server bearbeiten',
            sortOrder: 1,
            global: false,
            defaultLevel: 'none',
            levels: ['full', 'read', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
              { dependsOnKey: 'maintenance-server-manage', requiredLevel: '!=none' }
            ]
          },
          {
            key: 'maintenance-server-delete',
            label: 'Server löschen',
            sortOrder: 2,
            global: false,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
              { dependsOnKey: 'maintenance-server-manage', requiredLevel: 'full' },
              { dependsOnKey: 'maintenance-server-edit', requiredLevel: '=full' }
            ]
          }
        ],
        groups: [
          {
            key: 'maintenance-portainer-group',
            title: 'Portainer',
            sortOrder: 1,
            items: [
              {
                key: 'maintenance-ssh-update',
                label: 'SSH/Update-Skript',
                sortOrder: 0,
                global: false,
                defaultLevel: 'none',
                levels: ['full', 'read', 'none'],
                dependencies: [
                  { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
                  { dependsOnKey: 'maintenance-server-edit', requiredLevel: '!=none' }
                ]
              },
              {
                key: 'maintenance-update',
                label: 'Update durchführen',
                sortOrder: 1,
                global: false,
                defaultLevel: 'none',
                levels: ['full', 'none'],
                dependencies: [
                  { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
                  { dependsOnKey: 'maintenance-server-edit', requiredLevel: '!=none' }
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
                global: false,
                defaultLevel: 'none',
                levels: ['full', 'read', 'none'],
                dependencies: [
                  { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
                  { dependsOnKey: 'maintenance-server-edit', requiredLevel: '!=none' }
                ]
              }
            ]
          }
        ]
      },
      {
        key: 'maintenance-superuser-group',
        title: 'Superuser',
        sortOrder: 1,
        items: [
          {
            key: 'maintenance-superuser-delete',
            label: 'Superuser löschen',
            sortOrder: 0,
            global: true,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' }
            ]
          }
        ]
      },
      {
        key: 'maintenance-mtls-group',
        title: 'mTLS',
        sortOrder: 2,
        items: [
          {
            key: 'maintenance-mtls',
            label: 'mTLS Sektion',
            sortOrder: 0,
            global: true,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' }
            ]
          }
        ]
      }
    ]
  }
];

const TABLE_REGEX = /^CREATE TABLE\s+([^\s(]+)\s*\(/i;
const INDEX_REGEX = /^CREATE INDEX\s+([^\s(]+)\s+ON\s+([^\s(]+)\s*\(/i;
const COLUMN_SKIP_PREFIXES = ['PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK', 'CONSTRAINT'];

const normalizeIdentifier = (value) => value.replace(/`|"/g, '').trim();

const loadBlueprintStatements = () => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const filePath = path.join(__dirname, BLUEPRINT_FILENAME);
  const content = fs.readFileSync(filePath, 'utf8');
  const cleanContent = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('--'))
    .join('\n');

  return cleanContent
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);
};

const parseTableDefinitions = (statements) => {
  const tables = new Map();

  statements.forEach((statement) => {
    const match = statement.match(TABLE_REGEX);
    if (!match) {
      return;
    }

    const tableName = normalizeIdentifier(match[1]);
    const body = statement.slice(statement.indexOf('(') + 1, statement.lastIndexOf(')'));
    const lines = body
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    const columns = [];
    lines.forEach((line) => {
      const cleaned = line.replace(/,$/, '');
      const upper = cleaned.toUpperCase();
      if (COLUMN_SKIP_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
        return;
      }
      const [rawName, ...restParts] = cleaned.split(/\s+/);
      if (!rawName || restParts.length === 0) {
        return;
      }
      const columnName = normalizeIdentifier(rawName);
      const definition = restParts.join(' ');
      columns.push({ name: columnName, definition });
    });

    tables.set(tableName, {
      createStatement: statement,
      columns
    });
  });

  return tables;
};

const parseIndexStatements = (statements) => {
  const indexes = [];
  statements.forEach((statement) => {
    const match = statement.match(INDEX_REGEX);
    if (!match) {
      return;
    }
    const indexName = normalizeIdentifier(match[1]);
    indexes.push({
      name: indexName,
      statement
    });
  });
  return indexes;
};

const tableExists = (tableName) => {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1`)
    .get(tableName);
  return Boolean(result);
};

const dropDeprecatedArtifacts = () => {
  const deprecatedTables = [
    'user_endpoint_permission_overrides',
    'endpoints',
    'server_agents',
    'agent_tls_material',
    'agent_bootstrap_tokens'
  ];
  deprecatedTables.forEach((table) => {
    if (tableExists(table)) {
      db.exec(`DROP TABLE IF EXISTS ${table}`);
      console.log(`ℹ️ Veraltete Tabelle ${table} entfernt`);
    }
  });
};

const getExistingColumns = (tableName) => {
  const pragma = db.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(pragma.map((column) => column.name));
};

const indexExists = (indexName) => {
  const result = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ? LIMIT 1`)
    .get(indexName);
  return Boolean(result);
};

const ensureTablesAndColumns = (tables) => {
  tables.forEach(({ createStatement, columns }, tableName) => {
    if (!tableExists(tableName)) {
      const statementWithGuard = createStatement.replace(/^CREATE TABLE/i, 'CREATE TABLE IF NOT EXISTS');
      db.exec(`${statementWithGuard};`);
      console.log(`ℹ️ Tabelle ${tableName} angelegt`);
      return;
    }

    const existingColumns = getExistingColumns(tableName);
    const missingColumns = columns.filter((column) => !existingColumns.has(column.name));
    missingColumns.forEach((column) => {
      try {
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${column.name} ${column.definition};`);
        console.log(`ℹ️ Column ${column.name} added to ${tableName}`);
      } catch (error) {
        console.warn(`⚠️ Column ${column.name} could not be added to ${tableName}: ${error.message}`);
      }
    });
  });
};

const ensureIndexes = (indexes) => {
  indexes.forEach(({ name, statement }) => {
    if (indexExists(name)) {
      return;
    }
    const statementWithGuard = statement.replace(/^CREATE INDEX/i, 'CREATE INDEX IF NOT EXISTS');
    db.exec(`${statementWithGuard};`);
    console.log(`ℹ️ Index ${name} angelegt`);
  });
};

const ensurePermissionSeeds = () => {
  const selectSection = db.prepare(`
    SELECT id, title, sort_order, has_navigation_flag
    FROM permission_sections
    WHERE key = ?
    LIMIT 1
  `);
  const insertSection = db.prepare(`
    INSERT INTO permission_sections (key, title, sort_order, has_navigation_flag, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const updateSection = db.prepare(`
    UPDATE permission_sections
    SET title = ?, sort_order = ?, has_navigation_flag = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const selectGroup = db.prepare(`
    SELECT id, title, sort_order, parent_group_id
    FROM permission_groups
    WHERE section_id = ? AND key = ?
    LIMIT 1
  `);
  const insertGroup = db.prepare(`
    INSERT INTO permission_groups (section_id, parent_group_id, key, title, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const updateGroup = db.prepare(`
    UPDATE permission_groups
    SET title = ?, sort_order = ?, parent_group_id = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const deleteUnusedGroups = db.prepare(`
    DELETE FROM permission_groups
    WHERE key NOT IN (SELECT value FROM json_each(?))
  `);

  const selectItem = db.prepare(`
    SELECT
      id,
      section_id,
      group_id,
      label,
      sort_order,
      default_level,
      available_levels,
      is_global_scope,
      is_required
    FROM permission_items
    WHERE key = ?
    LIMIT 1
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
      is_global_scope,
      is_required,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
  const updateItem = db.prepare(`
    UPDATE permission_items
    SET
      section_id = ?,
      group_id = ?,
      label = ?,
      sort_order = ?,
      default_level = ?,
      available_levels = ?,
      is_global_scope = ?,
      is_required = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);
  const deleteUnusedItems = db.prepare(`
    DELETE FROM permission_items
    WHERE key NOT IN (SELECT value FROM json_each(?))
  `);
  const deleteOrphanDependencies = db.prepare(`
    DELETE FROM permission_dependencies
    WHERE permission_id NOT IN (SELECT id FROM permission_items)
       OR depends_on_permission_id NOT IN (SELECT id FROM permission_items)
  `);
  const deleteOrphanPermissionValues = db.prepare(`
    DELETE FROM group_permission_values
    WHERE permission_id NOT IN (SELECT id FROM permission_items)
  `);

  const selectDependency = db.prepare(`
    SELECT id, required_level
    FROM permission_dependencies
    WHERE permission_id = ? AND depends_on_permission_id = ?
    LIMIT 1
  `);
  const insertDependency = db.prepare(`
    INSERT INTO permission_dependencies (
      permission_id,
      depends_on_permission_id,
      required_level,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    )
  `);
  const updateDependency = db.prepare(`
    UPDATE permission_dependencies
    SET required_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  const itemKeyToId = new Map();
  const dependencyQueue = [];
  const itemKeys = new Set();
  const groupKeys = new Set();

  const upsertItem = ({ item, sectionId, groupId = null, sortOrder }) => {
    const existingItem = selectItem.get(item.key);
    const itemSortOrder = typeof sortOrder === 'number' ? sortOrder : 0;
    const levelOptions = Array.isArray(item.levels) && item.levels.length
      ? item.levels
      : ['full', 'read', 'none'];
    const availableLevels = JSON.stringify(levelOptions);
    const isRequired = item.isRequired ? 1 : 0;
    const isGlobal = item.global === false ? 0 : 1;
    const label = item.label || item.key || '';

    if (!existingItem) {
      const result = insertItem.run(
        sectionId,
        groupId,
        item.key,
        label,
        itemSortOrder,
        item.defaultLevel || 'none',
        availableLevels,
        isGlobal,
        isRequired
      );
      itemKeyToId.set(item.key, Number(result.lastInsertRowid));
      console.log(`ℹ️ Berechtigung ${item.key} ${groupId ? `in Gruppe ${groupId}` : ''} angelegt`);
    } else {
      const hasChanges =
        existingItem.section_id !== sectionId ||
        existingItem.group_id !== groupId ||
        existingItem.label !== label ||
        (existingItem.sort_order ?? itemSortOrder) !== itemSortOrder ||
        existingItem.default_level !== (item.defaultLevel || 'none') ||
        existingItem.available_levels !== availableLevels ||
        Number(existingItem.is_global_scope ?? 1) !== isGlobal ||
        Number(existingItem.is_required) !== isRequired;
      updateItem.run(
        sectionId,
        groupId,
        label,
        itemSortOrder,
        item.defaultLevel || 'none',
        availableLevels,
        isGlobal,
        isRequired,
        existingItem.id
      );
      itemKeyToId.set(item.key, existingItem.id);
      if (hasChanges) {
        console.log(`ℹ️ Berechtigung ${item.key} aktualisiert`);
      }
    }

    itemKeys.add(item.key);
    dependencyQueue.push({ itemKey: item.key, dependencies: item.dependencies || [] });
  };

  const processGroups = (groups, sectionId, parentGroupId = null) => {
    const list = Array.isArray(groups) ? groups : [];
    list.forEach((group, groupIdx) => {
      const sortOrder = typeof group.sortOrder === 'number' ? group.sortOrder : groupIdx;
      const existingGroup = selectGroup.get(sectionId, group.key);
      let groupId;
      if (!existingGroup) {
        const result = insertGroup.run(sectionId, parentGroupId, group.key, group.title, sortOrder);
        groupId = Number(result.lastInsertRowid);
        console.log(`ℹ️ Berechtigungs-Gruppe ${group.key} in Sektion ${sectionId} angelegt`);
      } else {
        const hasGroupChanges =
          existingGroup.title !== group.title ||
          (existingGroup.sort_order ?? sortOrder) !== sortOrder ||
          existingGroup.parent_group_id !== parentGroupId;
        updateGroup.run(group.title, sortOrder, parentGroupId, existingGroup.id);
        groupId = existingGroup.id;
        if (hasGroupChanges) {
          console.log(`ℹ️ Berechtigungs-Gruppe ${group.key} in Sektion ${sectionId} aktualisiert`);
        }
      }

      groupKeys.add(group.key);

      const groupItems = Array.isArray(group.items) ? group.items : [];
      groupItems.forEach((item, itemIdx) => {
        upsertItem({ item, sectionId, groupId, sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : itemIdx });
      });

      if (group.groups) {
        processGroups(group.groups, sectionId, groupId);
      }
    });
  };

  PERMISSION_BLUEPRINT.forEach((section, sectionIndex) => {
    const existingSection = selectSection.get(section.key);
    let sectionId;
    if (!existingSection) {
      const result = insertSection.run(
        section.key,
        section.title,
        section.sortOrder ?? sectionIndex,
        section.hasNavigation ? 1 : 0
      );
      sectionId = Number(result.lastInsertRowid);
      console.log(`ℹ️ Berechtigungs-Sektion ${section.key} angelegt`);
    } else {
      updateSection.run(
        section.title,
        section.sortOrder ?? sectionIndex,
        section.hasNavigation ? 1 : 0,
        existingSection.id
      );
      sectionId = existingSection.id;
      if (
        existingSection.title !== section.title ||
        (existingSection.sort_order ?? sectionIndex) !== (section.sortOrder ?? sectionIndex) ||
        Number(existingSection.has_navigation_flag) !== (section.hasNavigation ? 1 : 0)
      ) {
        console.log(`ℹ️ Berechtigungs-Sektion ${section.key} aktualisiert`);
      }
    }

    const sectionItems = Array.isArray(section.items) ? section.items : [];
    sectionItems.forEach((item, itemIdx) => {
      upsertItem({ item, sectionId, groupId: null, sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : itemIdx });
    });

    processGroups(section.groups, sectionId, null);
  });

  dependencyQueue.forEach(({ itemKey, dependencies }) => {
    const permissionId = itemKeyToId.get(itemKey);
    if (!permissionId) return;
    dependencies.forEach((dependency) => {
      const dependsId = itemKeyToId.get(dependency.dependsOnKey);
      if (!dependsId) return;
      const existing = selectDependency.get(permissionId, dependsId);
      const requiredLevel = dependency.requiredLevel ?? null;
      if (!existing) {
        insertDependency.run(permissionId, dependsId, requiredLevel);
        console.log(`ℹ️ Abhängigkeit ${itemKey} -> ${dependency.dependsOnKey} angelegt`);
      } else if (existing.required_level !== requiredLevel) {
        updateDependency.run(requiredLevel, existing.id);
        console.log(`ℹ️ Abhängigkeit ${itemKey} -> ${dependency.dependsOnKey} aktualisiert`);
      }
    });
  });

  // Cleanup obsolete entries
  if (itemKeys.size > 0) {
    const itemKeyJson = JSON.stringify(Array.from(itemKeys));
    deleteOrphanDependencies.run();
    deleteOrphanPermissionValues.run();
    deleteUnusedItems.run(itemKeyJson);
  }
  if (groupKeys.size > 0) {
    const groupKeyJson = JSON.stringify(Array.from(groupKeys));
    deleteUnusedGroups.run(groupKeyJson);
  }
};

export const ensureDatabaseSchema = () => {
  try {
    const statements = loadBlueprintStatements();
    const tableDefinitions = parseTableDefinitions(statements);
    const indexDefinitions = parseIndexStatements(statements);

    dropDeprecatedArtifacts();
    ensureTablesAndColumns(tableDefinitions);
    ensureIndexes(indexDefinitions);
    ensurePermissionSeeds();
  } catch (error) {
    console.error('⚠️ Schema-Abgleich fehlgeschlagen:', error);
  }
};
