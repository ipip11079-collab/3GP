import crypto from 'crypto';
import fs from 'fs';
import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import type {
  AssistantLanguage,
  DemoAccountState,
  DemoTradeRecord,
  MarketMode,
  MarketRegime,
  OwnerSettings,
  PredictionOutcome,
  QuotexReadinessProfile,
  RecordedPrediction,
  Timeframe,
} from '../src/types/trading.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, '3gp_master.db');
const LEGACY_JSON_PATH = path.join(DATA_DIR, 'predictions.json');

const EPHEMERAL_SECRET = crypto.randomBytes(32).toString('hex');

function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET?.trim();
  return envSecret && envSecret.length >= 16 ? envSecret : EPHEMERAL_SECRET;
}

let dbInstance: DatabaseSync | null = null;

function getDb(): DatabaseSync {
  if (dbInstance) return dbInstance;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const db = new DatabaseSync(DB_PATH);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS owner_auth (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      passcode_hash TEXT NOT NULL,
      passcode_salt TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS owner_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      owner_locked INTEGER NOT NULL DEFAULT 1,
      primary_market TEXT NOT NULL DEFAULT 'OTC',
      primary_timeframe TEXT NOT NULL DEFAULT '1m',
      default_pair_id TEXT NOT NULL DEFAULT 'BTC-USD',
      confidence_threshold INTEGER NOT NULL DEFAULT 58,
      auto_agent_enabled INTEGER NOT NULL DEFAULT 1,
      auto_board_enabled INTEGER NOT NULL DEFAULT 1,
      auto_pair_switch INTEGER NOT NULL DEFAULT 1,
      voice_enabled INTEGER NOT NULL DEFAULT 0,
      assistant_language TEXT NOT NULL DEFAULT 'en',
      demo_stake_amount REAL NOT NULL DEFAULT 25,
      default_payout_pct INTEGER NOT NULL DEFAULT 85,
      emergency_stopped INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id TEXT PRIMARY KEY,
      market TEXT NOT NULL,
      pair_id TEXT NOT NULL,
      pair_symbol TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      predicted_direction TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      precision INTEGER NOT NULL,
      candle_open_time INTEGER NOT NULL,
      expiry_time INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      feed_source TEXT NOT NULL,
      outcome TEXT NOT NULL,
      actual_close_price REAL,
      settled_at INTEGER,
      market_condition TEXT,
      indicator_signature TEXT,
      smc_summary TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_predictions_created
      ON predictions (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_predictions_dedup
      ON predictions (market, pair_id, timeframe, candle_open_time);

    CREATE TABLE IF NOT EXISTS demo_account (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      balance REAL NOT NULL DEFAULT 10000,
      initial_balance REAL NOT NULL DEFAULT 10000,
      currency TEXT NOT NULL DEFAULT 'USD',
      total_trades INTEGER NOT NULL DEFAULT 0,
      wins INTEGER NOT NULL DEFAULT 0,
      losses INTEGER NOT NULL DEFAULT 0,
      draws INTEGER NOT NULL DEFAULT 0,
      net_pnl REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS demo_trades (
      id TEXT PRIMARY KEY,
      pair_id TEXT NOT NULL,
      pair_symbol TEXT NOT NULL,
      market TEXT NOT NULL,
      timeframe TEXT NOT NULL,
      direction TEXT NOT NULL,
      stake REAL NOT NULL,
      payout_pct INTEGER NOT NULL,
      entry_price REAL NOT NULL,
      precision INTEGER NOT NULL,
      candle_open_time INTEGER NOT NULL,
      expiry_time INTEGER NOT NULL,
      outcome TEXT NOT NULL,
      pnl REAL NOT NULL DEFAULT 0,
      close_price REAL,
      created_at INTEGER NOT NULL,
      settled_at INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_demo_trades_created
      ON demo_trades (created_at DESC);

    CREATE TABLE IF NOT EXISTS quotex_readiness (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      full_name TEXT NOT NULL DEFAULT '',
      gmail_email TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      account_currency TEXT NOT NULL DEFAULT 'USD',
      id_document_ready INTEGER NOT NULL DEFAULT 0,
      address_proof_ready INTEGER NOT NULL DEFAULT 0,
      gmail_verified INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );
  `);

  // Safe schema upgrades for existing 3gp_master.db files
  const safeMigrations = [
    'ALTER TABLE owner_settings ADD COLUMN auto_trading_enabled INTEGER NOT NULL DEFAULT 0',
    'ALTER TABLE owner_settings ADD COLUMN birthday_theme INTEGER NOT NULL DEFAULT 1',
  ];
  for (const sql of safeMigrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists
    }
  }

  const now = Date.now();
  db.prepare(
    `INSERT OR IGNORE INTO owner_settings (
      id, owner_locked, primary_market, primary_timeframe, default_pair_id,
      confidence_threshold, auto_agent_enabled, auto_board_enabled,
      auto_pair_switch, auto_trading_enabled, birthday_theme, voice_enabled,
      assistant_language, demo_stake_amount, default_payout_pct, emergency_stopped, updated_at
    ) VALUES (1, 1, 'OTC', '1m', 'BTC-USD', 58, 1, 1, 1, 0, 1, 0, 'en', 25, 85, 0, ?)`,
  ).run(now);

  db.prepare(
    `INSERT OR IGNORE INTO demo_account (
      id, balance, initial_balance, currency, total_trades, wins, losses, draws, net_pnl, updated_at
    ) VALUES (1, 10000, 10000, 'USD', 0, 0, 0, 0, 0, ?)`,
  ).run(now);

  db.prepare(
    `INSERT OR IGNORE INTO quotex_readiness (
      id, full_name, gmail_email, country, account_currency,
      id_document_ready, address_proof_ready, gmail_verified, updated_at
    ) VALUES (1, '', '', '', 'USD', 0, 0, 0, ?)`,
  ).run(now);

  // One-time migration from legacy /data/predictions.json if DB predictions is empty
  const countRow = db
    .prepare('SELECT COUNT(*) AS cnt FROM predictions')
    .get() as { cnt: number };
  if (countRow.cnt === 0 && fs.existsSync(LEGACY_JSON_PATH)) {
    try {
      const raw = fs.readFileSync(LEGACY_JSON_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        const insertStmt = db.prepare(`
          INSERT OR IGNORE INTO predictions (
            id, market, pair_id, pair_symbol, timeframe, predicted_direction,
            confidence, entry_price, precision, candle_open_time, expiry_time,
            created_at, feed_source, outcome, actual_close_price, settled_at,
            market_condition, indicator_signature, smc_summary
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        for (const item of parsed as RecordedPrediction[]) {
          if (!item?.id || !item?.pairId) continue;
          insertStmt.run(
            String(item.id),
            String(item.market ?? 'OTC'),
            String(item.pairId),
            String(item.pairSymbol ?? item.pairId),
            String(item.timeframe ?? '1m'),
            String(item.predictedDirection ?? 'UP'),
            Number(item.confidence ?? 60),
            Number(item.entryPrice ?? 0),
            Number(item.precision ?? 5),
            Number(item.candleOpenTime ?? 0),
            Number(item.expiryTime ?? 0),
            Number(item.createdAt ?? Date.now()),
            String(item.feedSource ?? 'Kraken/Binance'),
            String(item.outcome ?? 'PENDING'),
            item.actualClosePrice !== null && item.actualClosePrice !== undefined
              ? Number(item.actualClosePrice)
              : null,
            item.settledAt !== null && item.settledAt !== undefined
              ? Number(item.settledAt)
              : null,
            item.marketCondition ?? null,
            item.indicatorSignature ?? null,
            item.smcSummary ?? null,
          );
        }
      }
    } catch {
      // Ignore corrupt legacy file
    }
  }

  dbInstance = db;
  return db;
}

function hashPasscode(passcode: string, saltHex?: string): { hashHex: string; saltHex: string } {
  const salt = saltHex ?? crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(passcode, salt, 32);
  return { hashHex: derived.toString('hex'), saltHex: salt };
}

function verifyScryptPasscode(passcode: string, expectedHashHex: string, saltHex: string): boolean {
  const { hashHex } = hashPasscode(passcode, saltHex);
  const a = Buffer.from(hashHex, 'hex');
  const b = Buffer.from(expectedHashHex, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function isEnvOwnerLockConfigured(): boolean {
  const envPass = process.env.OWNER_LOCK_PASSCODE?.trim() ?? '';
  return envPass.length >= 4;
}

export function isOwnerClaimed(): boolean {
  if (isEnvOwnerLockConfigured()) return true;
  const db = getDb();
  const row = db.prepare('SELECT id FROM owner_auth WHERE id = 1').get();
  return Boolean(row);
}

export function claimOwnerPasscode(passcode: string): { ok: boolean; error?: string } {
  if (isOwnerClaimed()) {
    return { ok: false, error: 'Owner lock passcode is already claimed.' };
  }
  const clean = passcode.trim();
  if (clean.length < 4 || clean.length > 64) {
    return { ok: false, error: 'Passcode must be 4 to 64 characters.' };
  }
  const { hashHex, saltHex } = hashPasscode(clean);
  const db = getDb();
  db.prepare(
    'INSERT INTO owner_auth (id, passcode_hash, passcode_salt, updated_at) VALUES (1, ?, ?, ?)',
  ).run(hashHex, saltHex, Date.now());
  return { ok: true };
}

export function verifyOwnerPasscode(passcode: string): boolean {
  const clean = passcode.trim();
  if (!clean) return false;

  const envPass = process.env.OWNER_LOCK_PASSCODE?.trim();
  if (envPass && envPass.length >= 4) {
    const a = crypto.createHash('sha256').update(clean).digest();
    const b = crypto.createHash('sha256').update(envPass).digest();
    return crypto.timingSafeEqual(a, b);
  }

  const db = getDb();
  const row = db
    .prepare('SELECT passcode_hash, passcode_salt FROM owner_auth WHERE id = 1')
    .get() as { passcode_hash: string; passcode_salt: string } | undefined;
  if (!row) return false;
  return verifyScryptPasscode(clean, row.passcode_hash, row.passcode_salt);
}

export function issueOwnerToken(): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + 30 * 60 * 1000; // 30m in-memory unlock session
  const payload = Buffer.from(JSON.stringify({ role: 'owner', exp: expiresAt })).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt };
}

export function verifyOwnerToken(authHeader?: string): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [payload, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', getSessionSecret())
    .update(payload)
    .digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8')) as {
      role?: string;
      exp?: number;
    };
    return parsed.role === 'owner' && typeof parsed.exp === 'number' && Date.now() <= parsed.exp;
  } catch {
    return false;
  }
}

export function getOwnerSettings(): OwnerSettings {
  const db = getDb();
  const row = db.prepare('SELECT * FROM owner_settings WHERE id = 1').get() as Record<
    string,
    unknown
  >;
  return {
    ownerLocked: Boolean(row.owner_locked),
    lockClaimed: isOwnerClaimed(),
    envLockActive: isEnvOwnerLockConfigured(),
    primaryMarket: row.primary_market === 'LIVE' ? 'LIVE' : 'OTC',
    primaryTimeframe: (['5s', '10s', '30s', '1m'].includes(String(row.primary_timeframe))
      ? String(row.primary_timeframe)
      : '1m') as Timeframe,
    defaultPairId: String(row.default_pair_id ?? 'BTC-USD'),
    confidenceThreshold: Math.max(52, Math.min(85, Number(row.confidence_threshold ?? 58))),
    autoAgentEnabled: Boolean(row.auto_agent_enabled),
    autoBoardEnabled: Boolean(row.auto_board_enabled),
    autoPairSwitch: Boolean(row.auto_pair_switch),
    autoTradingEnabled: Boolean(row.auto_trading_enabled),
    birthdayTheme: row.birthday_theme === undefined ? true : Boolean(row.birthday_theme),
    voiceEnabled: Boolean(row.voice_enabled),
    assistantLanguage: (['en', 'ur', 'hi'].includes(String(row.assistant_language))
      ? String(row.assistant_language)
      : 'en') as AssistantLanguage,
    demoStakeAmount: Math.max(1, Number(row.demo_stake_amount ?? 25)),
    defaultPayoutPct: Math.max(50, Math.min(98, Number(row.default_payout_pct ?? 85))),
    emergencyStopped: Boolean(row.emergency_stopped),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export function updateOwnerSettings(patch: Partial<OwnerSettings>): OwnerSettings {
  const current = getOwnerSettings();
  const next: OwnerSettings = {
    ...current,
    ownerLocked: patch.ownerLocked !== undefined ? Boolean(patch.ownerLocked) : current.ownerLocked,
    primaryMarket: patch.primaryMarket === 'LIVE' || patch.primaryMarket === 'OTC'
      ? patch.primaryMarket
      : current.primaryMarket,
    primaryTimeframe:
      patch.primaryTimeframe && ['5s', '10s', '30s', '1m'].includes(patch.primaryTimeframe)
        ? patch.primaryTimeframe
        : current.primaryTimeframe,
    defaultPairId:
      typeof patch.defaultPairId === 'string' && patch.defaultPairId.trim()
        ? patch.defaultPairId.trim()
        : current.defaultPairId,
    confidenceThreshold:
      patch.confidenceThreshold !== undefined
        ? Math.max(52, Math.min(85, Math.round(Number(patch.confidenceThreshold))))
        : current.confidenceThreshold,
    autoAgentEnabled:
      patch.autoAgentEnabled !== undefined ? Boolean(patch.autoAgentEnabled) : current.autoAgentEnabled,
    autoBoardEnabled:
      patch.autoBoardEnabled !== undefined ? Boolean(patch.autoBoardEnabled) : current.autoBoardEnabled,
    autoPairSwitch:
      patch.autoPairSwitch !== undefined ? Boolean(patch.autoPairSwitch) : current.autoPairSwitch,
    autoTradingEnabled:
      patch.autoTradingEnabled !== undefined
        ? Boolean(patch.autoTradingEnabled)
        : current.autoTradingEnabled,
    birthdayTheme:
      patch.birthdayTheme !== undefined ? Boolean(patch.birthdayTheme) : current.birthdayTheme,
    voiceEnabled:
      patch.voiceEnabled !== undefined ? Boolean(patch.voiceEnabled) : current.voiceEnabled,
    assistantLanguage:
      patch.assistantLanguage && ['en', 'ur', 'hi'].includes(patch.assistantLanguage)
        ? patch.assistantLanguage
        : current.assistantLanguage,
    demoStakeAmount:
      patch.demoStakeAmount !== undefined
        ? Math.max(1, Math.min(10000, Number(patch.demoStakeAmount)))
        : current.demoStakeAmount,
    defaultPayoutPct:
      patch.defaultPayoutPct !== undefined
        ? Math.max(50, Math.min(98, Math.round(Number(patch.defaultPayoutPct))))
        : current.defaultPayoutPct,
    emergencyStopped:
      patch.emergencyStopped !== undefined ? Boolean(patch.emergencyStopped) : current.emergencyStopped,
    updatedAt: Date.now(),
  };

  const db = getDb();
  db.prepare(`
    UPDATE owner_settings SET
      owner_locked = ?,
      primary_market = ?,
      primary_timeframe = ?,
      default_pair_id = ?,
      confidence_threshold = ?,
      auto_agent_enabled = ?,
      auto_board_enabled = ?,
      auto_pair_switch = ?,
      auto_trading_enabled = ?,
      birthday_theme = ?,
      voice_enabled = ?,
      assistant_language = ?,
      demo_stake_amount = ?,
      default_payout_pct = ?,
      emergency_stopped = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    next.ownerLocked ? 1 : 0,
    next.primaryMarket,
    next.primaryTimeframe,
    next.defaultPairId,
    next.confidenceThreshold,
    next.autoAgentEnabled ? 1 : 0,
    next.autoBoardEnabled ? 1 : 0,
    next.autoPairSwitch ? 1 : 0,
    next.autoTradingEnabled ? 1 : 0,
    next.birthdayTheme ? 1 : 0,
    next.voiceEnabled ? 1 : 0,
    next.assistantLanguage,
    next.demoStakeAmount,
    next.defaultPayoutPct,
    next.emergencyStopped ? 1 : 0,
    next.updatedAt,
  );
  return getOwnerSettings();
}

export function setRuntimeWorkspaceModes(patch: {
  autoTradingEnabled?: boolean;
  birthdayTheme?: boolean;
}): OwnerSettings {
  const current = getOwnerSettings();
  const nextAuto =
    patch.autoTradingEnabled !== undefined
      ? Boolean(patch.autoTradingEnabled)
      : current.autoTradingEnabled;
  const nextBirthday =
    patch.birthdayTheme !== undefined ? Boolean(patch.birthdayTheme) : current.birthdayTheme;
  const db = getDb();
  db.prepare(
    'UPDATE owner_settings SET auto_trading_enabled = ?, birthday_theme = ?, updated_at = ? WHERE id = 1',
  ).run(nextAuto ? 1 : 0, nextBirthday ? 1 : 0, Date.now());
  return getOwnerSettings();
}

export function setEmergencyStopState(stopped: boolean): OwnerSettings {
  const db = getDb();
  db.prepare('UPDATE owner_settings SET emergency_stopped = ?, updated_at = ? WHERE id = 1').run(
    stopped ? 1 : 0,
    Date.now(),
  );
  return getOwnerSettings();
}

function rowToPrediction(row: Record<string, unknown>): RecordedPrediction {
  return {
    id: String(row.id),
    market: (row.market === 'LIVE' ? 'LIVE' : 'OTC') as MarketMode,
    pairId: String(row.pair_id),
    pairSymbol: String(row.pair_symbol),
    timeframe: String(row.timeframe) as Timeframe,
    predictedDirection: (row.predicted_direction === 'DOWN' ? 'DOWN' : 'UP') as 'UP' | 'DOWN',
    confidence: Number(row.confidence),
    entryPrice: Number(row.entry_price),
    precision: Number(row.precision),
    candleOpenTime: Number(row.candle_open_time),
    expiryTime: Number(row.expiry_time),
    createdAt: Number(row.created_at),
    feedSource: String(row.feed_source),
    outcome: String(row.outcome) as PredictionOutcome,
    actualClosePrice:
      row.actual_close_price !== null && row.actual_close_price !== undefined
        ? Number(row.actual_close_price)
        : null,
    settledAt:
      row.settled_at !== null && row.settled_at !== undefined ? Number(row.settled_at) : null,
    marketCondition: (row.market_condition ? String(row.market_condition) : null) as
      | MarketRegime
      | null,
    indicatorSignature: row.indicator_signature ? String(row.indicator_signature) : null,
    smcSummary: row.smc_summary ? String(row.smc_summary) : null,
  };
}

export function loadPredictionsFromDb(limit: number = 500): RecordedPrediction[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM predictions ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowToPrediction);
}

export function findDuplicatePredictionForCandle(
  market: MarketMode,
  pairId: string,
  timeframe: Timeframe,
  candleOpenTime: number,
): RecordedPrediction | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM predictions
       WHERE market = ? AND pair_id = ? AND timeframe = ? AND candle_open_time = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(market, pairId, timeframe, candleOpenTime) as Record<string, unknown> | undefined;
  return row ? rowToPrediction(row) : null;
}

export function insertPredictionToDb(record: RecordedPrediction): RecordedPrediction[] {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO predictions (
      id, market, pair_id, pair_symbol, timeframe, predicted_direction,
      confidence, entry_price, precision, candle_open_time, expiry_time,
      created_at, feed_source, outcome, actual_close_price, settled_at,
      market_condition, indicator_signature, smc_summary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    record.id,
    record.market,
    record.pairId,
    record.pairSymbol,
    record.timeframe,
    record.predictedDirection,
    record.confidence,
    record.entryPrice,
    record.precision,
    record.candleOpenTime,
    record.expiryTime,
    record.createdAt,
    record.feedSource,
    record.outcome,
    record.actualClosePrice,
    record.settledAt,
    record.marketCondition ?? null,
    record.indicatorSignature ?? null,
    record.smcSummary ?? null,
  );
  return loadPredictionsFromDb();
}

export function updatePredictionSettlementInDb(
  id: string,
  actualClosePrice: number,
  outcome: PredictionOutcome,
  settledAt: number,
): void {
  const db = getDb();
  db.prepare(
    `UPDATE predictions
     SET actual_close_price = ?, outcome = ?, settled_at = ?
     WHERE id = ?`,
  ).run(actualClosePrice, outcome, settledAt, id);
}

export function clearPredictionsInDb(): void {
  const db = getDb();
  db.prepare('DELETE FROM predictions').run();
}

export function getDemoAccount(): DemoAccountState {
  const db = getDb();
  const row = db.prepare('SELECT * FROM demo_account WHERE id = 1').get() as Record<
    string,
    unknown
  >;
  return {
    balance: Number(row.balance ?? 10000),
    initialBalance: Number(row.initial_balance ?? 10000),
    currency: String(row.currency ?? 'USD'),
    totalTrades: Number(row.total_trades ?? 0),
    wins: Number(row.wins ?? 0),
    losses: Number(row.losses ?? 0),
    draws: Number(row.draws ?? 0),
    netPnl: Number(row.net_pnl ?? 0),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export function listDemoTrades(limit: number = 40): DemoTradeRecord[] {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM demo_trades ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id),
    pairId: String(row.pair_id),
    pairSymbol: String(row.pair_symbol),
    market: (row.market === 'LIVE' ? 'LIVE' : 'OTC') as MarketMode,
    timeframe: String(row.timeframe) as Timeframe,
    direction: (row.direction === 'DOWN' ? 'DOWN' : 'UP') as 'UP' | 'DOWN',
    stake: Number(row.stake),
    payoutPct: Number(row.payout_pct),
    entryPrice: Number(row.entry_price),
    precision: Number(row.precision),
    candleOpenTime: Number(row.candle_open_time),
    expiryTime: Number(row.expiry_time),
    outcome: String(row.outcome) as DemoTradeRecord['outcome'],
    pnl: Number(row.pnl ?? 0),
    closePrice:
      row.close_price !== null && row.close_price !== undefined ? Number(row.close_price) : null,
    createdAt: Number(row.created_at),
    settledAt:
      row.settled_at !== null && row.settled_at !== undefined ? Number(row.settled_at) : null,
  }));
}

export function placeDemoTradeInDb(trade: DemoTradeRecord): {
  ok: boolean;
  error?: string;
  account: DemoAccountState;
  trades: DemoTradeRecord[];
} {
  const db = getDb();
  const account = getDemoAccount();
  if (trade.stake <= 0 || trade.stake > account.balance) {
    return {
      ok: false,
      error: 'Demo investment exceeds available virtual balance.',
      account,
      trades: listDemoTrades(),
    };
  }

  const nextBalance = Number((account.balance - trade.stake).toFixed(2));
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('UPDATE demo_account SET balance = ?, total_trades = total_trades + 1, updated_at = ? WHERE id = 1').run(
      nextBalance,
      now,
    );
    db.prepare(`
      INSERT INTO demo_trades (
        id, pair_id, pair_symbol, market, timeframe, direction,
        stake, payout_pct, entry_price, precision, candle_open_time,
        expiry_time, outcome, pnl, close_price, created_at, settled_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      trade.id,
      trade.pairId,
      trade.pairSymbol,
      trade.market,
      trade.timeframe,
      trade.direction,
      trade.stake,
      trade.payoutPct,
      trade.entryPrice,
      trade.precision,
      trade.candleOpenTime,
      trade.expiryTime,
      trade.outcome,
      trade.pnl,
      trade.closePrice,
      trade.createdAt,
      trade.settledAt,
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  return {
    ok: true,
    account: getDemoAccount(),
    trades: listDemoTrades(),
  };
}

export function settleDemoTradeInDb(params: {
  id: string;
  outcome: 'WIN' | 'LOSS' | 'DRAW';
  pnl: number;
  totalCredit: number;
  closePrice: number;
  settledAt: number;
}): void {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db
      .prepare('SELECT outcome FROM demo_trades WHERE id = ?')
      .get(params.id) as { outcome: string } | undefined;
    if (!existing || existing.outcome !== 'PENDING') {
      db.exec('ROLLBACK');
      return;
    }

    db.prepare(
      `UPDATE demo_trades SET outcome = ?, pnl = ?, close_price = ?, settled_at = ? WHERE id = ?`,
    ).run(params.outcome, params.pnl, params.closePrice, params.settledAt, params.id);

    const winInc = params.outcome === 'WIN' ? 1 : 0;
    const lossInc = params.outcome === 'LOSS' ? 1 : 0;
    const drawInc = params.outcome === 'DRAW' ? 1 : 0;

    db.prepare(`
      UPDATE demo_account SET
        balance = ROUND(balance + ?, 2),
        wins = wins + ?,
        losses = losses + ?,
        draws = draws + ?,
        net_pnl = ROUND(net_pnl + ?, 2),
        updated_at = ?
      WHERE id = 1
    `).run(params.totalCredit, winInc, lossInc, drawInc, params.pnl, params.settledAt);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function resetDemoAccountInDb(initialBalance: number = 10000): {
  account: DemoAccountState;
  trades: DemoTradeRecord[];
} {
  const db = getDb();
  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM demo_trades').run();
    db.prepare(`
      UPDATE demo_account SET
        balance = ?, initial_balance = ?, total_trades = 0,
        wins = 0, losses = 0, draws = 0, net_pnl = 0, updated_at = ?
      WHERE id = 1
    `).run(initialBalance, initialBalance, now);
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return {
    account: getDemoAccount(),
    trades: [],
  };
}

export function findDuplicateDemoTradeForCandle(
  market: MarketMode,
  pairId: string,
  timeframe: Timeframe,
  candleOpenTime: number,
): DemoTradeRecord | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT * FROM demo_trades
       WHERE market = ? AND pair_id = ? AND timeframe = ? AND candle_open_time = ?
       ORDER BY created_at DESC LIMIT 1`,
    )
    .get(market, pairId, timeframe, candleOpenTime) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: String(row.id),
    pairId: String(row.pair_id),
    pairSymbol: String(row.pair_symbol),
    market: (row.market === 'LIVE' ? 'LIVE' : 'OTC') as MarketMode,
    timeframe: String(row.timeframe) as Timeframe,
    direction: (row.direction === 'DOWN' ? 'DOWN' : 'UP') as 'UP' | 'DOWN',
    stake: Number(row.stake),
    payoutPct: Number(row.payout_pct),
    entryPrice: Number(row.entry_price),
    precision: Number(row.precision),
    candleOpenTime: Number(row.candle_open_time),
    expiryTime: Number(row.expiry_time),
    outcome: String(row.outcome) as DemoTradeRecord['outcome'],
    pnl: Number(row.pnl ?? 0),
    closePrice:
      row.close_price !== null && row.close_price !== undefined ? Number(row.close_price) : null,
    createdAt: Number(row.created_at),
    settledAt:
      row.settled_at !== null && row.settled_at !== undefined ? Number(row.settled_at) : null,
  };
}

export function getQuotexReadiness(): QuotexReadinessProfile {
  const db = getDb();
  const row = db.prepare('SELECT * FROM quotex_readiness WHERE id = 1').get() as
    | Record<string, unknown>
    | undefined;
  if (!row) {
    return {
      fullName: '',
      gmailEmail: '',
      country: '',
      accountCurrency: 'USD',
      idDocumentReady: false,
      addressProofReady: false,
      gmailVerified: false,
      updatedAt: Date.now(),
    };
  }
  return {
    fullName: String(row.full_name ?? ''),
    gmailEmail: String(row.gmail_email ?? ''),
    country: String(row.country ?? ''),
    accountCurrency: String(row.account_currency ?? 'USD'),
    idDocumentReady: Boolean(row.id_document_ready),
    addressProofReady: Boolean(row.address_proof_ready),
    gmailVerified: Boolean(row.gmail_verified),
    updatedAt: Number(row.updated_at ?? Date.now()),
  };
}

export function saveQuotexReadiness(
  patch: Partial<QuotexReadinessProfile>,
): QuotexReadinessProfile {
  const current = getQuotexReadiness();
  const next: QuotexReadinessProfile = {
    fullName:
      typeof patch.fullName === 'string'
        ? patch.fullName.trim().slice(0, 80)
        : current.fullName,
    gmailEmail:
      typeof patch.gmailEmail === 'string'
        ? patch.gmailEmail.trim().slice(0, 120)
        : current.gmailEmail,
    country:
      typeof patch.country === 'string'
        ? patch.country.trim().slice(0, 64)
        : current.country,
    accountCurrency:
      typeof patch.accountCurrency === 'string' && patch.accountCurrency.trim()
        ? patch.accountCurrency.trim().toUpperCase().slice(0, 6)
        : current.accountCurrency,
    idDocumentReady:
      patch.idDocumentReady !== undefined
        ? Boolean(patch.idDocumentReady)
        : current.idDocumentReady,
    addressProofReady:
      patch.addressProofReady !== undefined
        ? Boolean(patch.addressProofReady)
        : current.addressProofReady,
    gmailVerified:
      patch.gmailVerified !== undefined
        ? Boolean(patch.gmailVerified)
        : current.gmailVerified,
    updatedAt: Date.now(),
  };

  const db = getDb();
  db.prepare(`
    UPDATE quotex_readiness SET
      full_name = ?,
      gmail_email = ?,
      country = ?,
      account_currency = ?,
      id_document_ready = ?,
      address_proof_ready = ?,
      gmail_verified = ?,
      updated_at = ?
    WHERE id = 1
  `).run(
    next.fullName,
    next.gmailEmail,
    next.country,
    next.accountCurrency,
    next.idDocumentReady ? 1 : 0,
    next.addressProofReady ? 1 : 0,
    next.gmailVerified ? 1 : 0,
    next.updatedAt,
  );
  return getQuotexReadiness();
}
