import { ensureDatabaseSchema } from './schemaEnsure.js';

const run = async () => {
  try {
    ensureDatabaseSchema();
    console.log('✅ Datenbankschema abgeglichen.');
    process.exit(0);
  } catch (error) {
    console.error('⚠️ Schema-Abgleich fehlgeschlagen:', error);
    process.exit(1);
  }
};

run();
