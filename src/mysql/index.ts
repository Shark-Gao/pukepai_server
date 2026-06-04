/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */

/**
 * Database adapter - supports both MySQL and PostgreSQL
 * Switch via environment variable: DB_TYPE=mysql (default) or DB_TYPE=postgres
 *
 * Local dev:  DB_TYPE=mysql  (uses mysql2/promise)
 * Production: DB_TYPE=postgres (uses pg + DATABASE_URL)
 */

const DB_TYPE = process.env.DB_TYPE || 'mysql';

// ─── Unified query result interface ───────────────────────────────────────────
// Mimics mysql2 result: [rows, fields]
// rows has .affectedRows / .insertId for write operations
interface UnifiedResult {
  affectedRows?: number;
  insertId?: number;
  [key: string]: any;
}

// ─── PostgreSQL adapter ────────────────────────────────────────────────────────
class PostgresPool {
  private static _pool: any = null;

  private static getPool() {
    if (!this._pool) {
      const { Pool } = require('pg');
      this._pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 60000,
      });
    }
    return this._pool;
  }

  /**
   * Convert MySQL-style ? placeholders to PostgreSQL $1, $2, ...
   */
  private static convertPlaceholders(sql: string): string {
    let index = 0;
    return sql.replace(/\?/g, () => `$${++index}`);
  }

  /**
   * Unified query interface - returns [rows, fields] like mysql2
   */
  public static async query(sql: string, params?: any[]): Promise<[any, any]> {
    const pgSql = this.convertPlaceholders(sql);
    const result = await this.getPool().query(pgSql, params);

    // For SELECT: result.rows is the array
    // For INSERT/UPDATE/DELETE: wrap into a mysql2-compatible object
    const isWrite = /^\s*(insert|update|delete)/i.test(sql.trim());
    if (isWrite) {
      const fakeResult: UnifiedResult = {
        affectedRows: result.rowCount,
        // For INSERT ... RETURNING id, expose the first row's id as insertId
        insertId: result.rows?.[0]?.id ?? (result.rowCount > 0 ? 1 : 0),
      };
      return [fakeResult, result.fields];
    }

    return [result.rows, result.fields];
  }
}

// ─── MySQL adapter (original logic) ───────────────────────────────────────────
class MySQLPool {
  private static _inst: any = null;

  private static createPool() {
    const mysql = require('mysql2/promise');
    return mysql.createPool({
      host: process.env.DOCKER_MYSQL || 'localhost',
      user: 'root',
      password: '12345', // mysql password
      database: 'playing_card',
      port: 3306,
      waitForConnections: true,
      connectionLimit: 10,
      maxIdle: 10,
      idleTimeout: 60000,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    });
  }

  public static get inst() {
    if (!this._inst) {
      this._inst = this.createPool();
    }
    return this._inst;
  }
}

// ─── Unified export ────────────────────────────────────────────────────────────
// All business code uses: pool.inst.query(sql, params)
// This export keeps the same interface regardless of DB_TYPE.

const pool = DB_TYPE === 'postgres'
  ? {
      inst: {
        query: (sql: string, params?: any[]) => PostgresPool.query(sql, params),
      },
    }
  : MySQLPool;

console.log(`[DB] Using database: ${DB_TYPE}`);

export default pool;
