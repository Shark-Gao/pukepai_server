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
const axios_1 = require("axios");
const token_1 = require("../utils/token");
const uuid_1 = require("uuid");
// 微信小游戏的appid和appsecret
const GameAppID = "wx1fdfb7565f035409";
const GameAppSecret = "54dba0a1ed2a3a9c8265dcb864c23cd5";
// 微信
class wxApi {
    // code 换取 openid
    static async codeGetOpenId(ctx) {
        // 获取参数
        const { code, getRegister } = ctx.request.body || {};
        console.log(code);
        const validateRet = (0, decors_1.validateParams)({ code });
        if (validateRet) {
            return ctx.body = { code: 400, error: validateRet, message: '参数错误' };
        }
        ;
        try {
            // 调用微信 jscode2session 接口
            const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${GameAppID}&secret=${GameAppSecret}&js_code=${code}&grant_type=authorization_code`;
            const response = await axios_1.default.get(url);
            console.log(response.data);
            const { openid, session_key } = response.data;
            let userRows;
            if (getRegister) {
                // 查询数据库，判断用户是否存在，不存在客户端获取用户信息传递给服务端
                [userRows] = await mysql_1.default.inst.query(`select * from users where wx_openid = ?`, [openid]);
            }
            // 返回 openid 和 session_key 给前端（注意：session_key 不能泄露给前端）
            ctx.body = {
                code: 200,
                data: Object.assign({
                    openid,
                }, getRegister ? { isRegister: userRows.length > 0 } : {}),
            };
        }
        catch (error) {
            console.error('调用微信接口失败:', error);
            ctx.body = { code: 400, error, message: '调用微信接口失败' };
        }
    }
    // 微信登录
    static async wxLogin(ctx) {
        const { openid, wxUserInfo } = ctx.request.body || {};
        // 查询数据库，判断用户是否存在，不存在 则注册，存在则登录
        const [rows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold from users where wx_openid = ?`, [openid]);
        // @ts-ignore
        if (rows.length > 0) {
            wxApi.wxOpenIdLogin(ctx, openid, rows);
        }
        else {
            // 微信注册账号
            const idWithoutDashes = (0, uuid_1.v4)().replace(/-/g, '');
            await mysql_1.default.inst.query(`insert into users (user_name, user_id,  user_head_img, wx_openid) values (?,?,?,?)`, [wxUserInfo.nickName, idWithoutDashes, wxUserInfo.avatarUrl, openid]);
            wxApi.wxOpenIdLogin(ctx, openid);
        }
    }
    /**
     * 通过wxopenid 查询用户并登录
     * @param ctx
     * @param openid
     * @param userRows 传来查询的用户数据，不在进行查询
     */
    static async wxOpenIdLogin(ctx, openid, userRows) {
        var rows = userRows;
        if (!rows) {
            // 查询数据库，判断用户是否存在，不存在 则注册，存在则登录
            [rows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold from users where wx_openid = ?`, [openid]);
        }
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
    }
}
exports.default = wxApi;
__decorate([
    (0, decors_1.post)('/codeGetOpenId')
], wxApi, "codeGetOpenId", null);
__decorate([
    (0, decors_1.post)('/wxLogin')
], wxApi, "wxLogin", null);
//# sourceMappingURL=wx_login.js.map