# Render服务器部署指南

## 项目概述
这是一个Cocos斗地主游戏的Node.js服务器，使用TypeScript开发，支持WebSocket实时通信。

## 部署到Render平台

### 第一步：准备GitHub仓库

1. **创建GitHub仓库**
   ```bash
   # 在项目根目录执行
   git init
   git add .
   git commit -m "初始提交：Cocos斗地主游戏服务器"
   git branch -M main
   git remote add origin https://github.com/你的用户名/cocos-doudizhu-server.git
   git push -u origin main
   ```

2. **确保仓库包含以下文件**：
   - `pukepai_server/` - 服务器代码
   - `package.json` - 依赖配置
   - `tsconfig.json` - TypeScript配置
   - `Dockerfile` - 容器化配置
   - `render.yaml` - Render配置

### 第二步：Render平台配置

#### 方法一：使用Web界面部署

1. **访问Render网站**：https://render.com
2. **注册账户**：使用GitHub账户登录
3. **创建Web Service**：
   - 点击 "New" → "Web Service"
   - 连接GitHub账户
   - 选择你的仓库：`cocos-doudizhu-server`

4. **配置服务参数**：
   - **Name**: `doudizhu-server`
   - **Environment**: `Node`
   - **Region**: `Oregon`（推荐）
   - **Branch**: `main`
   - **Root Directory**: `pukepai_server`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`

5. **环境变量配置**：
   在Environment Variables中添加：
   ```
   NODE_ENV=production
   PORT=10000
   ```

#### 方法二：使用Docker部署

1. **创建Web Service**时选择：
   - **Environment**: `Docker`
   - **Dockerfile Path**: `pukepai_server/Dockerfile`

### 第三步：数据库配置

#### 选项一：使用Render PostgreSQL（推荐）

1. 在Render创建PostgreSQL数据库
2. 导入数据库结构：
   ```sql
   -- 使用playing_card.sql文件初始化数据库
   ```
3. 配置环境变量：
   ```
   DB_HOST=your-render-postgres-host
   DB_PORT=5432
   DB_NAME=doudizhu_game
   DB_USER=your-username
   DB_PASSWORD=your-password
   ```

#### 选项二：使用外部MySQL

1. 配置外部MySQL连接信息
2. 设置环境变量：
   ```
   DB_HOST=your-mysql-host
   DB_PORT=3306
   DB_NAME=doudizhu_game
   DB_USER=your-username
   DB_PASSWORD=your-password
   ```

### 第四步：部署验证

1. **检查部署状态**：
   - 在Render控制台查看构建日志
   - 确保所有步骤都成功

2. **测试健康检查**：
   ```bash
   curl https://doudizhu-server.onrender.com/health
   ```

3. **测试服务器状态**：
   ```bash
   curl https://doudizhu-server.onrender.com/status
   ```

### 第五步：客户端配置

#### 微信小程序配置

1. **服务器域名配置**：
   - request合法域名：`https://doudizhu-server.onrender.com`
   - socket合法域名：`wss://doudizhu-server.onrender.com`
   - uploadFile合法域名：`https://doudizhu-server.onrender.com`
   - downloadFile合法域名：`https://doudizhu-server.onrender.com`

2. **修改客户端配置**：
   在客户端代码中更新服务器地址：
   ```typescript
   // 修改为Render服务器地址
   const SERVER_URL = 'https://doudizhu-server.onrender.com';
   const WS_URL = 'wss://doudizhu-server.onrender.com';
   ```

### 第六步：自定义域名（可选）

1. **添加自定义域名**：
   - 在Render的Settings中点击"Add Custom Domain"
   - 输入你的域名（如：`api.doudizhu.yoursite.com`）
   - 配置DNS记录指向Render提供的CNAME

2. **SSL证书**：Render自动提供免费SSL证书

## 故障排除

### 常见问题

1. **构建失败**：
   - 检查package.json依赖是否正确
   - 查看构建日志中的具体错误

2. **数据库连接失败**：
   - 确认环境变量设置正确
   - 检查数据库白名单设置

3. **WebSocket连接失败**：
   - 确认使用wss://协议
   - 检查防火墙设置

### 监控和日志

1. **查看日志**：在Render控制台的Logs标签页
2. **监控性能**：使用Render的内置监控工具
3. **设置告警**：配置性能阈值告警

## 成本控制

- **免费套餐**：每月750小时运行时间
- **数据库**：PostgreSQL有免费1GB存储
- **自定义域名**：免费
- **SSL证书**：免费

## 更新部署

当代码更新时，Render会自动重新部署。也可以手动触发部署：

1. 在Render控制台点击"Manual Deploy"
2. 选择要部署的分支
3. 确认部署

## 技术支持

如果遇到问题：
1. 查看Render文档：https://render.com/docs
2. 检查项目日志
3. 联系Render支持团队