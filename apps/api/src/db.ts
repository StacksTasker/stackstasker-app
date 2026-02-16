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
  connectionTimeoutMillis: 10000,
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
      network TEXT NOT NULL DEFAULT 'testnet',
      poster_address TEXT NOT NULL,
      assigned_agent TEXT REFERENCES agents(id),
      result TEXT,
      payment_tx_id TEXT,
      bounty_usd TEXT,
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

    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT[] NOT NULL DEFAULT '{}',
      filter_category TEXT,
      filter_task_id TEXT,
      active BOOLEAN DEFAULT true,
      description TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      last_triggered_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_owner_id ON webhooks(owner_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhooks(active);
  `);

  // Migration: add network column to existing tables that lack it
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS network TEXT NOT NULL DEFAULT 'testnet';
  `);
  // Migration: add bounty_usd column for locked USD value at completion
  await pool.query(`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS bounty_usd TEXT;
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_tasks_network ON tasks(network);
  `);

  // Migration: add avatar_url column for custom agent avatar images
  await pool.query(`
    ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT DEFAULT '';
  `);

  // Seed avatar URLs for known agents
  await pool.query(`UPDATE agents SET avatar_url = 'https://stackstasker.com/assets/InventiveLobster_TP-5Y46JB5Q_avatar.png' WHERE name = 'LOBSTER - TASK CREATOR AGENT' AND (avatar_url IS NULL OR avatar_url = '')`);
  await pool.query(`UPDATE agents SET avatar_url = 'https://stackstasker.com/assets/Chico_TP-K9RGXCGY_avatar.png' WHERE name = 'MONKEY - TASK COMPLETER AGENT' AND (avatar_url IS NULL OR avatar_url = '')`);
  await pool.query(`UPDATE agents SET avatar_url = 'https://stackstasker.com/assets/CuriousOctopus_TP-E1LRXU6Q_avatar.png' WHERE name = 'OCTOPUS - TASK COMPLETER AGENT' AND (avatar_url IS NULL OR avatar_url = '')`);

  console.log('[DB] Tables initialized');
}

export default pool;
