"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const uuid_1 = require("uuid");
const decors_1 = require("../utils/decors");
const mysql_1 = require("../mysql");
const token_1 = require("../utils/token");
/**
 * 游客登录：游客登录采用账号密码登录模式，游客登录时，需要先注册账号，再登录
 * 微信登录：微信登录时，可以直接登录（是否要绑定游客数据）
 */
// 登录注册
class Login {
    // 游客登录注册用户
    static async registerUser(ctx) {
        const { userAccount, userPassword, userHeadImg = "/Image/default_head.png", openId = "" } = ctx.request.body || {};
        console.log('[registerUser] userAccount:', userAccount);
        console.log('[registerUser] userPassword:', userPassword);
        const validateRet = (0, decors_1.validateParams)({ userAccount, userPassword });
        if (validateRet) {
            return ctx.body = { code: 400, error: validateRet, message: '参数错误' };
        }
        ;
        try {
            // 查找账号是否已存在
            const [rows] = await mysql_1.default.inst.query(`select * from users where user_account = ? `, [userAccount]);
            // @ts-ignore
            if ((rows === null || rows === void 0 ? void 0 : rows.length) > 0) {
                return ctx.body = {
                    code: 400,
                    error: '',
                    message: '账号已存在'
                };
            }
            // 注册
            const idWithoutDashes = (0, uuid_1.v4)().replace(/-/g, '');
            const userName = `liang_${idWithoutDashes}`;
            await mysql_1.default.inst.query(`insert into users (user_name, user_id, user_account, user_password, user_head_img, wx_openid) values (?,?,?,?,?,?)`, [userName, idWithoutDashes, userAccount, userPassword, userHeadImg, openId]);
            ctx.body = {
                code: 200,
                message: '注册成功'
            };
        }
        catch (error) {
            console.error('[registerUser] err.message:', error.message);
            console.error('[registerUser] err.position:', error.position);
            console.error('[registerUser] err.where:', error.where);
            console.error('[registerUser] err.internalQuery:', error.internalQuery);
            console.error('[registerUser] full err:', error);
            ctx.body = {
                code: 400,
                error: error,
                message: '注册失败'
            };
        }
    }
    // 登录
    static async login(ctx) {
        const { userAccount, userPassword } = ctx.request.body || {};
        const validateRet = (0, decors_1.validateParams)({ userAccount, userPassword });
        console.log('[login] validateRet:', validateRet);
        if (validateRet) {
            return ctx.body = { code: 400, error: validateRet, message: '参数错误' };
        }
        ;
        try {
            const [rows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold from users where user_account = ? and user_password = ?`, [userAccount, userPassword]);
            // @ts-ignore
            if (rows.length > 0) {
                // 登录成功签名生成token
                let token = (0, token_1.create)(Object.assign({}, rows[0]));
                ctx.cookies.set('token', token, {
                    maxAge: 24 * 60 * 60 * 1000, // 有效期为24小时
                    expires: new Date(Date.now() + 24 * 60 * 60 * 1000), // 过期时间
                    httpOnly: false, // 仅服务器可以访问Cookie
                    path: '/', // Cookie的路径
                    // domain: 'example.com', // Cookie的域名
                    // secure: true, // 仅在HTTPS下传输Cookie
                    overwrite: true // 是否覆盖同名Cookie
                });
                ctx.body = {
                    code: 200,
                    data: rows[0],
                    token,
                    message: '登录成功'
                };
            }
            else {
                ctx.body = {
                    code: 400,
                    error: '',
                    message: '账号或密码错误'
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
}
exports.default = Login;
__decorate([
    (0, decors_1.post)('/registerUser')
], Login, "registerUser", null);
__decorate([
    (0, decors_1.post)('/login')
], Login, "login", null);
//# sourceMappingURL=login.js.map