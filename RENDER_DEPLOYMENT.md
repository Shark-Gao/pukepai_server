# Render PostgreSQL数据库部署指南

## 部署流程

### 1. 准备GitHub仓库
确保你的代码已经推送到GitHub仓库。

### 2. 在Render创建Web服务
1. 登录 [Render控制台](https://dashboard.render.com)
2. 点击"New" → "Web Service"
3. 连接你的GitHub仓库
4. 配置服务：
   - **Name**: `doudizhu-game-server`
   - **Environment**: `Node`
   - **Region**: 选择离你最近的区域
   - **Branch**: `main` (或你的主分支)
   - **Root Directory**: `pukepai_server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run render:init && npm start`

### 3. 配置环境变量
在Render控制台的Environment Variables中设置：
```
NODE_ENV=production
DATABASE_URL=自动从关联的数据库获取
```

### 4. 创建PostgreSQL数据库
1. 在Render控制台点击"New" → "PostgreSQL"
2. 配置数据库：
   - **Name**: `doudizhu-game-db`
   - **Database**: `doudizhu_game`
   - **Region**: 与Web服务相同的区域
3. 将数据库关联到Web服务

### 5. 手动初始化数据库（如果自动初始化失败）

#### 方法A：使用Render Web控制台
1. 进入PostgreSQL数据库详情页
2. 点击"Connect" → "Web Console"
3. 复制以下SQL并执行：

```sql
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
```

#### 方法B：使用本地命令行
```bash
# 安装psql命令行工具
# 然后使用Render提供的连接字符串
psql "postgresql://username:password@host:port/database" < database_init.sql
```

## 验证部署成功

### 检查Web服务状态
1. 在Render控制台查看Web服务状态应为"Live"
2. 点击服务URL测试是否可访问

### 验证数据库连接
服务器启动后，检查日志中是否有数据库初始化成功的消息。

### 测试API接口
使用curl或Postman测试服务器API：
```bash
# 测试服务器状态
curl https://your-render-url.onrender.com/health

# 测试数据库连接
curl https://your-render-url.onrender.com/api/test-db
```

## 故障排除

### 常见问题

**Q: 部署失败，提示数据库连接错误**
A: 检查DATABASE_URL环境变量是否正确设置

**Q: 数据库初始化失败**
A: 手动执行SQL脚本，检查错误信息

**Q: Web服务无法启动**
A: 查看构建日志和运行时日志

**Q: SSL连接问题**
A: 在生产环境中需要配置SSL证书

### 日志查看
在Render控制台可以查看：
- 构建日志（Build Logs）
- 运行时日志（Runtime Logs）
- 数据库连接日志

## 后续维护

### 数据库备份
Render会自动备份PostgreSQL数据库，你也可以手动创建备份。

### 版本更新
推送代码到GitHub后，Render会自动重新部署。

### 监控
使用Render的监控功能查看服务性能和资源使用情况。