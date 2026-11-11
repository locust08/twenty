const COLUMNS =
  'id,leadId,state,reason,assignmentKey,recipient,attempts,nextAttempt,createdAt,messageId,messageHash';
const create = (database, table) =>
  database.exec(
    `CREATE TABLE ${table}(id TEXT PRIMARY KEY,leadId TEXT NOT NULL,state TEXT NOT NULL,reason TEXT,assignmentKey TEXT,recipient TEXT,attempts INTEGER NOT NULL DEFAULT 0,nextAttempt INTEGER NOT NULL DEFAULT 0,createdAt INTEGER NOT NULL,messageId TEXT,messageHash TEXT,kind TEXT NOT NULL DEFAULT 'initial-assignment' CHECK(kind IN ('initial-assignment','commercial-awaiting-assignment')),UNIQUE(leadId,kind))`,
  );
export const initializeJobs = (database) => {
  const columns = database.prepare('PRAGMA table_info(jobs)').all();
  database.exec('BEGIN IMMEDIATE');
  try {
    if (!columns.length) create(database, 'jobs');
    else if (!columns.some((column) => column.name === 'kind')) {
      create(database, 'jobs_next');
      database.exec(
        `INSERT INTO jobs_next(${COLUMNS},kind) SELECT ${COLUMNS},'initial-assignment' FROM jobs; DROP TABLE jobs; ALTER TABLE jobs_next RENAME TO jobs;`,
      );
    }
    database
      .prepare(
        "INSERT OR IGNORE INTO settings(key,value) VALUES('commercial-alert-cutoff',?)",
      )
      .run(new Date().toISOString());
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};
