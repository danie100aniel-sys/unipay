'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const client = await db.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const dir = path.join(__dirname, 'migrations');

    const files = fs.readdirSync(dir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const done = await client.query(
        'SELECT 1 FROM _migrations WHERE name = $1',
        [file]
      );

      if (done.rows.length) {
        console.log('skipped', file);
        continue;
      }

      const sql = fs.readFileSync(
        path.join(dir, file),
        'utf8'
      );

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          'INSERT INTO _migrations (name) VALUES ($1)',
          [file]
        );

        await client.query('COMMIT');

        console.log('applied', file);
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }

    console.log('migrations complete');
  } finally {
    client.release();
    await db.end();
  }
}

main().catch(error => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
