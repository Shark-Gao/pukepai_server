"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureShuangjianRecordTable = ensureShuangjianRecordTable;
exports.saveShuangjianRecordMysql = saveShuangjianRecordMysql;
exports.getShuangjianRecordsByUser = getShuangjianRecordsByUser;
/**
 * shuangjian_record - DDL & helper for the Fengcheng Twin-Sword
 * (Shuangjian) round history.
 *
 * The schema purposely does NOT extend the existing `game_record` table —
 * Shuangjian has 4 players (Doudizhu has 3) and richer per-round data
 * (camps, awards, victory category, special rules, partner card). Keeping
 * a separate table avoids null pollution and makes querying simpler.
 *
 * The DDL below is dialect-agnostic at the surface (`CREATE TABLE IF NOT
 * EXISTS`); minor differences between MySQL & PostgreSQL are absorbed.
 *
 * Both `ensureShuangjianRecordTable` and `saveShuangjianRecordMysql` MUST
 * never throw — failures are logged so the room cleanup pipeline keeps
 * running even when the database is unavailable.
 */
const mysql_1 = require("../mysql");
const DB_TYPE = process.env.DB_TYPE || 'mysql';
const DDL_MYSQL = `
CREATE TABLE IF NOT EXISTS shuangjian_record (
    id              BIGINT          NOT NULL AUTO_INCREMENT,
    room_id         VARCHAR(64)     NOT NULL,
    level           INT             NOT NULL,
    room_base       INT             NOT NULL,
    game_mode       INT             NOT NULL DEFAULT 1,
    special_rules   TEXT            NULL,
    is_baopai       TINYINT(1)      NOT NULL DEFAULT 0,
    partner_card    INT             NOT NULL DEFAULT -1,
    landlord_id     VARCHAR(64)     NOT NULL,
    user_1_id       VARCHAR(64)     NULL,
    user_2_id       VARCHAR(64)     NULL,
    user_3_id       VARCHAR(64)     NULL,
    user_4_id       VARCHAR(64)     NULL,
    user_1_rank     INT             NULL,
    user_2_rank     INT             NULL,
    user_3_rank     INT             NULL,
    user_4_rank     INT             NULL,
    user_1_get_score INT            NULL,
    user_2_get_score INT            NULL,
    user_3_get_score INT            NULL,
    user_4_get_score INT            NULL,
    user_1_awards   TEXT            NULL,
    user_2_awards   TEXT            NULL,
    user_3_awards   TEXT            NULL,
    user_4_awards   TEXT            NULL,
    play_card_record MEDIUMTEXT     NULL,
    victory_status  VARCHAR(32)     NULL,
    start_time      DATETIME        NULL,
    end_time        DATETIME        NULL,
    PRIMARY KEY (id),
    KEY idx_user_1 (user_1_id),
    KEY idx_user_2 (user_2_id),
    KEY idx_user_3 (user_3_id),
    KEY idx_user_4 (user_4_id),
    KEY idx_room_id (room_id),
    KEY idx_end_time (end_time)
);
`;
const DDL_POSTGRES = `
CREATE TABLE IF NOT EXISTS shuangjian_record (
    id              BIGSERIAL       PRIMARY KEY,
    room_id         VARCHAR(64)     NOT NULL,
    level           INT             NOT NULL,
    room_base       INT             NOT NULL,
    game_mode       INT             NOT NULL DEFAULT 1,
    special_rules   TEXT            NULL,
    is_baopai       SMALLINT        NOT NULL DEFAULT 0,
    partner_card    INT             NOT NULL DEFAULT -1,
    landlord_id     VARCHAR(64)     NOT NULL,
    user_1_id       VARCHAR(64),
    user_2_id       VARCHAR(64),
    user_3_id       VARCHAR(64),
    user_4_id       VARCHAR(64),
    user_1_rank     INT,
    user_2_rank     INT,
    user_3_rank     INT,
    user_4_rank     INT,
    user_1_get_score INT,
    user_2_get_score INT,
    user_3_get_score INT,
    user_4_get_score INT,
    user_1_awards   TEXT,
    user_2_awards   TEXT,
    user_3_awards   TEXT,
    user_4_awards   TEXT,
    play_card_record TEXT,
    victory_status  VARCHAR(32),
    start_time      TIMESTAMP,
    end_time        TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shuangjian_user_1 ON shuangjian_record(user_1_id);
CREATE INDEX IF NOT EXISTS idx_shuangjian_user_2 ON shuangjian_record(user_2_id);
CREATE INDEX IF NOT EXISTS idx_shuangjian_user_3 ON shuangjian_record(user_3_id);
CREATE INDEX IF NOT EXISTS idx_shuangjian_user_4 ON shuangjian_record(user_4_id);
CREATE INDEX IF NOT EXISTS idx_shuangjian_room_id ON shuangjian_record(room_id);
CREATE INDEX IF NOT EXISTS idx_shuangjian_end_time ON shuangjian_record(end_time);
`;
let initialized = false;
/** Lazily create the shuangjian_record table on first use. */
async function ensureShuangjianRecordTable() {
    if (initialized)
        return;
    initialized = true;
    try {
        const ddl = DB_TYPE === 'postgres' ? DDL_POSTGRES : DDL_MYSQL;
        // For PostgreSQL the multi-statement string needs to be split.
        const stmts = ddl.split(';').map(s => s.trim()).filter(Boolean);
        for (const s of stmts) {
            await mysql_1.default.inst.query(s);
        }
        console.log('[shuangjian_record] table ensured');
    }
    catch (err) {
        console.error('[shuangjian_record] ensure table failed:', err);
        // Don't crash; subsequent insert will surface the error.
    }
}
/**
 * Insert one Shuangjian round record. Never throws — logs and swallows
 * errors so the live game flow can carry on.
 */
async function saveShuangjianRecordMysql(roomInfo) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0;
    try {
        await ensureShuangjianRecordTable();
        const userIds = roomInfo.roomUserIdList.filter(id => !!id);
        const settle = roomInfo._shuangjian_settle_results || [];
        const findRes = (uid) => settle.find((r) => r.userId === uid);
        const ph = (i) => `?`; // mysql placeholder; pg adapter rewrites it
        const fields = [
            'room_id', 'level', 'room_base', 'game_mode', 'special_rules',
            'is_baopai', 'partner_card', 'landlord_id',
            'user_1_id', 'user_2_id', 'user_3_id', 'user_4_id',
            'user_1_rank', 'user_2_rank', 'user_3_rank', 'user_4_rank',
            'user_1_get_score', 'user_2_get_score', 'user_3_get_score', 'user_4_get_score',
            'user_1_awards', 'user_2_awards', 'user_3_awards', 'user_4_awards',
            'play_card_record', 'victory_status', 'start_time', 'end_time',
        ];
        const placeholders = fields.map(() => '?').join(',');
        const sql = `INSERT INTO shuangjian_record (${fields.join(',')}) VALUES (${placeholders})`;
        const rec = (i) => findRes(userIds[i]);
        const params = [
            roomInfo.room_id,
            roomInfo.level,
            roomInfo.room_base,
            roomInfo.game_mode,
            JSON.stringify(roomInfo.special_rules || {}),
            roomInfo.is_baopai ? 1 : 0,
            (_a = roomInfo.partner_card) !== null && _a !== void 0 ? _a : -1,
            roomInfo.landlord_id,
            userIds[0] || null, userIds[1] || null, userIds[2] || null, userIds[3] || null,
            (_c = (_b = rec(0)) === null || _b === void 0 ? void 0 : _b.rank) !== null && _c !== void 0 ? _c : null,
            (_e = (_d = rec(1)) === null || _d === void 0 ? void 0 : _d.rank) !== null && _e !== void 0 ? _e : null,
            (_g = (_f = rec(2)) === null || _f === void 0 ? void 0 : _f.rank) !== null && _g !== void 0 ? _g : null,
            (_j = (_h = rec(3)) === null || _h === void 0 ? void 0 : _h.rank) !== null && _j !== void 0 ? _j : null,
            (_l = (_k = rec(0)) === null || _k === void 0 ? void 0 : _k.getScore) !== null && _l !== void 0 ? _l : null,
            (_o = (_m = rec(1)) === null || _m === void 0 ? void 0 : _m.getScore) !== null && _o !== void 0 ? _o : null,
            (_q = (_p = rec(2)) === null || _p === void 0 ? void 0 : _p.getScore) !== null && _q !== void 0 ? _q : null,
            (_s = (_r = rec(3)) === null || _r === void 0 ? void 0 : _r.getScore) !== null && _s !== void 0 ? _s : null,
            JSON.stringify((_u = (_t = rec(0)) === null || _t === void 0 ? void 0 : _t.awards) !== null && _u !== void 0 ? _u : null),
            JSON.stringify((_w = (_v = rec(1)) === null || _v === void 0 ? void 0 : _v.awards) !== null && _w !== void 0 ? _w : null),
            JSON.stringify((_y = (_x = rec(2)) === null || _x === void 0 ? void 0 : _x.awards) !== null && _y !== void 0 ? _y : null),
            JSON.stringify((_0 = (_z = rec(3)) === null || _z === void 0 ? void 0 : _z.awards) !== null && _0 !== void 0 ? _0 : null),
            JSON.stringify(roomInfo.play_card_record || []),
            roomInfo._shuangjian_victory_status || null,
            roomInfo.start_time || null,
            roomInfo.end_time || new Date(),
        ];
        await mysql_1.default.inst.query(sql, params);
        console.log('[shuangjian_record] inserted room', roomInfo.room_id);
    }
    catch (err) {
        console.error('[shuangjian_record] insert failed:', err);
    }
}
/**
 * Fetch a user's Shuangjian round history (ordered most-recent first).
 * Used by the `/getRecord` endpoint when ?gameMode=1.
 */
async function getShuangjianRecordsByUser(userId) {
    try {
        await ensureShuangjianRecordTable();
        const [rows] = await mysql_1.default.inst.query(`SELECT * FROM shuangjian_record
             WHERE user_1_id = ? OR user_2_id = ? OR user_3_id = ? OR user_4_id = ?
             ORDER BY end_time DESC`, [userId, userId, userId, userId]);
        return rows;
    }
    catch (err) {
        console.error('[shuangjian_record] query failed:', err);
        return [];
    }
}
//# sourceMappingURL=shuangjianRecord.js.map