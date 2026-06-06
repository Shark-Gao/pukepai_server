"use strict";
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Database adapter - supports both MySQL and PostgreSQL
 * Switch via environment variable: DB_TYPE=mysql (default) or DB_TYPE=postgres
 *
 * Local dev:  DB_TYPE=mysql  (uses mysql2/promise)
 * Production: DB_TYPE=postgres (uses pg + DATABASE_URL)
 */
const DB_TYPE = process.env.DB_TYPE || 'mysql';
// ─── PostgreSQL adapter ────────────────────────────────────────────────────────
class PostgresPool {
    static getPool() {
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
    static convertPlaceholders(sql) {
        let index = 0;
        return sql.replace(/\?/g, () => `$${++index}`);
    }
    /**
     * Unified query interface - returns [rows, fields] like mysql2
     */
    static async query(sql, params) {
        var _a, _b, _c;
        const pgSql = this.convertPlaceholders(sql);
        const result = await this.getPool().query(pgSql, params);
        // For SELECT: result.rows is the array
        // For INSERT/UPDATE/DELETE: wrap into a mysql2-compatible object
        const isWrite = /^\s*(insert|update|delete)/i.test(sql.trim());
        if (isWrite) {
            const fakeResult = {
                affectedRows: result.rowCount,
                // For INSERT ... RETURNING id, expose the first row's id as insertId
                insertId: (_c = (_b = (_a = result.rows) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.id) !== null && _c !== void 0 ? _c : (result.rowCount > 0 ? 1 : 0),
            };
            return [fakeResult, result.fields];
        }
        return [result.rows, result.fields];
    }
}
PostgresPool._pool = null;
// ─── MySQL adapter (original logic) ───────────────────────────────────────────
class MySQLPool {
    static createPool() {
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
    static get inst() {
        if (!this._inst) {
            this._inst = this.createPool();
        }
        return this._inst;
    }
}
MySQLPool._inst = null;
// ─── Unified export ────────────────────────────────────────────────────────────
// All business code uses: pool.inst.query(sql, params)
// This export keeps the same interface regardless of DB_TYPE.
const pool = DB_TYPE === 'postgres'
    ? {
        inst: {
            query: (sql, params) => PostgresPool.query(sql, params),
        },
    }
    : MySQLPool;
console.log(`[DB] Using database: ${DB_TYPE}`);
exports.default = pool;
//# sourceMappingURL=index.js.map