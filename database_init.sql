-- PostgreSQL数据库初始化脚本
-- 适用于Render PostgreSQL数据库

-- 创建数据库（Render会自动创建，这里主要用于本地测试）
-- CREATE DATABASE doudizhu_game;

-- 切换到目标数据库
-- \c doudizhu_game;

-- 创建表结构

-- 用户反馈表
CREATE TABLE IF NOT EXISTS feedback (
    id SERIAL PRIMARY KEY,
    feedback VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 游戏记录表
CREATE TABLE IF NOT EXISTS game_record (
    id SERIAL PRIMARY KEY,
    start_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    user_1_id VARCHAR(255) NOT NULL,
    user_2_id VARCHAR(255) NOT NULL,
    user_3_id VARCHAR(255) NOT NULL,
    room_owner_id VARCHAR(255) NOT NULL,
    landlord_id VARCHAR(255) NOT NULL,
    user_1_get_ingots INTEGER NOT NULL,
    user_2_get_ingots INTEGER NOT NULL,
    user_3_get_ingots INTEGER NOT NULL,
    user_1_redouble INTEGER,
    user_2_redouble INTEGER,
    user_3_redouble INTEGER,
    user_1_mingpai INTEGER NOT NULL DEFAULT 0,
    user_2_mingpai INTEGER NOT NULL DEFAULT 0,
    user_3_mingpai INTEGER NOT NULL DEFAULT 0,
    room_rate INTEGER NOT NULL,
    level INTEGER NOT NULL,
    room_id VARCHAR(255) NOT NULL,
    victory_user_id VARCHAR(255) NOT NULL,
    play_card_record TEXT NOT NULL
);

-- 房间等级表
CREATE TABLE IF NOT EXISTS room_level (
    id SERIAL PRIMARY KEY,
    level INTEGER NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    base INTEGER NOT NULL,
    min INTEGER NOT NULL,
    max INTEGER NOT NULL,
    rate INTEGER NOT NULL
);

-- 用户表
CREATE TABLE IF NOT EXISTS "user" (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    user_name VARCHAR(255),
    user_account VARCHAR(255),
    user_head_img TEXT,
    wx_openid VARCHAR(255),
    gold INTEGER DEFAULT 1000,
    game_audio BOOLEAN DEFAULT true,
    bg_audio BOOLEAN DEFAULT true,
    day_get_gold TIMESTAMP
);

-- 插入房间等级数据
INSERT INTO room_level (level, name, base, min, max, rate) VALUES
(1, '初级场', 100, 2, 999, 1),
(2, '中级场', 500, 501, 4999, 2),
(3, '高级场', 2000, 2001, 9999, 4),
(4, '大师场', 10000, 10001, 99999, 8)
ON CONFLICT (level) DO NOTHING;

-- 插入示例用户数据
INSERT INTO "user" (user_id, user_name, user_account, gold) VALUES
('test_user_1', '测试用户1', 'test1', 5000),
('test_user_2', '测试用户2', 'test2', 3000),
('test_user_3', '测试用户3', 'test3', 8000)
ON CONFLICT (user_id) DO NOTHING;