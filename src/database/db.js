const path = require('path');
const fs = require('fs');
const config = require('../config');

class DatabaseAdapter {
  constructor() {
    this.isPostgres = !!config.databaseUrl;
    this.sqliteDb = null;
    this.pgPool = null;
  }

  async init() {
    if (this.isPostgres) {
      const { Pool } = require('pg');
      this.pgPool = new Pool({
        connectionString: config.databaseUrl,
        ssl: config.databaseUrl.includes('localhost') ? false : { rejectUnauthorized: false }
      });
      await this.initPostgresSchema();
      console.log('✅ Connected to PostgreSQL Database');
    } else {
      const Database = require('better-sqlite3');
      const dbDir = path.join(__dirname, '../../data');
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
      const dbPath = path.join(dbDir, 'bot.db');
      this.sqliteDb = new Database(dbPath);
      this.sqliteDb.pragma('journal_mode = WAL');
      this.initSqliteSchema();
      console.log(`✅ Connected to SQLite Database (${dbPath})`);
    }
  }

  initSqliteSchema() {
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        balance REAL DEFAULT 0.0,
        total_earned REAL DEFAULT 0.0,
        total_withdrawn REAL DEFAULT 0.0,
        referred_by INTEGER,
        referral_count INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        description TEXT,
        channel_id TEXT NOT NULL,
        channel_link TEXT NOT NULL,
        reward REAL NOT NULL,
        max_users INTEGER DEFAULT 0,
        completed_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        task_id INTEGER NOT NULL,
        reward REAL NOT NULL,
        completed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, task_id)
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        amount REAL NOT NULL,
        method TEXT NOT NULL,
        account_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_note TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        processed_at DATETIME
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );
    `);

    // Migrations for saved BDT and USDT wallet accounts & referral tracking (SQLite)
    const walletCols = [
      'bdt_account_1_type',
      'bdt_account_1_number',
      'bdt_account_2_type',
      'bdt_account_2_number',
      'binance_id'
    ];
    for (const col of walletCols) {
      try {
        this.sqliteDb.prepare(`ALTER TABLE users ADD COLUMN ${col} TEXT`).run();
      } catch (e) {}
    }
    try {
      this.sqliteDb.prepare('ALTER TABLE users ADD COLUMN is_referral_rewarded INTEGER DEFAULT 0').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('ALTER TABLE users ADD COLUMN referral_code TEXT').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('ALTER TABLE users ADD COLUMN pending_balance REAL DEFAULT 0.0').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare("ALTER TABLE user_tasks ADD COLUMN status TEXT DEFAULT 'holding'").run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('ALTER TABLE user_tasks ADD COLUMN channel_id TEXT').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('ALTER TABLE user_tasks ADD COLUMN unlock_at DATETIME').run();
    } catch (e) {}
    try {
      this.sqliteDb.prepare('ALTER TABLE user_tasks ADD COLUMN approved_at DATETIME').run();
    } catch (e) {}

    // Dedicated User Wallets Table (Supports bKash, Nagad, Rocket, Binance)
    try {
      this.sqliteDb.exec(`
        CREATE TABLE IF NOT EXISTS user_wallets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          wallet_type TEXT NOT NULL,
          provider TEXT NOT NULL,
          account_number TEXT NOT NULL,
          is_default INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);

      // Migration: import legacy accounts from users table if any
      const existing1 = this.sqliteDb.prepare("SELECT id, bdt_account_1_type, bdt_account_1_number FROM users WHERE bdt_account_1_number IS NOT NULL AND bdt_account_1_number != ''").all();
      for (const u of existing1) {
        const has = this.sqliteDb.prepare("SELECT id FROM user_wallets WHERE user_id = ? AND account_number = ?").get(u.id, u.bdt_account_1_number);
        if (!has) {
          this.sqliteDb.prepare("INSERT INTO user_wallets (user_id, wallet_type, provider, account_number, is_default) VALUES (?, 'BDT', ?, ?, 1)").run(u.id, u.bdt_account_1_type || 'bKash', u.bdt_account_1_number);
        }
      }
      const existing2 = this.sqliteDb.prepare("SELECT id, bdt_account_2_type, bdt_account_2_number FROM users WHERE bdt_account_2_number IS NOT NULL AND bdt_account_2_number != ''").all();
      for (const u of existing2) {
        const has = this.sqliteDb.prepare("SELECT id FROM user_wallets WHERE user_id = ? AND account_number = ?").get(u.id, u.bdt_account_2_number);
        if (!has) {
          this.sqliteDb.prepare("INSERT INTO user_wallets (user_id, wallet_type, provider, account_number, is_default) VALUES (?, 'BDT', ?, ?, 0)").run(u.id, u.bdt_account_2_type || 'Nagad', u.bdt_account_2_number);
        }
      }
      const existingUsdt = this.sqliteDb.prepare("SELECT id, binance_id FROM users WHERE binance_id IS NOT NULL AND binance_id != ''").all();
      for (const u of existingUsdt) {
        const has = this.sqliteDb.prepare("SELECT id FROM user_wallets WHERE user_id = ? AND account_number = ?").get(u.id, u.binance_id);
        if (!has) {
          this.sqliteDb.prepare("INSERT INTO user_wallets (user_id, wallet_type, provider, account_number, is_default) VALUES (?, 'USDT', 'Binance Pay', ?, 1)").run(u.id, u.binance_id);
        }
      }
    } catch (e) {
      console.warn('user_wallets migration notice:', e.message);
    }
  }

  async initPostgresSchema() {
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGINT PRIMARY KEY,
        username TEXT,
        first_name TEXT,
        last_name TEXT,
        balance NUMERIC(10, 2) DEFAULT 0.0,
        total_earned NUMERIC(10, 2) DEFAULT 0.0,
        total_withdrawn NUMERIC(10, 2) DEFAULT 0.0,
        referred_by BIGINT,
        referral_count INTEGER DEFAULT 0,
        is_banned INTEGER DEFAULT 0,
        bdt_account_1_type TEXT,
        bdt_account_1_number TEXT,
        bdt_account_2_type TEXT,
        bdt_account_2_number TEXT,
        binance_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id SERIAL PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        channel_id TEXT NOT NULL,
        channel_link TEXT NOT NULL,
        reward NUMERIC(10, 2) NOT NULL,
        max_users INTEGER DEFAULT 0,
        completed_count INTEGER DEFAULT 0,
        is_active INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_tasks (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        task_id INTEGER NOT NULL,
        reward NUMERIC(10, 2) NOT NULL,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, task_id)
      );

      CREATE TABLE IF NOT EXISTS withdrawals (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        method TEXT NOT NULL,
        account_number TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        admin_note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT
      );

      CREATE TABLE IF NOT EXISTS user_wallets (
        id SERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL,
        wallet_type TEXT NOT NULL,
        provider TEXT NOT NULL,
        account_number TEXT NOT NULL,
        is_default INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      ALTER TABLE users ADD COLUMN IF NOT EXISTS bdt_account_1_type TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bdt_account_1_number TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bdt_account_2_type TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS bdt_account_2_number TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS binance_id TEXT;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_referral_rewarded INTEGER DEFAULT 0;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_balance NUMERIC(10, 2) DEFAULT 0.0;
      ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'holding';
      ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS channel_id TEXT;
      ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS unlock_at TIMESTAMP;
      ALTER TABLE user_tasks ADD COLUMN IF NOT EXISTS approved_at TIMESTAMP;
    `);
  }

  async addUserWallet(userId, { wallet_type, provider, account_number }) {
    const uid = Number(userId);
    const wType = (wallet_type || 'BDT').toUpperCase();
    const prov = provider || 'bKash';
    const accNum = String(account_number).trim();

    if (this.isPostgres) {
      const countRes = await this.pgPool.query(
        'SELECT COUNT(*) FROM user_wallets WHERE user_id = $1 AND wallet_type = $2',
        [uid, wType]
      );
      const isDefault = parseInt(countRes.rows[0].count, 10) === 0 ? 1 : 0;

      const res = await this.pgPool.query(
        `INSERT INTO user_wallets (user_id, wallet_type, provider, account_number, is_default)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [uid, wType, prov, accNum, isDefault]
      );
      await this.syncLegacyWallets(uid);
      return res.rows[0];
    } else {
      const count = this.sqliteDb.prepare(
        'SELECT COUNT(*) as count FROM user_wallets WHERE user_id = ? AND wallet_type = ?'
      ).get(uid, wType);
      const isDefault = (count && count.count === 0) ? 1 : 0;

      const info = this.sqliteDb.prepare(
        `INSERT INTO user_wallets (user_id, wallet_type, provider, account_number, is_default)
         VALUES (?, ?, ?, ?, ?)`
      ).run(uid, wType, prov, accNum, isDefault);

      await this.syncLegacyWallets(uid);
      return this.sqliteDb.prepare('SELECT * FROM user_wallets WHERE id = ?').get(info.lastInsertRowid);
    }
  }

  async getUserWallets(userId, walletType = null) {
    const uid = Number(userId);
    if (this.isPostgres) {
      if (walletType) {
        const res = await this.pgPool.query(
          'SELECT * FROM user_wallets WHERE user_id = $1 AND wallet_type = $2 ORDER BY is_default DESC, id ASC',
          [uid, walletType.toUpperCase()]
        );
        return res.rows;
      } else {
        const res = await this.pgPool.query(
          'SELECT * FROM user_wallets WHERE user_id = $1 ORDER BY is_default DESC, id ASC',
          [uid]
        );
        return res.rows;
      }
    } else {
      if (walletType) {
        return this.sqliteDb.prepare(
          'SELECT * FROM user_wallets WHERE user_id = ? AND wallet_type = ? ORDER BY is_default DESC, id ASC'
        ).all(uid, walletType.toUpperCase());
      } else {
        return this.sqliteDb.prepare(
          'SELECT * FROM user_wallets WHERE user_id = ? ORDER BY is_default DESC, id ASC'
        ).all(uid);
      }
    }
  }

  async deleteUserWallet(walletId, userId) {
    const wid = Number(walletId);
    const uid = Number(userId);
    if (this.isPostgres) {
      const delRes = await this.pgPool.query(
        'DELETE FROM user_wallets WHERE id = $1 AND user_id = $2 RETURNING *',
        [wid, uid]
      );
      if (delRes.rows.length > 0 && delRes.rows[0].is_default === 1) {
        const next = await this.pgPool.query(
          'SELECT id FROM user_wallets WHERE user_id = $1 AND wallet_type = $2 ORDER BY id ASC LIMIT 1',
          [uid, delRes.rows[0].wallet_type]
        );
        if (next.rows.length > 0) {
          await this.pgPool.query('UPDATE user_wallets SET is_default = 1 WHERE id = $1', [next.rows[0].id]);
        }
      }
      await this.syncLegacyWallets(uid);
      return true;
    } else {
      const wallet = this.sqliteDb.prepare('SELECT * FROM user_wallets WHERE id = ? AND user_id = ?').get(wid, uid);
      if (wallet) {
        this.sqliteDb.prepare('DELETE FROM user_wallets WHERE id = ? AND user_id = ?').run(wid, uid);
        if (wallet.is_default === 1) {
          const next = this.sqliteDb.prepare(
            'SELECT id FROM user_wallets WHERE user_id = ? AND wallet_type = ? ORDER BY id ASC LIMIT 1'
          ).get(uid, wallet.wallet_type);
          if (next) {
            this.sqliteDb.prepare('UPDATE user_wallets SET is_default = 1 WHERE id = ?').run(next.id);
          }
        }
        await this.syncLegacyWallets(uid);
        return true;
      }
      return false;
    }
  }

  async setDefaultUserWallet(walletId, userId) {
    const wid = Number(walletId);
    const uid = Number(userId);
    if (this.isPostgres) {
      const wRes = await this.pgPool.query('SELECT * FROM user_wallets WHERE id = $1 AND user_id = $2', [wid, uid]);
      if (wRes.rows.length > 0) {
        const wType = wRes.rows[0].wallet_type;
        await this.pgPool.query('UPDATE user_wallets SET is_default = 0 WHERE user_id = $1 AND wallet_type = $2', [uid, wType]);
        await this.pgPool.query('UPDATE user_wallets SET is_default = 1 WHERE id = $1', [wid]);
        await this.syncLegacyWallets(uid);
        return true;
      }
      return false;
    } else {
      const wallet = this.sqliteDb.prepare('SELECT * FROM user_wallets WHERE id = ? AND user_id = ?').get(wid, uid);
      if (wallet) {
        this.sqliteDb.prepare('UPDATE user_wallets SET is_default = 0 WHERE user_id = ? AND wallet_type = ?').run(uid, wallet.wallet_type);
        this.sqliteDb.prepare('UPDATE user_wallets SET is_default = 1 WHERE id = ?').run(wid);
        await this.syncLegacyWallets(uid);
        return true;
      }
      return false;
    }
  }

  async syncLegacyWallets(userId) {
    try {
      const wallets = await this.getUserWallets(userId);
      const bdtWallets = wallets.filter(w => w.wallet_type === 'BDT');
      const usdtWallets = wallets.filter(w => w.wallet_type === 'USDT');

      const bdt1 = bdtWallets[0] || null;
      const bdt2 = bdtWallets[1] || null;
      const usdt1 = usdtWallets[0] || null;

      await this.updateUserWallets(userId, {
        bdt_account_1_type: bdt1 ? bdt1.provider : null,
        bdt_account_1_number: bdt1 ? bdt1.account_number : null,
        bdt_account_2_type: bdt2 ? bdt2.provider : null,
        bdt_account_2_number: bdt2 ? bdt2.account_number : null,
        binance_id: usdt1 ? usdt1.account_number : null
      });
    } catch (e) {
      console.warn('syncLegacyWallets notice:', e.message);
    }
  }

  async updateUserWallets(userId, { bdt_account_1_type, bdt_account_1_number, bdt_account_2_type, bdt_account_2_number, binance_id }) {
    const uid = Number(userId);
    if (this.isPostgres) {
      const res = await this.pgPool.query(
        `UPDATE users 
         SET bdt_account_1_type = $1, bdt_account_1_number = $2,
             bdt_account_2_type = $3, bdt_account_2_number = $4,
             binance_id = $5
         WHERE id = $6 RETURNING *`,
        [bdt_account_1_type || null, bdt_account_1_number || null, bdt_account_2_type || null, bdt_account_2_number || null, binance_id || null, uid]
      );
      return res.rows[0];
    } else {
      this.sqliteDb.prepare(
        `UPDATE users 
         SET bdt_account_1_type = ?, bdt_account_1_number = ?,
             bdt_account_2_type = ?, bdt_account_2_number = ?,
             binance_id = ?
         WHERE id = ?`
      ).run(bdt_account_1_type || null, bdt_account_1_number || null, bdt_account_2_type || null, bdt_account_2_number || null, binance_id || null, uid);
      return this.getUser(uid);
    }
  }

  // ================= REFERRAL CODE MANAGEMENT =================

  async getUserByReferralCode(code) {
    if (!code) return null;
    const clean = String(code).trim();
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT * FROM users WHERE referral_code = $1', [clean]);
      return res.rows[0] || null;
    } else {
      return this.sqliteDb.prepare('SELECT * FROM users WHERE referral_code = ?').get(clean) || null;
    }
  }

  async resolveReferrerId(refInput) {
    if (!refInput) return null;
    const str = String(refInput).trim();
    if (!str) return null;

    // 1. Check if referral_code directly matches (e.g. TgBoost_Monetize816804)
    const byCode = await this.getUserByReferralCode(str);
    if (byCode) return Number(byCode.id);

    // 2. Check if numeric code part e.g. "823710" -> "TgBoost_Monetize823710"
    if (/^\d{5,7}$/.test(str)) {
      const bySuff = await this.getUserByReferralCode(`TgBoost_Monetize${str}`);
      if (bySuff) return Number(bySuff.id);
    }

    // 3. Check if TgBoost<number> e.g. TgBoost823710
    if (str.startsWith('TgBoost')) {
      const numPart = str.replace(/[^0-9]/g, '');
      if (numPart) {
        const byPref = await this.getUserByReferralCode(`TgBoost_Monetize${numPart}`);
        if (byPref) return Number(byPref.id);
      }
    }

    // 4. Check if legacy ref_ prefix (e.g. ref_6216116804 or ref_TgBoost_Monetize...)
    if (str.startsWith('ref_')) {
      const parsed = str.replace('ref_', '').trim();
      if (/^\d+$/.test(parsed)) return Number(parsed);
      const bySub = await this.getUserByReferralCode(parsed);
      if (bySub) return Number(bySub.id);
    }

    // 5. Check if raw numeric Telegram ID (legacy fallback)
    if (/^\d{8,12}$/.test(str)) {
      return Number(str);
    }

    return null;
  }

  async generateUniqueReferralCode(userId) {
    // Generates branded masked referral code replacing 'bot' with unique numbers: TgBoost_Monetize<number>
    let baseNum = 100000 + (Math.abs(Number(userId)) % 899999);
    let code = `TgBoost_Monetize${baseNum}`;
    let attempts = 0;
    while (attempts < 50) {
      const existing = await this.getUserByReferralCode(code);
      if (!existing || Number(existing.id) === Number(userId)) {
        return code;
      }
      baseNum = 100000 + Math.floor(Math.random() * 899999);
      code = `TgBoost_Monetize${baseNum}`;
      attempts++;
    }
    return `TgBoost_Monetize${Date.now().toString().slice(-6)}`;
  }

  // ================= USER OPERATIONS =================

  async getOrCreateUser(telegramUser, rawReferrer = null) {
    const userId = Number(telegramUser.id);
    const username = telegramUser.username || null;
    const firstName = telegramUser.first_name || '';
    const lastName = telegramUser.last_name || '';
    const validReferrerId = await this.resolveReferrerId(rawReferrer);

    if (this.isPostgres) {
      let res = await this.pgPool.query('SELECT * FROM users WHERE id = $1', [userId]);
      if (res.rows.length > 0) {
        let user = res.rows[0];
        let refCode = user.referral_code;
        if (!refCode) {
          refCode = await this.generateUniqueReferralCode(userId);
          await this.pgPool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [refCode, userId]);
          user.referral_code = refCode;
        }
        await this.pgPool.query(
          'UPDATE users SET username = $1, first_name = $2, last_name = $3 WHERE id = $4',
          [username, firstName, lastName, userId]
        );
        user.referral_link = `https://t.me/TgBoost_Monetizebot?start=${user.referral_code}`;
        return { user, isNew: false };
      }

      // Handle referral
      let validReferrer = null;
      if (validReferrerId && Number(validReferrerId) !== userId) {
        const refRes = await this.pgPool.query('SELECT id FROM users WHERE id = $1', [Number(validReferrerId)]);
        if (refRes.rows.length > 0) {
          validReferrer = Number(validReferrerId);
        }
      }

      const newRefCode = await this.generateUniqueReferralCode(userId);
      res = await this.pgPool.query(
        `INSERT INTO users (id, username, first_name, last_name, referred_by, is_referral_rewarded, referral_code)
         VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING *`,
        [userId, username, firstName, lastName, validReferrer, newRefCode]
      );

      let qualifiedReferral = null;

      if (validReferrer) {
        await this.pgPool.query(
          'UPDATE users SET referral_count = referral_count + 1 WHERE id = $1',
          [validReferrer]
        );

        const refUserRes = await this.pgPool.query(
          'SELECT id, first_name, username, referred_by, referral_count, is_referral_rewarded FROM users WHERE id = $1',
          [validReferrer]
        );
        const refUser = refUserRes.rows[0];
        if (
          refUser &&
          refUser.referred_by &&
          parseInt(refUser.is_referral_rewarded || 0, 10) === 0 &&
          parseInt(refUser.referral_count || 0, 10) >= 1 &&
          config.referralReward > 0
        ) {
          await this.addBalance(refUser.referred_by, config.referralReward, true);
          await this.pgPool.query('UPDATE users SET is_referral_rewarded = 1 WHERE id = $1', [refUser.id]);
          qualifiedReferral = {
            rewardedUserId: refUser.referred_by,
            qualifiedUser: refUser,
            rewardAmount: config.referralReward
          };
        }
      }

      const user = res.rows[0];
      user.referral_link = `https://t.me/TgBoost_Monetizebot?start=${user.referral_code}`;
      return { user, isNew: true, referrerId: validReferrer, qualifiedReferral };
    } else {
      let user = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      if (user) {
        let refCode = user.referral_code;
        if (!refCode) {
          refCode = await this.generateUniqueReferralCode(userId);
          this.sqliteDb.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(refCode, userId);
          user.referral_code = refCode;
        }
        this.sqliteDb.prepare(
          'UPDATE users SET username = ?, first_name = ?, last_name = ? WHERE id = ?'
        ).run(username, firstName, lastName, userId);
        user.referral_link = `https://t.me/TgBoost_Monetizebot?start=${user.referral_code}`;
        return { user, isNew: false };
      }

      let validReferrer = null;
      if (validReferrerId && Number(validReferrerId) !== userId) {
        const ref = this.sqliteDb.prepare('SELECT id FROM users WHERE id = ?').get(Number(validReferrerId));
        if (ref) {
          validReferrer = Number(validReferrerId);
        }
      }

      const newRefCode = await this.generateUniqueReferralCode(userId);
      this.sqliteDb.prepare(
        `INSERT INTO users (id, username, first_name, last_name, referred_by, is_referral_rewarded, referral_code)
         VALUES (?, ?, ?, ?, ?, 0, ?)`
      ).run(userId, username, firstName, lastName, validReferrer, newRefCode);

      let qualifiedReferral = null;

      if (validReferrer) {
        this.sqliteDb.prepare(
          'UPDATE users SET referral_count = referral_count + 1 WHERE id = ?'
        ).run(validReferrer);

        const refUser = this.sqliteDb.prepare(
          'SELECT id, first_name, username, referred_by, referral_count, is_referral_rewarded FROM users WHERE id = ?'
        ).get(validReferrer);

        if (
          refUser &&
          refUser.referred_by &&
          parseInt(refUser.is_referral_rewarded || 0, 10) === 0 &&
          parseInt(refUser.referral_count || 0, 10) >= 1 &&
          config.referralReward > 0
        ) {
          await this.addBalance(refUser.referred_by, config.referralReward, true);
          this.sqliteDb.prepare('UPDATE users SET is_referral_rewarded = 1 WHERE id = ?').run(refUser.id);
          qualifiedReferral = {
            rewardedUserId: refUser.referred_by,
            qualifiedUser: refUser,
            rewardAmount: config.referralReward
          };
        }
      }

      user = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(userId);
      const webBase = (config.miniAppUrl || 'https://tgbosttgbost.onrender.com').replace(/\/$/, '');
      user.referral_link = `https://t.me/TgBoost_Monetizebot?start=${user.referral_code}`;
      user.web_referral_link = `${webBase}/r/${user.referral_code}`;
      return { user, isNew: true, referrerId: validReferrer, qualifiedReferral };
    }
  }

  async getAffiliateData(userId) {
    const uid = Number(userId);
    const rewardPerRef = config.referralReward || 1.0;
    const webBase = (config.miniAppUrl || 'https://tgbosttgbost.onrender.com').replace(/\/$/, '');

    if (this.isPostgres) {
      const refRes = await this.pgPool.query(
        `SELECT id, first_name, username, referral_count, is_referral_rewarded, created_at
         FROM users WHERE referred_by = $1 ORDER BY created_at DESC`,
        [uid]
      );
      const referrals = refRes.rows.map(r => {
        const refCount = parseInt(r.referral_count || 0, 10);
        const isRewarded = parseInt(r.is_referral_rewarded || 0, 10) === 1;
        const isActive = refCount >= 1 || isRewarded;
        return {
          id: r.id,
          name: r.first_name || (r.username ? `@${r.username}` : `User ${r.id}`),
          username: r.username ? `@${r.username}` : null,
          joinedAt: r.created_at,
          referralCount: refCount,
          isActive,
          status: isActive ? 'active' : 'pending',
          rewardEarned: isActive ? rewardPerRef : 0
        };
      });
      const totalInvites = referrals.length;
      const activeInvites = referrals.filter(r => r.status === 'active').length;
      const pendingInvites = referrals.filter(r => r.status === 'pending').length;
      const totalEarned = (activeInvites * rewardPerRef).toFixed(2);
      const user = await this.getUser(uid);
      const referralCode = user ? user.referral_code : `TgBoost_Monetize${uid}`;
      const referralLink = `https://t.me/TgBoost_Monetizebot?start=${referralCode}`;
      const webReferralLink = `${webBase}/r/${referralCode}`;
      return { totalInvites, activeInvites, pendingInvites, totalEarned, referrals, referralCode, referralLink, webReferralLink };
    } else {
      const rows = this.sqliteDb.prepare(
        `SELECT id, first_name, username, referral_count, is_referral_rewarded, created_at
         FROM users WHERE referred_by = ? ORDER BY created_at DESC`
      ).all(uid);
      const referrals = rows.map(r => {
        const refCount = parseInt(r.referral_count || 0, 10);
        const isRewarded = parseInt(r.is_referral_rewarded || 0, 10) === 1;
        const isActive = refCount >= 1 || isRewarded;
        return {
          id: r.id,
          name: r.first_name || (r.username ? `@${r.username}` : `User ${r.id}`),
          username: r.username ? `@${r.username}` : null,
          joinedAt: r.created_at,
          referralCount: refCount,
          isActive,
          status: isActive ? 'active' : 'pending',
          rewardEarned: isActive ? rewardPerRef : 0
        };
      });
      const totalInvites = referrals.length;
      const activeInvites = referrals.filter(r => r.status === 'active').length;
      const pendingInvites = referrals.filter(r => r.status === 'pending').length;
      const totalEarned = (activeInvites * rewardPerRef).toFixed(2);
      const user = await this.getUser(uid);
      const referralCode = user ? user.referral_code : `TgBoost_Monetize${uid}`;
      const referralLink = `https://t.me/TgBoost_Monetizebot?start=${referralCode}`;
      const webReferralLink = `${webBase}/r/${referralCode}`;
      return { totalInvites, activeInvites, pendingInvites, totalEarned, referrals, referralCode, referralLink, webReferralLink };
    }
  }

  async getUser(userId) {
    const uid = Number(userId);
    let user = null;
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT * FROM users WHERE id = $1', [uid]);
      user = res.rows[0] || null;
      if (user && !user.referral_code) {
        user.referral_code = await this.generateUniqueReferralCode(uid);
        await this.pgPool.query('UPDATE users SET referral_code = $1 WHERE id = $2', [user.referral_code, uid]);
      }
    } else {
      user = this.sqliteDb.prepare('SELECT * FROM users WHERE id = ?').get(uid) || null;
      if (user && !user.referral_code) {
        user.referral_code = await this.generateUniqueReferralCode(uid);
        this.sqliteDb.prepare('UPDATE users SET referral_code = ? WHERE id = ?').run(user.referral_code, uid);
      }
    }
    if (user) {
      user.referral_link = `https://t.me/TgBoost_Monetizebot?start=${user.referral_code}`;
    }
    return user;
  }

  async addBalance(userId, amount, isEarned = true) {
    const uid = Number(userId);
    const amt = parseFloat(amount);
    if (this.isPostgres) {
      if (isEarned) {
        const res = await this.pgPool.query(
          `UPDATE users SET balance = balance + $1, total_earned = total_earned + $1 WHERE id = $2 RETURNING *`,
          [amt, uid]
        );
        return res.rows[0];
      } else {
        const res = await this.pgPool.query(
          `UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING *`,
          [amt, uid]
        );
        return res.rows[0];
      }
    } else {
      if (isEarned) {
        this.sqliteDb.prepare(
          `UPDATE users SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?`
        ).run(amt, amt, uid);
      } else {
        this.sqliteDb.prepare(
          `UPDATE users SET balance = balance + ? WHERE id = ?`
        ).run(amt, uid);
      }
      return this.getUser(uid);
    }
  }

  async deductBalance(userId, amount) {
    const uid = Number(userId);
    const amt = parseFloat(amount);
    if (this.isPostgres) {
      const res = await this.pgPool.query(
        `UPDATE users SET balance = balance - $1 WHERE id = $2 RETURNING *`,
        [amt, uid]
      );
      return res.rows[0];
    } else {
      this.sqliteDb.prepare(`UPDATE users SET balance = balance - ? WHERE id = ?`).run(amt, uid);
      return this.getUser(uid);
    }
  }

  // ================= TASK OPERATIONS =================

  async getActiveTasksForUser(userId) {
    const uid = Number(userId);
    if (this.isPostgres) {
      const query = `
        SELECT t.* FROM tasks t
        WHERE t.is_active = 1
        AND (t.max_users = 0 OR t.completed_count < t.max_users)
        AND t.id NOT IN (
          SELECT task_id FROM user_tasks WHERE user_id = $1 AND status IN ('holding', 'approved')
        )
        ORDER BY t.id DESC
      `;
      const res = await this.pgPool.query(query, [uid]);
      return res.rows;
    } else {
      const query = `
        SELECT t.* FROM tasks t
        WHERE t.is_active = 1
        AND (t.max_users = 0 OR t.completed_count < t.max_users)
        AND t.id NOT IN (
          SELECT task_id FROM user_tasks WHERE user_id = ? AND status IN ('holding', 'approved')
        )
        ORDER BY t.id DESC
      `;
      return this.sqliteDb.prepare(query).all(uid);
    }
  }

  async getAllTasks() {
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT * FROM tasks ORDER BY id DESC');
      return res.rows;
    } else {
      return this.sqliteDb.prepare('SELECT * FROM tasks ORDER BY id DESC').all();
    }
  }

  async getTask(taskId) {
    const tid = Number(taskId);
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT * FROM tasks WHERE id = $1', [tid]);
      return res.rows[0] || null;
    } else {
      return this.sqliteDb.prepare('SELECT * FROM tasks WHERE id = ?').get(tid) || null;
    }
  }

  async addTask({ title, description, channel_id, channel_link, reward, max_users = 0 }) {
    const rew = parseFloat(reward);
    const maxU = parseInt(max_users || '0', 10);
    const desc = description || '';

    if (this.isPostgres) {
      const res = await this.pgPool.query(
        `INSERT INTO tasks (title, description, channel_id, channel_link, reward, max_users)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [title, desc, channel_id, channel_link, rew, maxU]
      );
      return res.rows[0];
    } else {
      const info = this.sqliteDb.prepare(
        `INSERT INTO tasks (title, description, channel_id, channel_link, reward, max_users)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(title, desc, channel_id, channel_link, rew, maxU);
      return this.getTask(info.lastInsertRowid);
    }
  }

  async toggleTaskStatus(taskId) {
    const tid = Number(taskId);
    if (this.isPostgres) {
      const res = await this.pgPool.query(
        'UPDATE tasks SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = $1 RETURNING *',
        [tid]
      );
      return res.rows[0];
    } else {
      this.sqliteDb.prepare(
        'UPDATE tasks SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?'
      ).run(tid);
      return this.getTask(tid);
    }
  }

  async deleteTask(taskId) {
    const tid = Number(taskId);
    if (this.isPostgres) {
      // Retain user_tasks records so users in 2-day holding still receive rewards after task deletion!
      await this.pgPool.query('DELETE FROM tasks WHERE id = $1', [tid]);
    } else {
      this.sqliteDb.prepare('DELETE FROM tasks WHERE id = ?').run(tid);
    }
    return true;
  }

  async isTaskCompletedByUser(userId, taskId) {
    const uid = Number(userId);
    const tid = Number(taskId);
    if (this.isPostgres) {
      const res = await this.pgPool.query(
        "SELECT id, status FROM user_tasks WHERE user_id = $1 AND task_id = $2 AND status IN ('holding', 'approved')",
        [uid, tid]
      );
      return res.rows.length > 0;
    } else {
      const row = this.sqliteDb.prepare(
        "SELECT id, status FROM user_tasks WHERE user_id = ? AND task_id = ? AND status IN ('holding', 'approved')"
      ).get(uid, tid);
      return !!row;
    }
  }

  async completeTask(userId, taskId) {
    const uid = Number(userId);
    const tid = Number(taskId);
    const task = await this.getTask(tid);
    if (!task) throw new Error('Task not found');

    const alreadyDone = await this.isTaskCompletedByUser(uid, tid);
    if (alreadyDone) throw new Error('Task already completed or pending verification');

    const reward = parseFloat(task.reward);

    if (this.isPostgres) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          `INSERT INTO user_tasks (user_id, task_id, reward, channel_id, status, unlock_at, completed_at)
           VALUES ($1, $2, $3, $4, 'holding', NOW() + INTERVAL '2 days', CURRENT_TIMESTAMP)
           ON CONFLICT (user_id, task_id) DO UPDATE SET
             reward = $3,
             channel_id = $4,
             status = 'holding',
             unlock_at = NOW() + INTERVAL '2 days',
             completed_at = CURRENT_TIMESTAMP`,
          [uid, tid, reward, task.channel_id]
        );
        await client.query(
          `UPDATE tasks SET completed_count = completed_count + 1 WHERE id = $1`,
          [tid]
        );
        if (task.max_users > 0 && task.completed_count + 1 >= task.max_users) {
          await client.query('UPDATE tasks SET is_active = 0 WHERE id = $1', [tid]);
        }
        await client.query(
          `UPDATE users SET pending_balance = COALESCE(pending_balance, 0) + $1 WHERE id = $2`,
          [reward, uid]
        );
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } else {
      const tx = this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare(`
          INSERT INTO user_tasks (user_id, task_id, reward, channel_id, status, unlock_at, completed_at)
          VALUES (?, ?, ?, ?, 'holding', datetime('now', '+2 days'), CURRENT_TIMESTAMP)
          ON CONFLICT(user_id, task_id) DO UPDATE SET
            reward = excluded.reward,
            channel_id = excluded.channel_id,
            status = 'holding',
            unlock_at = datetime('now', '+2 days'),
            completed_at = CURRENT_TIMESTAMP
        `).run(uid, tid, reward, task.channel_id);

        this.sqliteDb.prepare(
          `UPDATE tasks SET completed_count = completed_count + 1 WHERE id = ?`
        ).run(tid);

        if (task.max_users > 0 && task.completed_count + 1 >= task.max_users) {
          this.sqliteDb.prepare('UPDATE tasks SET is_active = 0 WHERE id = ?').run(tid);
        }

        this.sqliteDb.prepare(
          `UPDATE users SET pending_balance = COALESCE(pending_balance, 0) + ? WHERE id = ?`
        ).run(reward, uid);
      });
      tx();
    }

    return { reward, isHolding: true, updatedUser: await this.getUser(uid) };
  }

  // ================= 2-DAY HOLDING VERIFICATION QUERIES =================

  async getPendingHoldingTasks(userId = null) {
    if (this.isPostgres) {
      if (userId) {
        const res = await this.pgPool.query(
          `SELECT ut.*, COALESCE(ut.channel_id, t.channel_id) as target_channel_id, t.title as task_title 
           FROM user_tasks ut 
           LEFT JOIN tasks t ON ut.task_id = t.id 
           WHERE ut.user_id = $1 AND ut.status = 'holding'`,
          [Number(userId)]
        );
        return res.rows;
      } else {
        const res = await this.pgPool.query(
          `SELECT ut.*, COALESCE(ut.channel_id, t.channel_id) as target_channel_id, t.title as task_title 
           FROM user_tasks ut 
           LEFT JOIN tasks t ON ut.task_id = t.id 
           WHERE ut.status = 'holding'`
        );
        return res.rows;
      }
    } else {
      if (userId) {
        return this.sqliteDb.prepare(
          `SELECT ut.*, COALESCE(ut.channel_id, t.channel_id) as target_channel_id, t.title as task_title 
           FROM user_tasks ut 
           LEFT JOIN tasks t ON ut.task_id = t.id 
           WHERE ut.user_id = ? AND ut.status = 'holding'`
        ).all(Number(userId));
      } else {
        return this.sqliteDb.prepare(
          `SELECT ut.*, COALESCE(ut.channel_id, t.channel_id) as target_channel_id, t.title as task_title 
           FROM user_tasks ut 
           LEFT JOIN tasks t ON ut.task_id = t.id 
           WHERE ut.status = 'holding'`
        ).all();
      }
    }
  }

  async approvePendingTask(userTaskId, userId, reward) {
    const utId = Number(userTaskId);
    const uid = Number(userId);
    const rew = parseFloat(reward);

    if (this.isPostgres) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          "UPDATE user_tasks SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = $1",
          [utId]
        );
        await client.query(
          `UPDATE users 
           SET pending_balance = GREATEST(0, COALESCE(pending_balance, 0) - $1),
               balance = balance + $1,
               total_earned = total_earned + $1
           WHERE id = $2`,
          [rew, uid]
        );
        await client.query('COMMIT');
        return true;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      const tx = this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare(
          "UPDATE user_tasks SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?"
        ).run(utId);
        this.sqliteDb.prepare(
          `UPDATE users 
           SET pending_balance = MAX(0, COALESCE(pending_balance, 0) - ?),
               balance = balance + ?,
               total_earned = total_earned + ?
           WHERE id = ?`
        ).run(rew, rew, rew, uid);
      });
      tx();
      return true;
    }
  }

  async revokePendingTask(userTaskId, userId, reward) {
    const utId = Number(userTaskId);
    const uid = Number(userId);
    const rew = parseFloat(reward);

    if (this.isPostgres) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query(
          "UPDATE user_tasks SET status = 'revoked' WHERE id = $1",
          [utId]
        );
        await client.query(
          "UPDATE users SET pending_balance = GREATEST(0, COALESCE(pending_balance, 0) - $1) WHERE id = $2",
          [rew, uid]
        );
        await client.query('COMMIT');
        return true;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      const tx = this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare(
          "UPDATE user_tasks SET status = 'revoked' WHERE id = ?"
        ).run(utId);
        this.sqliteDb.prepare(
          "UPDATE users SET pending_balance = MAX(0, COALESCE(pending_balance, 0) - ?) WHERE id = ?"
        ).run(rew, uid);
      });
      tx();
      return true;
    }
  }

  async getUserCompletedTasks(userId) {
    const uid = Number(userId);
    if (this.isPostgres) {
      const query = `
        SELECT ut.*, COALESCE(t.title, 'Channel Task') as title FROM user_tasks ut
        LEFT JOIN tasks t ON ut.task_id = t.id
        WHERE ut.user_id = $1
        ORDER BY ut.completed_at DESC
      `;
      const res = await this.pgPool.query(query, [uid]);
      return res.rows;
    } else {
      const query = `
        SELECT ut.*, COALESCE(t.title, 'Channel Task') as title FROM user_tasks ut
        LEFT JOIN tasks t ON ut.task_id = t.id
        WHERE ut.user_id = ?
        ORDER BY ut.completed_at DESC
      `;
      return this.sqliteDb.prepare(query).all(uid);
    }
  }

  // ================= WITHDRAWAL OPERATIONS =================

  async createWithdrawal({ userId, amount, method, accountNumber }) {
    const uid = Number(userId);
    const amt = parseFloat(amount);

    const user = await this.getUser(uid);
    if (!user) throw new Error('User not found');
    if (parseFloat(user.balance) < amt) throw new Error('Insufficient balance');

    if (this.isPostgres) {
      const client = await this.pgPool.connect();
      try {
        await client.query('BEGIN');
        await client.query('UPDATE users SET balance = balance - $1 WHERE id = $2', [amt, uid]);
        const res = await client.query(
          `INSERT INTO withdrawals (user_id, amount, method, account_number, status)
           VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
          [uid, amt, method, accountNumber]
        );
        await client.query('COMMIT');
        return res.rows[0];
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    } else {
      let result;
      const tx = this.sqliteDb.transaction(() => {
        this.sqliteDb.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(amt, uid);
        const info = this.sqliteDb.prepare(
          `INSERT INTO withdrawals (user_id, amount, method, account_number, status)
           VALUES (?, ?, ?, ?, 'pending')`
        ).run(uid, amt, method, accountNumber);
        result = this.sqliteDb.prepare('SELECT * FROM withdrawals WHERE id = ?').get(info.lastInsertRowid);
      });
      tx();
      return result;
    }
  }

  async getPendingWithdrawals() {
    if (this.isPostgres) {
      const query = `
        SELECT w.*, u.first_name, u.username
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = 'pending'
        ORDER BY w.id ASC
      `;
      const res = await this.pgPool.query(query);
      return res.rows;
    } else {
      const query = `
        SELECT w.*, u.first_name, u.username
        FROM withdrawals w
        JOIN users u ON w.user_id = u.id
        WHERE w.status = 'pending'
        ORDER BY w.id ASC
      `;
      return this.sqliteDb.prepare(query).all();
    }
  }

  async getWithdrawal(withdrawalId) {
    const wid = Number(withdrawalId);
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT * FROM withdrawals WHERE id = $1', [wid]);
      return res.rows[0] || null;
    } else {
      return this.sqliteDb.prepare('SELECT * FROM withdrawals WHERE id = ?').get(wid) || null;
    }
  }

  async getUserWithdrawals(userId) {
    const uid = Number(userId);
    if (this.isPostgres) {
      const res = await this.pgPool.query(
        'SELECT * FROM withdrawals WHERE user_id = $1 ORDER BY id DESC LIMIT 10',
        [uid]
      );
      return res.rows;
    } else {
      return this.sqliteDb.prepare(
        'SELECT * FROM withdrawals WHERE user_id = ? ORDER BY id DESC LIMIT 10'
      ).all(uid);
    }
  }

  async approveWithdrawal(withdrawalId, adminNote = 'Approved') {
    const wid = Number(withdrawalId);
    const w = await this.getWithdrawal(wid);
    if (!w || w.status !== 'pending') throw new Error('Withdrawal not found or already processed');

    const amt = parseFloat(w.amount);
    const uid = Number(w.user_id);

    if (this.isPostgres) {
      await this.pgPool.query(
        `UPDATE withdrawals
         SET status = 'approved', admin_note = $1, processed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [adminNote, wid]
      );
      await this.pgPool.query(
        'UPDATE users SET total_withdrawn = total_withdrawn + $1 WHERE id = $2',
        [amt, uid]
      );
    } else {
      this.sqliteDb.prepare(
        `UPDATE withdrawals
         SET status = 'approved', admin_note = ?, processed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(adminNote, wid);
      this.sqliteDb.prepare(
        'UPDATE users SET total_withdrawn = total_withdrawn + ? WHERE id = ?'
      ).run(amt, uid);
    }
    return true;
  }

  async rejectWithdrawal(withdrawalId, adminNote = 'Rejected') {
    const wid = Number(withdrawalId);
    const w = await this.getWithdrawal(wid);
    if (!w || w.status !== 'pending') throw new Error('Withdrawal not found or already processed');

    const amt = parseFloat(w.amount);
    const uid = Number(w.user_id);

    // Refund amount back to user's balance
    if (this.isPostgres) {
      await this.pgPool.query(
        `UPDATE withdrawals
         SET status = 'rejected', admin_note = $1, processed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [adminNote, wid]
      );
      await this.pgPool.query('UPDATE users SET balance = balance + $1 WHERE id = $2', [amt, uid]);
    } else {
      this.sqliteDb.prepare(
        `UPDATE withdrawals
         SET status = 'rejected', admin_note = ?, processed_at = CURRENT_TIMESTAMP
         WHERE id = ?`
      ).run(adminNote, wid);
      this.sqliteDb.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(amt, uid);
    }
    return true;
  }

  // ================= STATISTICS =================

  async getStats() {
    if (this.isPostgres) {
      const uRes = await this.pgPool.query('SELECT COUNT(*) AS total_users FROM users');
      const tRes = await this.pgPool.query('SELECT COUNT(*) AS total_tasks FROM tasks');
      const utRes = await this.pgPool.query('SELECT COUNT(*) AS total_completed FROM user_tasks');
      const wRes = await this.pgPool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid FROM withdrawals WHERE status = 'approved'`
      );
      const pwRes = await this.pgPool.query(
        `SELECT COUNT(*) AS pending_withdrawals FROM withdrawals WHERE status = 'pending'`
      );
      return {
        totalUsers: parseInt(uRes.rows[0].total_users, 10),
        totalTasks: parseInt(tRes.rows[0].total_tasks, 10),
        totalCompletedTasks: parseInt(utRes.rows[0].total_completed, 10),
        totalPaid: parseFloat(wRes.rows[0].total_paid),
        pendingWithdrawals: parseInt(pwRes.rows[0].pending_withdrawals, 10)
      };
    } else {
      const totalUsers = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM users').get().count;
      const totalTasks = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM tasks').get().count;
      const totalCompletedTasks = this.sqliteDb.prepare('SELECT COUNT(*) as count FROM user_tasks').get().count;
      const totalPaid = this.sqliteDb.prepare(
        `SELECT COALESCE(SUM(amount), 0) as total FROM withdrawals WHERE status = 'approved'`
      ).get().total;
      const pendingWithdrawals = this.sqliteDb.prepare(
        `SELECT COUNT(*) as count FROM withdrawals WHERE status = 'pending'`
      ).get().count;
      return {
        totalUsers,
        totalTasks,
        totalCompletedTasks,
        totalPaid: parseFloat(totalPaid),
        pendingWithdrawals
      };
    }
  }

  async getAllUserIds() {
    if (this.isPostgres) {
      const res = await this.pgPool.query('SELECT id FROM users WHERE is_banned = 0');
      return res.rows.map(r => r.id);
    } else {
      const rows = this.sqliteDb.prepare('SELECT id FROM users WHERE is_banned = 0').all();
      return rows.map(r => r.id);
    }
  }
}

const db = new DatabaseAdapter();
module.exports = db;
