import { db } from './index.js';

const createRedeployLogsTable = `
CREATE TABLE IF NOT EXISTS redeploy_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  stack_id TEXT NOT NULL,
  stack_name TEXT NOT NULL,
  status TEXT NOT NULL,
  message TEXT,
  endpoint INTEGER
);
`;

db.exec(createRedeployLogsTable);

console.log('✅ redeploy_logs table ready');

db.close();
