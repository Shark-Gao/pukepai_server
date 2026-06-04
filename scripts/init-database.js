/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
const fs = require('fs');
const mysql = require('mysql2/promise');

async function initializeDatabase() {
    try {
        // 数据库连接配置
        const connectionConfig = {
            host: process.env.DB_HOST || 'localhost',
            port: process.env.DB_PORT || 3306,
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || '',
            database: process.env.DB_NAME || 'playing_card',
            multipleStatements: true
        };

        console.log('正在连接数据库...');
        const connection = await mysql.createConnection(connectionConfig);
        console.log('数据库连接成功');

        // 读取SQL文件
        const sqlFilePath = process.env.SQL_FILE_PATH || '../../playing_card.sql';
        console.log(`正在读取SQL文件: ${sqlFilePath}`);
        
        const sqlContent = fs.readFileSync(sqlFilePath, 'utf8');
        console.log('SQL文件读取成功');

        // 执行SQL脚本
        console.log('正在执行数据库初始化...');
        await connection.execute(sqlContent);
        console.log('数据库初始化完成');

        // 验证表结构
        console.log('验证表结构...');
        const [tables] = await connection.execute(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = ?
        `, [connectionConfig.database]);

        console.log('数据库表列表:');
        tables.forEach(table => {
            console.log(`- ${table.table_name}`);
        });

        await connection.end();
        console.log('数据库初始化脚本执行完成');
        
    } catch (error) {
        console.error('数据库初始化失败:', error.message);
        process.exit(1);
    }
}

// 如果是直接运行此脚本
if (require.main === module) {
    initializeDatabase();
}

module.exports = { initializeDatabase };