"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const decors_1 = require("../utils/decors");
const mysql_1 = require("../mysql");
class Health {
    // 健康检查接口
    static async healthCheck(ctx) {
        try {
            // 检查数据库连接
            const [rows] = await mysql_1.default.inst.query('SELECT 1 as status');
            ctx.body = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: 'connected'
            };
        }
        catch (error) {
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
    static async status(ctx) {
        ctx.body = {
            service: 'pukepai-server',
            version: '1.0.0',
            status: 'running',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString()
        };
    }
}
exports.default = Health;
__decorate([
    (0, decors_1.get)('/health')
], Health, "healthCheck", null);
__decorate([
    (0, decors_1.get)('/status')
], Health, "status", null);
//# sourceMappingURL=health.js.map