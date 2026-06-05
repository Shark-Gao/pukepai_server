-- PostgreSQL 版本的斗地主游戏数据库脚本
-- 注意：PostgreSQL不支持MySQL的ON UPDATE CURRENT_TIMESTAMP，已通过触发器实现update_time自动更新
-- 注意：原MySQL中'0000-00-00'日期无效，已改为PostgreSQL支持的'0001-01-01'

-- 删除已存在的表（如果存在）
-- DROP TABLE IF EXISTS game_record;
-- DROP TABLE IF EXISTS room_level;
-- DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    feedback VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------
-- 游戏记录表
-- ----------------------------
CREATE TABLE IF NOT EXISTS game_record (
  id SERIAL PRIMARY KEY,
  create_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time TIMESTAMP(0) WITHOUT TIME ZONE NOT NULL DEFAULT '0001-01-01 00:00:00',
  user_id1 VARCHAR(255) NOT NULL,
  user_id2 VARCHAR(255) NOT NULL,
  user_id3 VARCHAR(255) NOT NULL,
  user_id4 VARCHAR(255),
  winner VARCHAR(255) NOT NULL,
  user_score1 INTEGER NOT NULL,
  user_score2 INTEGER NOT NULL,
  user_score3 INTEGER NOT NULL,
  user_score4 INTEGER,
  multiple1 INTEGER,
  multiple2 INTEGER,
  multiple3 INTEGER,
  multiple4 INTEGER,
  bomb_count INTEGER NOT NULL DEFAULT 0,
  spring INTEGER NOT NULL DEFAULT 0,
  loser VARCHAR(255),
  base_score INTEGER NOT NULL,
  room_number VARCHAR(255) NOT NULL,
  dismiss_user TEXT,
  game_record TEXT NOT NULL
);

-- 添加表和字段注释
COMMENT ON TABLE game_record IS '游戏记录表';
COMMENT ON COLUMN game_record.create_time IS '创建时间';
COMMENT ON COLUMN game_record.update_time IS '更新时间';
COMMENT ON COLUMN game_record.user_id1 IS '玩家1';
COMMENT ON COLUMN game_record.user_id2 IS '玩家2';
COMMENT ON COLUMN game_record.user_id3 IS '玩家3';
COMMENT ON COLUMN game_record.user_id4 IS '玩家4';
COMMENT ON COLUMN game_record.winner IS '赢家';
COMMENT ON COLUMN game_record.user_score1 IS '玩家1分数';
COMMENT ON COLUMN game_record.user_score2 IS '玩家2分数';
COMMENT ON COLUMN game_record.user_score3 IS '玩家3分数';
COMMENT ON COLUMN game_record.user_score4 IS '玩家4分数';
COMMENT ON COLUMN game_record.multiple1 IS '玩家1倍数';
COMMENT ON COLUMN game_record.multiple2 IS '玩家2倍数';
COMMENT ON COLUMN game_record.multiple3 IS '玩家3倍数';
COMMENT ON COLUMN game_record.multiple4 IS '玩家4倍数';
COMMENT ON COLUMN game_record.bomb_count IS '炸弹数量';
COMMENT ON COLUMN game_record.spring IS '春天 0 不是 1 是';
COMMENT ON COLUMN game_record.loser IS '输家';
COMMENT ON COLUMN game_record.base_score IS '基础分';
COMMENT ON COLUMN game_record.room_number IS '房间号';
COMMENT ON COLUMN game_record.dismiss_user IS '解散房间的人';
COMMENT ON COLUMN game_record.game_record IS '游戏记录';

-- 创建触发器实现update_time自动更新（替代MySQL的ON UPDATE CURRENT_TIMESTAMP）
CREATE OR REPLACE FUNCTION update_update_time()
RETURNS TRIGGER AS $$
BEGIN
  NEW.update_time = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_game_record_update_time
BEFORE UPDATE ON game_record
FOR EACH ROW
EXECUTE FUNCTION update_update_time();

-- ----------------------------
-- 房间等级表
-- ----------------------------
CREATE TABLE IF NOT EXISTS room_level (
  id INTEGER PRIMARY KEY,
  level VARCHAR(255) NOT NULL,
  base VARCHAR(255) NOT NULL
);

COMMENT ON TABLE room_level IS '房间等级表';
COMMENT ON COLUMN room_level.level IS '房间等级 1：初级 2：中级 3：高级 4：大师';
COMMENT ON COLUMN room_level.base IS '基数';

-- ----------------------------
-- 用户表
-- ----------------------------
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255) NOT NULL,
  user_account VARCHAR(255),
  user_password VARCHAR(255),
  user_head_img VARCHAR(255) NOT NULL,
  wx_openid VARCHAR(255),
  gold INTEGER NOT NULL DEFAULT 1000, -- 原varchar存储数字改为更合理的INTEGER类型
  game_audio INTEGER NOT NULL DEFAULT 1,
  bg_audio INTEGER NOT NULL DEFAULT 1,
  day_get_gold TIMESTAMP WITHOUT TIME ZONE
);

COMMENT ON TABLE users IS '用户表';
COMMENT ON COLUMN users.user_account IS '微信授权的用户，账号为openid';
COMMENT ON COLUMN users.wx_openid IS '微信用户登录，没有openid为游客登录';
COMMENT ON COLUMN users.gold IS '游戏元宝';
COMMENT ON COLUMN users.game_audio IS '1 开启音乐 0 关闭音乐（默认1）';
COMMENT ON COLUMN users.bg_audio IS '1 开启音乐 0 关闭音乐（默认1）';
COMMENT ON COLUMN users.day_get_gold IS '每日登录领取1000元宝（领取过存入当前日期）';

-- ----------------------------
-- 插入房间等级数据
-- ----------------------------
INSERT INTO room_level VALUES (1, '1', '100');
INSERT INTO room_level VALUES (2, '2', '500');
INSERT INTO room_level VALUES (3, '3', '1000');
INSERT INTO room_level VALUES (4, '4', '2000');

-- ----------------------------
-- 插入用户数据
-- 注意：gold字段已改为INTEGER，去掉了原字符串的单引号
-- ----------------------------
INSERT INTO users VALUES (10000, '66666', '往事随风', '123456', '123456', '/Image/default_head.png', NULL, 17300, 1, 1, '2025-07-28 06:25:08');
INSERT INTO users VALUES (10001, '5eb695f481e8470eaa5d686f37e60fb0', '亮亮', '1234567', '1234567', 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJtsQmxy0NwUtIESiaEHDnUaFpHOSRIDKmLXoKBbfFIaqPAF6c0cn4wyMQnB3TTkz0OPOO6KVl8zOg/132', 'otm1W43FF8Y23EgAoBfZ00WKR0X0', 2850, 0, 1, '2025-07-28 06:26:14');
INSERT INTO users VALUES (10002, 'ffb6462a12f44b1897158930fa736424', 'liang_ffb6462a12f44b1897158930fa736424', '12345678', '12345678', '/Image/default_head.png', '', 25600, 1, 0, '2025-07-29 10:42:24');
INSERT INTO users VALUES (10003, '9776b158ef6647fbb78b81aedeaa417e', 'liang_9776b158ef6647fbb78b81aedeaa417e', '12345677', '12345677', '/Image/default_head.png', '', 1100, 1, 1, NULL);
INSERT INTO users VALUES (10004, '997a61a25e06457395adbb942519f867', '亮亮', NULL, NULL, 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJtsQmxy0NwUtIESiaEHDnUaFpHOSRIDKmLXoKBbfFIaqPAF6c0cn4wyMQnB3TTkz0OPOO6KVl8zOg/132', '', 1550, 1, 1, NULL);
INSERT INTO users VALUES (10005, 'dc0489cc49694fe5bd990b467ff6beb1', '亮亮', NULL, NULL, 'https://thirdwx.qlogo.cn/mmopen/vi_32/Q0j4TwGTfTJBQjSXAggpwYMa5RVUtibp7iahOVNRJkhmH9XjgoZ7ukovIm5rm20H9pUw6Cr7vRk9afbUvicbdHia7g/132', 'of1A-5W96FgrRiAWD2-0z5BZm_MY', 5100, 1, 1, '2025-09-01 13:44:20');
INSERT INTO users VALUES (10006, '21be283635564832b96db305640691b6', '男孩亮亮', NULL, NULL, 'https://thirdwx.qlogo.cn/mmopen/vi_32/PiajxSqBRaEJqE5ia7P9zuFP0CX6CXro8ggMbJicsr9icpshrdiazS6ugtQmry1SKzWvwan3DyohibVwZ1fldjBsVaWQ/132', 'of1A-5bUJ-SepPQyLCFbM99S_QY8', 9150, 1, 1, '2025-09-09 18:19:41');

-- ----------------------------
-- 插入游戏记录数据（共173条，保留原JSON格式）
-- ----------------------------


-- ----------------------------
-- 重置序列值（确保后续自动增长ID正确）
-- ----------------------------
SELECT setval('game_record_id_seq', (SELECT MAX(id) FROM game_record));
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));