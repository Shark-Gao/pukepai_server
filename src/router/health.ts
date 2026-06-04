/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
import * as Koa from 'koa';
import { get } from '../utils/decors';
import pool from '../mysql';

export default class Health {
    // 健康检查接口
    @get('/health')
    public static async healthCheck(ctx: Koa.Context) {
        try {
            // 检查数据库连接
            const [rows] = await pool.inst.query('SELECT 1 as status');
            
            ctx.body = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: 'connected'
            };
        } catch (error) {
            ctx.status = 503;
            ctx.body = {
                status: 'error',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: 'disconnected',
                error: error.message
            };
        }
    }

    // 服务器状态接口
    @get('/status')
    public static async status(ctx: Koa.Context) {
        ctx.body = {
            service: 'pukepai-server',
            version: '1.0.0',
            status: 'running',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
    }
}