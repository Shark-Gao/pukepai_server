"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var User_1;
Object.defineProperty(exports, "__esModule", { value: true });
const decors_1 = require("../utils/decors");
const mysql_1 = require("../mysql");
const room_1 = require("../utils/room");
const webSocket_1 = require("./websocket/webSocket");
const tools_1 = require("../utils/tools");
// 获取用户信息校验token
let User = User_1 = class User {
    // 获取用户信息
    static async login(ctx) {
        const { userInfo } = ctx.request.body || {};
        console.log("userInfo", userInfo);
        try {
            const [rows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold, game_audio, bg_audio from users where user_id = ?`, [userInfo.user_id]);
            // @ts-ignore
            if (rows.length > 0) {
                ctx.body = {
                    code: 200,
                    data: rows[0],
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
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 查询用户是否又加入的房间（尝试重连）,重连之后调用joinRoom加入房间
    static async reConnection(ctx) {
        const { userInfo } = ctx.request.body || {};
        try {
            const userRoomId = Object.keys(room_1.RoomObj).filter(roomId => {
                return room_1.RoomObj[roomId].roomUsers[userInfo.user_id];
            }) || [];
            // 房间存在 && 用户在房间中
            if (userRoomId[0]) {
                // 判断用户元宝是否充足
                let { status, message } = await User_1.GoldIsAdequate({
                    userId: userInfo.user_id,
                    roomId: userRoomId[0],
                });
                if (status) {
                    ctx.body = {
                        code: 200,
                        data: {
                            roomId: userRoomId[0],
                        },
                        message: '成功'
                    };
                }
                else {
                    ctx.body = {
                        code: 400,
                        message: message
                    };
                }
            }
            else {
                ctx.body = {
                    code: 200,
                    data: {},
                    message: '用户没有加入的房间',
                };
            }
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 加入房间
    static async joinRoom(ctx) {
        const { userInfo, roomId } = ctx.request.body || {};
        const roomInfo = room_1.RoomObj[roomId];
        // console.log("joinRoomInfo", roomInfo, roomId);
        if (!roomInfo) {
            ctx.body = {
                code: 400,
                message: "房间不存在",
            };
        }
        else {
            // 判断用户元宝是否充足
            let { status, message } = await User_1.GoldIsAdequate({
                userId: userInfo.user_id,
                roomId
            });
            if (status) {
                // 加入房间
                const { status, message } = (0, room_1.userJoinRoom)(userInfo, roomId);
                if (!status) {
                    ctx.body = {
                        code: 400,
                        message: message,
                    };
                }
                else {
                    // 通知其他用户有人加入房间
                    const otherUser = Object.keys(roomInfo.roomUsers).filter(id => id != userInfo.user_id);
                    // 通知其他用户
                    otherUser.forEach((value, index) => {
                        const userInfo = roomInfo.roomUsers[value];
                        // 通知用户有玩家加入房间
                        (0, webSocket_1.wsSend)(userInfo.ws, {
                            type: "userJoinRoomUpdate",
                            code: 200,
                            data: Object.assign(Object.assign({}, roomInfo), { roomUsers: (0, tools_1.clientReturnRoomUsers)(roomInfo.roomUsers, userInfo.user_id) }), // 返回用户信息
                            message: '加入房间成功'
                        });
                    });
                    // 通知加入用户加入的房间ID
                    ctx.body = {
                        code: 200,
                        data: {
                            roomId: roomId,
                        },
                        message: "加入房间成功",
                    };
                }
            }
            else {
                ctx.body = {
                    code: 400,
                    message: message,
                };
            }
        }
    }
    // 获取玩家是否正在对局（不允许玩家存在两个对局中）
    static async getUserPlaying(ctx) {
        const { userInfo } = ctx.request.body || {};
        console.log("RoomObj", room_1.RoomObj, userInfo);
        let filterList = Object.keys(room_1.RoomObj).filter(roomId => {
            const roomInfo = room_1.RoomObj[roomId];
            return roomInfo.roomUserIdList.some(userId => userId === userInfo.user_id);
        });
        ctx.body = {
            code: 200,
            data: Object.assign({ isInRoom: filterList.length > 0 ? true : false, roomId: filterList[0] }, (filterList.length > 0 ? { gameStatus: room_1.RoomObj[filterList[0]].gameStatus } : {})),
            message: "获取成功",
        };
    }
    // 创建房间
    static async createRoom(ctx) {
        const { userInfo, level, gameMode = 0, specialRules = {}, robotCount = 0, robotLevel = 0 } = ctx.request.body || {};
        // 判断用户元宝是否充足
        let { status, message } = await User_1.GoldIsAdequate({
            userId: userInfo.user_id,
            level
        });
        if (status) {
            // 创建房间，存到内存中，不写入数据库
            const roomId = await (0, room_1.CreateRoom)({
                userInfo,
                level: level,
                gameMode, // 0=Doudizhu, 1=Shuangjian
                specialRules, // Shuangjian only; ignored by Doudizhu
                robotCount,
                robotLevel,
            });
            console.log("createRoomInfo", roomId, "mode:", gameMode);
            ctx.body = {
                code: 200,
                data: roomId,
                message: "创建房间成功",
            };
        }
        else {
            ctx.body = {
                code: 400,
                message: message,
            };
        }
    }
    // 获取战绩
    static async getRecord(ctx) {
        const { userInfo, gameMode = 0 } = ctx.request.body || {};
        console.log("getRecord", userInfo, "mode:", gameMode);
        try {
            if (gameMode === 1) {
                // Shuangjian — separate table, 4 user-id columns.
                const { getShuangjianRecordsByUser } = require('../mysql/shuangjianRecord');
                const rows = await getShuangjianRecordsByUser(userInfo.user_id);
                ctx.body = { code: 200, data: rows };
                return;
            }
            const [rows] = await mysql_1.default.inst.query(`select * from game_record where user_1_id = ? or user_2_id = ? or user_3_id = ? order by end_time DESC`, [userInfo.user_id, userInfo.user_id, userInfo.user_id]);
            // @ts-ignore
            ctx.body = {
                code: 200,
                data: rows,
            };
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 分享链接获取是否可以加入房间
    static async queryJoinRoom(ctx) {
        const { userInfo, roomId } = ctx.request.body || {};
        // console.log("getRecord", userInfo)
        const roomInfo = room_1.RoomObj[roomId];
        try {
            // 先判断房间是否存在 userJoinRoom 方法也会进行判断，但是他判断可以加入时，直接加入房间了
            if (!roomInfo) {
                ctx.body = {
                    code: 200,
                    data: {
                        success: false,
                    },
                    message: "房间不存在",
                };
            }
            else {
                // 判断用户元宝是否充足
                let { status: goldIsAdequate, message } = await User_1.GoldIsAdequate({
                    userId: userInfo.user_id,
                    roomId
                });
                if (goldIsAdequate) {
                    // 判断玩家是否存在其他房间中，判断加入房间是否已满，判断加入房间
                    let { status, message } = (0, room_1.userJoinRoom)(userInfo, roomId);
                    if (status) {
                        // 通知房间内其他用户有玩家加入
                        const outherUser = roomInfo.roomUserIdList.filter(userId => userId && userId != userInfo.user_id);
                        outherUser.forEach(userId => {
                            // 通知其他用户更新用户信息
                            const roomUserInfo = roomInfo.roomUsers[userId];
                            (0, webSocket_1.wsSend)(roomUserInfo.ws, {
                                type: "userJoinRoomUpdate",
                                code: 200,
                                data: Object.assign(Object.assign({}, roomInfo), { roomUsers: (0, tools_1.clientReturnRoomUsers)(roomInfo.roomUsers, userId) }), // 返回用户信息
                                message: '加入房间成功'
                            });
                        });
                        ctx.body = {
                            code: 200,
                            data: {
                                success: true,
                            },
                            message: "加入房间成功",
                        };
                    }
                    else {
                        ctx.body = {
                            code: 200,
                            data: {
                                success: false,
                            },
                            message: message,
                        };
                    }
                }
                else {
                    ctx.body = {
                        code: 400,
                        error: message,
                    };
                }
            }
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 问题反馈
    static async feedback(ctx) {
        const { userInfo, feedback } = ctx.request.body || {};
        // console.log("feedback", userInfo, feedback)
        try {
            let [rows] = await mysql_1.default.inst.query(`insert into feedback (user_id, feedback, time) values (?, ?, ?)`, [userInfo.user_id, feedback, new Date()]);
            if (rows.affectedRows > 0) {
                ctx.body = {
                    code: 200,
                    data: {
                        success: true,
                    },
                    message: "反馈成功",
                };
            }
            else {
                ctx.body = {
                    code: 200,
                    data: {
                        success: false,
                    },
                    message: "反馈失败",
                };
            }
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 获取设置信息
    static async getSetting(ctx) {
        const { userInfo } = ctx.request.body || {};
        try {
            let [rows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold, game_audio, bg_audio from users where user_id = ?`, [userInfo.user_id]);
            if (rows.length > 0) {
                ctx.body = {
                    code: 200,
                    data: {
                        wxOpenId: rows[0].wx_openid,
                        gameAudio: rows[0].game_audio,
                        bgAudio: rows[0].bg_audio
                    },
                    message: "获取成功",
                };
            }
            else {
                ctx.body = {
                    code: 200,
                    message: "获取失败",
                };
            }
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 获取设置信息
    static async changeAudio(ctx) {
        const { userInfo, audioStatus } = ctx.request.body || {};
        try {
            let [rows] = await mysql_1.default.inst.query(`update users set game_audio = ? where user_id = ?`, [audioStatus, userInfo.user_id]);
            ctx.body = {
                code: 200,
                data: true,
                message: '修改成功'
            };
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 获取设置信息
    static async changeBgAudio(ctx) {
        const { userInfo, audioStatus } = ctx.request.body || {};
        try {
            let [rows] = await mysql_1.default.inst.query(`update users set bg_audio = ? where user_id = ?`, [audioStatus, userInfo.user_id]);
            ctx.body = {
                code: 200,
                data: true,
                message: '修改成功'
            };
        }
        catch (error) {
            ctx.body = {
                code: 500,
                error: error,
                message: '服务器错误'
            };
        }
    }
    // 用户绑定微信
    static async userBindWx(ctx) {
        const { userInfo, openid, wxUserInfo } = ctx.request.body || {};
        console.log('userInfo', userInfo);
        try {
            // 查询该微信是否已经绑定账号
            let [userRows] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold, game_audio from users where wx_openid = ?`, [openid]);
            if (userRows.length > 0) {
                return ctx.body = {
                    code: 200,
                    data: false,
                    message: '改微信已经绑定账号'
                };
            }
            // 绑定微信账号
            const [rows] = await mysql_1.default.inst.query(`update users set wx_openid = ?, user_name = ?, user_head_img = ? where user_id = ?`, [openid, wxUserInfo.nickName, wxUserInfo.avatarUrl, userInfo.user_id]);
            console.log("rows", rows);
            // @ts-ignore
            if (rows.affectedRows > 0) {
                ctx.body = {
                    code: 200,
                    data: true,
                    message: '绑定成功'
                };
            }
            else {
                ctx.body = {
                    code: 200,
                    data: false,
                    message: '绑定失败'
                };
            }
        }
        catch (error) {
            console.log("error", error);
            ctx.body = {
                code: 500,
                message: '绑定失败'
            };
        }
    }
    // 每日领取元宝
    static async claimDaily(ctx) {
        var _a;
        const { userInfo } = ctx.request.body || {};
        try {
            // 查询该微信是否已经绑定账号
            let [userRows] = await mysql_1.default.inst.query(`select day_get_gold, gold from users where user_id = ?`, [userInfo.user_id]);
            if (userRows.length > 0) {
                const { year, month, day } = ((_a = userRows[0]) === null || _a === void 0 ? void 0 : _a.day_get_gold) ? (0, tools_1.timestampToDate)(userRows[0].day_get_gold) : {};
                const { year: locYear, month: locMonth, day: locDay } = (0, tools_1.timestampToDate)(new Date().getTime());
                if (year != locYear || month != locMonth || day != locDay) {
                    // 更新用户金币
                    let [rows] = await mysql_1.default.inst.query(`update users set gold = gold + ?, day_get_gold = ? where user_id = ?`, [1000, new Date(), userInfo.user_id]);
                    // @ts-ignore
                    if (rows.affectedRows > 0) {
                        return ctx.body = {
                            code: 200,
                            data: {
                                success: true,
                                gold: Number(userRows[0].gold) + 1000
                            },
                            message: '领取成功'
                        };
                    }
                    else {
                        return ctx.body = {
                            code: 200,
                            data: {
                                success: false,
                            },
                            message: '领取失败,更新数据失败'
                        };
                    }
                }
                else {
                    return ctx.body = {
                        code: 200,
                        data: {
                            success: false,
                            gold: 0
                        },
                        message: '已领取'
                    };
                }
            }
            else {
                return ctx.body = {
                    code: 200,
                    data: {
                        success: false,
                    },
                    message: '领取失败'
                };
            }
        }
        catch (error) {
            console.log("error", error);
            ctx.body = {
                code: 500,
                message: '服务器错误'
            };
        }
    }
    /**
     * 判断玩家元宝是否充足，匹配、创建房间、加入房间、分享加入，都需要判断
     * @param userId 请求用户ID
     * @param level 根据房间等级判断用户元宝是否充足
     * @param roomId 根据房间ID判断用户元宝是否充足
     * @returns
     */
    static async GoldIsAdequate({ userId, level = "", roomId = "" }) {
        // 传入了房间ID但是房间不存在
        if (roomId && !room_1.RoomObj[roomId]) {
            console.log(roomId, !room_1.RoomObj[roomId]);
            return {
                status: false,
                message: '房间不存在'
            };
        }
        else {
            // 查询用户信息获取用户元宝
            const [userInfos] = await mysql_1.default.inst.query(`select * from users where user_id = ?`, [userId]);
            if (userInfos.length > 0) {
                // 传入了房间ID，证明是要加入房间，对比当前用户元宝和房间元宝基数做对比
                const [levelInfo] = await mysql_1.default.inst.query(`select * from room_level where level = ?`, [roomId && room_1.RoomObj[roomId] ? room_1.RoomObj[roomId].level : level]);
                // 用户元宝大于房间基数，运行进行下一步
                if (Number(userInfos[0].gold) >= Number(levelInfo[0].base)) {
                    return {
                        status: true,
                        message: '元宝充足'
                    };
                }
                else {
                    return {
                        status: false,
                        message: '元宝不足'
                    };
                }
            }
            else {
                return {
                    status: false,
                    message: '用户信息查询失败'
                };
            }
        }
    }
};
__decorate([
    (0, decors_1.post)('/getUserInfo')
], User, "login", null);
__decorate([
    (0, decors_1.post)('/reConnection')
], User, "reConnection", null);
__decorate([
    (0, decors_1.post)("/joinRoom")
], User, "joinRoom", null);
__decorate([
    (0, decors_1.post)('/getUserPlaying')
], User, "getUserPlaying", null);
__decorate([
    (0, decors_1.post)("/createRoom")
], User, "createRoom", null);
__decorate([
    (0, decors_1.post)("/getRecord")
], User, "getRecord", null);
__decorate([
    (0, decors_1.post)("/queryJoinRoom")
], User, "queryJoinRoom", null);
__decorate([
    (0, decors_1.post)("/feedback")
], User, "feedback", null);
__decorate([
    (0, decors_1.post)("/getSetting")
], User, "getSetting", null);
__decorate([
    (0, decors_1.post)("/changeAudio")
], User, "changeAudio", null);
__decorate([
    (0, decors_1.post)("/changeBgAudio")
], User, "changeBgAudio", null);
__decorate([
    (0, decors_1.post)('/userBindWx')
], User, "userBindWx", null);
__decorate([
    (0, decors_1.post)('/claimDaily')
], User, "claimDaily", null);
User = User_1 = __decorate([
    decors_1.authToken
], User);
exports.default = User;
//# sourceMappingURL=user.js.map