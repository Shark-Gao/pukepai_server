/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function initializePostgreSQL() {
    try {
        // 使用Render提供的DATABASE_URL环境变量
        const databaseUrl = process.env.DATABASE_URL;
        
        if (!databaseUrl) {
            throw new Error('DATABASE_URL环境变量未设置');
        }

        console.log('正在连接PostgreSQL数据库...');
        const client = new Client({
            connectionString: databaseUrl,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        await client.connect();
        console.log('PostgreSQL数据库连接成功');

        // 读取PostgreSQL初始化脚本
        const sqlFilePath = path.join(__dirname, '../database_init.sql');
        console.log(`正在读取SQL文件: ${sqlFilePath}`);
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        console.log('SQL文件读取成功');

        // 执行SQL脚本
        console.log('正在执行PostgreSQL数据库初始化...');
        await client.query(sqlContent);
        console.log('PostgreSQL数据库初始化完成');

        // 验证表结构
        console.log('验证表结构...');
        const tablesResult = await client.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `);

        console.log('数据库表列表:');
        tablesResult.rows.forEach(table => {
            console.log(`- ${table.table_name}`);
        });

        await client.end();
        console.log('PostgreSQL数据库初始化脚本执行完成');
        
    } catch (error) {
        console.error('PostgreSQL数据库初始化失败:', error.message);
        console.error('数据库初始化失败，但服务将继续启动...');
        // 不调用 process.exit(1)，避免阻断服务启动
    }
}

// 如果是直接运行此脚本
if (require.main === module) {
    initializePostgreSQL();
}

module.exports = { initializePostgreSQL };