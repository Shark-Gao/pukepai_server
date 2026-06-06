"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketRoomBaseRouter = void 0;
const decors_1 = require("../../utils/decors");
const room_1 = require("../../utils/room");
const webSocket_1 = require("./webSocket");
const tools_1 = require("../../utils/tools");
const webSocketDealCardsRouter_1 = require("./webSocketDealCardsRouter");
// 房间基础路由（创建房间、获取房间信息、加入房间、准备、退出房间）
class webSocketRoomBaseRouter {
    static dismissRoomIfOnlyHostedUsers(roomId, ignoreUserId = '') {
        const roomInfo = room_1.RoomObj[roomId];
        const roomUsers = roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUsers;
        const roomUserIds = Object.keys(roomUsers || {}).filter(userId => userId != ignoreUserId);
        if (roomUsers && roomUserIds.length > 0 && roomUserIds.every(userId => roomUsers[userId].is_hosted)) {
            clearInterval(roomInfo.count_down_timer);
            delete room_1.RoomObj[roomId];
            return true;
        }
        return false;
    }
    // 获取房间信息
    async getRoomInfo({ ws, token, userInfo, params }) {
        var _a;
        const roomInfo = room_1.RoomObj[String(params.roomId)];
        // console.log("getRoomInfo", RoomObj, roomInfo, params.roomId)
        if (!roomInfo.roomUsers[userInfo.user_id]) {
            (0, webSocket_1.wsSend)(ws, {
                type: "getRoomInfo",
                code: 400,
                message: '您不在该房间'
            });
        }
        else {
            // 判断当前用户在房间内是否已经建立过连接，且连接状态为 open（可能多窗口打开）
            if (roomInfo.roomUsers[userInfo.user_id].ws != ws && ((_a = roomInfo.roomUsers[userInfo.user_id].ws) === null || _a === void 0 ? void 0 : _a.OPEN)) {
                // 关闭当前连接
                (0, webSocket_1.wsSend)(roomInfo.roomUsers[userInfo.user_id].ws, {
                    type: "replaceLogin",
                    code: 200,
                    message: '您被挤掉线了，请重新连接'
                });
                // 关闭连接
                roomInfo.roomUsers[userInfo.user_id].ws.close(1000);
            }
            // 判断该用户是否已经再房间内了，比如开始游戏了退出了，重新进入
            roomInfo.roomUsers[userInfo.user_id] = Object.assign(Object.assign({}, roomInfo.roomUsers[userInfo.user_id]), { ws: ws });
            (0, webSocket_1.wsSend)(ws, {
                type: "getRoomInfo",
                code: 200,
                data: Object.assign(Object.assign({}, roomInfo), { roomUsers: (0, tools_1.clientReturnRoomUsers)(roomInfo.roomUsers, userInfo.user_id) }),
                message: '成功'
            });
        }
    }
    // 准备
    async ready({ ws, token, userInfo, params }) {
        const roomInfo = room_1.RoomObj[params.roomId];
        // 修改准备状态
        roomInfo.roomUsers[userInfo.user_id].ready = room_1.PlayerReadyStatus.READY;
        // 通知所有用户，房间用户准备状态
        const roomUserIds = Object.keys(roomInfo.roomUsers);
        roomUserIds.forEach((value, index) => {
            const userInfo = roomInfo.roomUsers[value];
            // 通知更新准备状态
            (0, webSocket_1.wsSend)(userInfo.ws, {
                type: "ready",
                code: 200,
                data: roomInfo, // 返回所有用户的准备状态
                message: '成功'
            });
        });
        const roomUsers = Object.values(roomInfo.roomUsers);
        // Player count required by the current game mode (3 for Doudizhu, 4 / 2 for Shuangjian).
        const requiredCount = roomInfo.gameModeImpl
            ? roomInfo.gameModeImpl.getMinPlayerCount()
            : 3;
        // 判断游戏未开始 & 房间满员 & 全部用户都准备了 （发牌）
        if (roomInfo['gameStatus'] == room_1.GameStatus.NOSTART
            && roomUsers.length == requiredCount
            && roomUsers.every(value => value.ready == room_1.PlayerReadyStatus.READY)) {
            // 所有用户都准备了，由对应模式实现发牌
            if (roomInfo.gameModeImpl) {
                roomInfo.gameModeImpl.dealCards(roomInfo);
            }
            else {
                webSocketDealCardsRouter_1.webSocketDealCardsRouter.dealCards({ ws, token, userInfo, params });
            }
        }
    }
    // 用户退出房间
    async userOutRoom({ ws, token, userInfo, params }) {
        const roomInfo = room_1.RoomObj[params.roomId];
        // 游戏在抢地主状态 || 已经开始打牌 退出游戏
        if (roomInfo.gameStatus == room_1.GameStatus.START || roomInfo.gameStatus == room_1.GameStatus.SNATCHLABDLORD) {
            // 给退出房间用户发送退出成功
            (0, webSocket_1.wsSend)(ws, {
                type: "userOutRoom",
                code: 200,
                data: {
                    roomOutUserId: userInfo.user_id
                },
                message: '成功'
            });
            // 删除掉该用户的websocket
            roomInfo.roomUsers[userInfo.user_id].ws = null;
            webSocketRoomBaseRouter.dismissRoomIfOnlyHostedUsers(params.roomId, userInfo.user_id);
        }
        else {
            // 删除该用户
            delete roomInfo.roomUsers[userInfo.user_id];
            // 删除用户数组中的对应项，数组能保证顺序不会改变
            const index = roomInfo.roomUserIdList.indexOf(userInfo.user_id);
            roomInfo.roomUserIdList[index] = "";
            // 获取删除后，房间所有用户id
            const roomUserIds = Object.keys(roomInfo.roomUsers);
            // 给退出房间用户发送退出成功
            (0, webSocket_1.wsSend)(ws, {
                type: "userOutRoom",
                code: 200,
                data: {
                    roomOutUserId: userInfo.user_id
                },
                message: '成功'
            });
            // 判断用户退出后房间是否还有人，没有删除房间
            if (roomUserIds.length == 0) {
                // 删除房间
                delete room_1.RoomObj[params.roomId];
                return;
            }
            else if (webSocketRoomBaseRouter.dismissRoomIfOnlyHostedUsers(params.roomId)) {
                return;
            }
            else if (userInfo.user_id == roomInfo.room_owner_id) { // 退出的是房主，将第一个用户设置为房主
                roomInfo.room_owner_id = roomUserIds[0];
            }
            // 通知其他用户有人退出房间
            roomUserIds.forEach((value, index) => {
                const onlineUserInfo = roomInfo.roomUsers[value];
                // 通知更新房间用户信息
                (0, webSocket_1.wsSend)(onlineUserInfo.ws, {
                    type: "userOutRoom",
                    code: 200,
                    data: {
                        roomOutUserId: userInfo.user_id,
                        roomInfo: roomInfo
                    }, // 返回所有用户的准备状态
                    message: '成功'
                });
            });
        }
    }
    // 房间重连获取用户是否还在房间中，是否被系统踢出了
    async roomReconnection({ ws, token, userInfo, params, urlParams }) {
        const roomInfo = room_1.RoomObj[urlParams.roomId];
        (0, webSocket_1.wsSend)(ws, {
            code: 200,
            type: 'roomReconnection',
            data: roomInfo.roomUsers[userInfo.user_id] ? true : false // 判断用户是否还在房间中
        });
    }
}
exports.webSocketRoomBaseRouter = webSocketRoomBaseRouter;
__decorate([
    (0, decors_1.authSocketToken)({
        verifyRoomId: true
    })
], webSocketRoomBaseRouter.prototype, "getRoomInfo", null);
__decorate([
    (0, decors_1.authSocketToken)({
        verifyRoomId: true
    })
], webSocketRoomBaseRouter.prototype, "ready", null);
__decorate([
    (0, decors_1.authSocketToken)({
        verifyRoomId: true
    })
], webSocketRoomBaseRouter.prototype, "userOutRoom", null);
__decorate([
    (0, decors_1.authSocketToken)()
], webSocketRoomBaseRouter.prototype, "roomReconnection", null);
//# sourceMappingURL=webSocketRoomBaseRouter.js.map