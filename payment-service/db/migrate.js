'use strict';
/* Runs every .sql file in db/migrations/ in filename order. Tracks in _migrations. */
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  await db.query(`CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, 'migrations');
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) {
    const done = await db.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
    if (done.rows.length) continue;
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO _migrations (name) VALUES ($1)', [f]);
      await db.query('COMMIT');
      console.log('applied', f);
    } catch (e) { await db.query('ROLLBACK'); throw e; }
  }
  console.log('migrations complete');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
