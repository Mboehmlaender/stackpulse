import { db } from './index.js';

const insertRedeployLogStmt = db.prepare(`
  INSERT INTO redeploy_logs (stack_id, stack_name, status, message, endpoint)
  VALUES (@stackId, @stackName, @status, @message, @endpoint)
`);

export function logRedeployEvent({ stackId, stackName, status, message = null, endpoint = null }) {
  try {
    insertRedeployLogStmt.run({
      stackId: String(stackId),
      stackName: stackName ?? 'Unknown',
      status,
      message,
      endpoint
    });
  } catch (err) {
    console.error('❌ Fehler beim Speichern des Redeploy-Logs:', err.message);
  }
}
