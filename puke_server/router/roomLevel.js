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
// 获取用户信息校验token
let User = class User {
    // 获取用户信息
    static async getRoomLevel(ctx) {
        const body = ctx.request.body || {};
        try {
            const [rows] = await mysql_1.default.inst.query(`select id, level, base from room_level`);
            // @ts-ignore
            if (rows.length > 0) {
                ctx.body = {
                    code: 200,
                    data: rows,
                    message: '成功'
                };
            }
            else {
                ctx.body = {
                    code: 400,
                    error: '',
                    message: '获取失败'
                };
            }
        }
        catch (error) {
            ctx.body = {
                code: 400,
                error: error,
                message: '服务器错误'
            };
        }
    }
};
__decorate([
    (0, decors_1.post)('/getRoomLevel')
], User, "getRoomLevel", null);
User = __decorate([
    decors_1.authToken
], User);
exports.default = User;
//# sourceMappingURL=roomLevel.js.map