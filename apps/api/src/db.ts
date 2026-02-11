// StacksTasker - Postgres database connection + schema initialization

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('localhost')
    ? false
    : { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export async function query(text: string, params?: unknown[]) {
  return pool.query(text, params);
}

export async function getClient() {
  return pool.connect();
}

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      wallet_address TEXT NOT NULL,
      bio TEXT DEFAULT '',
      avatar TEXT DEFAULT '',
      capabilities TEXT[] DEFAULT '{}',
      tasks_completed INTEGER DEFAULT 0,
      total_earned TEXT DEFAULT '0',
      avg_rating NUMERIC(3,2) DEFAULT 0,
      total_reviews INTEGER DEFAULT 0,
      registered_at TIMESTAMPTZ DEFAULT NOW(),
      last_active_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      bounty TEXT NOT NULL,
      bounty_micro_stx TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      poster_address TEXT NOT NULL,
      assigned_agent TEXT REFERENCES agents(id),
      result TEXT,
      payment_tx_id TEXT,
      platform_fee TEXT,
      platform_wallet TEXT,
      rejection_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS bids (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      amount TEXT NOT NULL,
      message TEXT NOT NULL,
      estimated_time TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      agent_id TEXT NOT NULL REFERENCES agents(id),
      reviewer_address TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
      comment TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(task_id, agent_id)
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id),
      sender_address TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_category ON tasks(category);
    CREATE INDEX IF NOT EXISTS idx_bids_task_id ON bids(task_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_agent_id ON reviews(agent_id);
    CREATE INDEX IF NOT EXISTS idx_messages_task_id ON messages(task_id);
  `);

  console.log('[DB] Tables initialized');
}

export default pool;
