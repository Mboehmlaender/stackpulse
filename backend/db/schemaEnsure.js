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
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: []
      },
      {
        key: 'stacks-redeploy-selection',
        label: 'Redeploy Auswahl',
        sortOrder: 1,
        defaultLevel: 'none',
        levels: ['full', 'none'],
        dependencies: []
      },
      {
        key: 'stacks-redeploy-all',
        label: 'Redeploy Alle',
        sortOrder: 2,
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
        dependencies: [
          { dependsOnKey: 'logs-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'logs-delete',
        label: 'Logs löschen',
        sortOrder: 2,
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
        dependencies: [
          { dependsOnKey: 'users-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'users-delete',
        label: 'Benutzer löschen',
        sortOrder: 2,
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
        dependencies: [
          { dependsOnKey: 'user-groups-access', requiredLevel: '!=none' }
        ]
      },
      {
        key: 'user-groups-delete',
        label: 'Benutzergruppen löschen',
        sortOrder: 2,
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
        defaultLevel: 'none',
        levels: ['full', 'none'],
        isRequired: 1,
        dependencies: []
      }
    ],
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
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' }
            ]
          },
          {
            key: 'maintenance-server-delete',
            label: 'Server/Endpoint löschen',
            sortOrder: 1,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
              { dependsOnKey: 'maintenance-server-manage', requiredLevel: '!=none' }
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
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' }
            ]
          },
          {
            key: 'maintenance-ssh-update',
            label: 'SSH/Update-Skript',
            sortOrder: 1,
            defaultLevel: 'none',
            levels: ['full', 'read', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
              { dependsOnKey: 'maintenance-portainer', requiredLevel: '!=none' }
            ]
          },
          {
            key: 'maintenance-update',
            label: 'Update durchführen',
            sortOrder: 2,
            defaultLevel: 'none',
            levels: ['full', 'none'],
            dependencies: [
              { dependsOnKey: 'maintenance-access', requiredLevel: '!=none' },
              { dependsOnKey: 'maintenance-portainer', requiredLevel: '!=none' }
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
    SELECT id, title, sort_order
    FROM permission_groups
    WHERE section_id = ? AND key = ?
    LIMIT 1
  `);
  const insertGroup = db.prepare(`
    INSERT INTO permission_groups (section_id, key, title, sort_order, created_at, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);
  const updateGroup = db.prepare(`
    UPDATE permission_groups
    SET title = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
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
      is_required,
      created_at,
      updated_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
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
      is_required = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
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
      const existingItem = selectItem.get(item.key);
      const sortOrder = typeof item.sortOrder === 'number' ? item.sortOrder : itemIdx;
      const levelOptions = Array.isArray(item.levels) && item.levels.length
        ? item.levels
        : ['full', 'read', 'none'];
      const availableLevels = JSON.stringify(levelOptions);
      const isRequired = item.isRequired ? 1 : 0;
      if (!existingItem) {
        const result = insertItem.run(
          sectionId,
          null,
          item.key,
          item.label,
          sortOrder,
          item.defaultLevel || 'none',
          availableLevels,
          isRequired
        );
        itemKeyToId.set(item.key, Number(result.lastInsertRowid));
        console.log(`ℹ️ Berechtigung ${item.key} angelegt`);
      } else {
        const hasChanges =
          existingItem.section_id !== sectionId ||
          existingItem.group_id !== null ||
          existingItem.label !== item.label ||
          (existingItem.sort_order ?? sortOrder) !== sortOrder ||
          existingItem.default_level !== (item.defaultLevel || 'none') ||
          existingItem.available_levels !== availableLevels ||
          Number(existingItem.is_required) !== isRequired;
        updateItem.run(
          sectionId,
          null,
          item.label,
          sortOrder,
          item.defaultLevel || 'none',
          availableLevels,
          isRequired,
          existingItem.id
        );
        itemKeyToId.set(item.key, existingItem.id);
        if (hasChanges) {
          console.log(`ℹ️ Berechtigung ${item.key} aktualisiert`);
        }
      }
    });

    const sectionGroups = Array.isArray(section.groups) ? section.groups : [];
    sectionGroups.forEach((group, groupIdx) => {
      const existingGroup = selectGroup.get(sectionId, group.key);
      const sortOrder = typeof group.sortOrder === 'number' ? group.sortOrder : groupIdx;
      let groupId;
      if (!existingGroup) {
        const result = insertGroup.run(sectionId, group.key, group.title, sortOrder);
        groupId = Number(result.lastInsertRowid);
        console.log(`ℹ️ Berechtigungs-Gruppe ${group.key} in Sektion ${section.key} angelegt`);
      } else {
        const hasGroupChanges =
          existingGroup.title !== group.title ||
          (existingGroup.sort_order ?? sortOrder) !== sortOrder;
        updateGroup.run(group.title, sortOrder, existingGroup.id);
        groupId = existingGroup.id;
        if (hasGroupChanges) {
          console.log(`ℹ️ Berechtigungs-Gruppe ${group.key} in Sektion ${section.key} aktualisiert`);
        }
      }
      const groupItems = Array.isArray(group.items) ? group.items : [];
      groupItems.forEach((item, itemIdx) => {
        const existingItem = selectItem.get(item.key);
        const itemSortOrder = typeof item.sortOrder === 'number' ? item.sortOrder : itemIdx;
        const levelOptions = Array.isArray(item.levels) && item.levels.length
          ? item.levels
          : ['full', 'read', 'none'];
        const availableLevels = JSON.stringify(levelOptions);
        const isRequired = item.isRequired ? 1 : 0;
        if (!existingItem) {
          const result = insertItem.run(
            sectionId,
            groupId,
            item.key,
            item.label,
            itemSortOrder,
            item.defaultLevel || 'none',
            availableLevels,
            isRequired
          );
          itemKeyToId.set(item.key, Number(result.lastInsertRowid));
           console.log(`ℹ️ Berechtigung ${item.key} in Gruppe ${group.key} angelegt`);
        } else {
          const hasChanges =
            existingItem.section_id !== sectionId ||
            existingItem.group_id !== groupId ||
            existingItem.label !== item.label ||
            (existingItem.sort_order ?? itemSortOrder) !== itemSortOrder ||
            existingItem.default_level !== (item.defaultLevel || 'none') ||
            existingItem.available_levels !== availableLevels ||
            Number(existingItem.is_required) !== isRequired;
          updateItem.run(
            sectionId,
            groupId,
            item.label,
            itemSortOrder,
            item.defaultLevel || 'none',
            availableLevels,
            isRequired,
            existingItem.id
          );
          itemKeyToId.set(item.key, existingItem.id);
          if (hasChanges) {
            console.log(`ℹ️ Berechtigung ${item.key} in Gruppe ${group.key} aktualisiert`);
          }
        }
      });
    });
  });

  PERMISSION_BLUEPRINT.forEach((section) => {
    const sectionItems = Array.isArray(section.items) ? section.items : [];
    sectionItems.forEach((item) => {
      const permissionId = itemKeyToId.get(item.key);
      if (!permissionId) return;
      (item.dependencies || []).forEach((dependency) => {
        const dependsId = itemKeyToId.get(dependency.dependsOnKey);
        if (!dependsId) return;
        const existing = selectDependency.get(permissionId, dependsId);
        const requiredLevel = dependency.requiredLevel ?? null;
        if (!existing) {
          insertDependency.run(permissionId, dependsId, requiredLevel);
          console.log(
            `ℹ️ Abhängigkeit ${item.key} -> ${dependency.dependsOnKey} angelegt`
          );
        } else if (existing.required_level !== requiredLevel) {
          updateDependency.run(requiredLevel, existing.id);
          console.log(
            `ℹ️ Abhängigkeit ${item.key} -> ${dependency.dependsOnKey} aktualisiert`
          );
        }
      });
    });

    const sectionGroups = Array.isArray(section.groups) ? section.groups : [];
    sectionGroups.forEach((group) => {
      const groupItems = Array.isArray(group.items) ? group.items : [];
      groupItems.forEach((item) => {
        const permissionId = itemKeyToId.get(item.key);
        if (!permissionId) return;
        (item.dependencies || []).forEach((dependency) => {
          const dependsId = itemKeyToId.get(dependency.dependsOnKey);
          if (!dependsId) return;
          const requiredLevel = dependency.requiredLevel ?? null;
          const existing = selectDependency.get(permissionId, dependsId);
        if (!existing) {
          insertDependency.run(permissionId, dependsId, requiredLevel);
          console.log(
            `ℹ️ Abhängigkeit ${item.key} -> ${dependency.dependsOnKey} angelegt`
          );
        } else if (existing.required_level !== requiredLevel) {
          updateDependency.run(requiredLevel, existing.id);
          console.log(
            `ℹ️ Abhängigkeit ${item.key} -> ${dependency.dependsOnKey} aktualisiert`
          );
        }
      });
    });
    });
  });
};

export const ensureDatabaseSchema = () => {
  try {
    const statements = loadBlueprintStatements();
    const tableDefinitions = parseTableDefinitions(statements);
    const indexDefinitions = parseIndexStatements(statements);

    ensureTablesAndColumns(tableDefinitions);
    ensureIndexes(indexDefinitions);
    ensurePermissionSeeds();
  } catch (error) {
    console.error('⚠️ Schema-Abgleich fehlgeschlagen:', error);
  }
};
