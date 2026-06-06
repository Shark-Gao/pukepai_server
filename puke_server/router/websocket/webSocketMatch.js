"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketMatchRouter = exports.setMatchUserList = exports.matchUserList = void 0;
const tools_1 = require("../../utils/tools");
const decors_1 = require("../../utils/decors");
const room_1 = require("../../utils/room");
const webSocket_1 = require("./webSocket");
const user_1 = require("../user");
const GameModeFactory_1 = require("../../gameMode/GameModeFactory");
/**
 * Match queues are partitioned by both level and gameMode so that Doudizhu
 * (3 seats) and Shuangjian (4 seats) never share a queue.
 *
 * Key format: `${level}_${gameMode}`.
 */
exports.matchUserList = {};
/** Build the queue key for a given (level, gameMode). */
function buildMatchKey(level, gameMode) {
    return `${level}_${gameMode}`;
}
const setMatchUserList = (level, arr) => {
    // Backwards compatible setter (Doudizhu default).
    exports.matchUserList[buildMatchKey(level, GameModeFactory_1.GameMode.DOUDIZHU)] = arr;
};
exports.setMatchUserList = setMatchUserList;
// 匹配
class webSocketMatchRouter {
    // 开启游戏匹配
    async match({ ws, token, userInfo, params }) {
        var _a, _b;
        // 判断用户元宝是否充足
        let { status, message } = await user_1.default.GoldIsAdequate({
            userId: userInfo.user_id,
            level: params.level
        });
        if (!status) {
            (0, webSocket_1.wsSend)(ws, { type: "match", code: 400, message });
            return;
        }
        const gameMode = (_a = params.gameMode) !== null && _a !== void 0 ? _a : GameModeFactory_1.GameMode.DOUDIZHU;
        const specialRules = params.specialRules || {};
        const queueKey = buildMatchKey(params.level, gameMode);
        if (!exports.matchUserList[queueKey])
            exports.matchUserList[queueKey] = [];
        // Required seat count for THIS match request.
        const modeImpl = GameModeFactory_1.gameModeFactory.create(gameMode);
        const requiredCount = modeImpl.getMaxPlayerCount();
        const robotCount = Math.min(Math.max(Number(params.robotCount) || 0, 0), Math.max(requiredCount - 1, 0));
        const robotLevel = (_b = params.robotLevel) !== null && _b !== void 0 ? _b : 0;
        if (robotCount > 0) {
            const roomId = await (0, room_1.CreateRoom)({
                userInfo: Object.assign(Object.assign({}, userInfo), { ws }),
                level: params.level,
                roomType: room_1.RoomType.MATCHING,
                gameMode,
                specialRules,
                robotCount,
                robotLevel,
            });
            console.log(`机器人匹配成功 mode=${gameMode} robots=${robotCount}`, userInfo.user_id);
            (0, webSocket_1.wsSend)(ws, {
                type: 'match',
                code: 200,
                data: { roomId },
                message: '匹配成功',
            });
            return;
        }
        // 1) Try to join an existing matching room of the SAME mode/level with empty seats.
        const matchingRoom = Object.keys(room_1.RoomObj).filter(roomId => {
            var _a;
            const roomInfo = room_1.RoomObj[roomId];
            const sameMode = ((_a = roomInfo.game_mode) !== null && _a !== void 0 ? _a : GameModeFactory_1.GameMode.DOUDIZHU) === gameMode;
            const sameLevel = roomInfo.level == params.level;
            return roomInfo.room_type === room_1.RoomType.MATCHING
                && roomInfo.gameStatus === room_1.GameStatus.NOSTART
                && sameMode && sameLevel
                && roomInfo.roomUserIdList.some(id => !id);
        });
        if (matchingRoom.length > 0) {
            const roomId = matchingRoom[0];
            const roomInfo = room_1.RoomObj[roomId];
            const { status: joinStatus, message: joinMsg } = (0, room_1.userJoinRoom)(userInfo, roomId);
            if (joinStatus) {
                (0, webSocket_1.wsSend)(ws, { type: 'match', code: 200, data: { roomId }, message: '匹配成功' });
                // 通知房间内其他玩家
                Object.keys(roomInfo.roomUsers).filter(id => id != userInfo.user_id).forEach((userId) => {
                    const roomUserInfo = roomInfo.roomUsers[userId];
                    (0, webSocket_1.wsSend)(roomUserInfo.ws, {
                        type: "userJoinRoomUpdate",
                        code: 200,
                        data: Object.assign(Object.assign({}, roomInfo), { roomUsers: (0, tools_1.clientReturnRoomUsers)(roomInfo.roomUsers, userId) }),
                        message: '加入房间成功'
                    });
                });
            }
            else {
                (0, webSocket_1.wsSend)(ws, { type: 'match', code: 400, message: joinMsg });
            }
            return;
        }
        // 2) Otherwise enqueue & try to form a fresh room.
        exports.matchUserList[queueKey].push(Object.assign(Object.assign({}, userInfo), { ws }));
        if (exports.matchUserList[queueKey].length >= requiredCount) {
            const matchUser = exports.matchUserList[queueKey].splice(0, requiredCount);
            const roomId = await (0, room_1.CreateRoom)({
                userInfo: matchUser[0],
                level: params.level,
                roomType: room_1.RoomType.MATCHING,
                gameMode,
                specialRules,
            });
            console.log(`匹配成功 mode=${gameMode} required=${requiredCount}`, matchUser.map(u => u.user_id));
            // The room owner is already in the room via CreateRoom; bring the rest in.
            for (let i = 0; i < matchUser.length; i++) {
                const u = matchUser[i];
                if (i > 0) {
                    (0, room_1.userJoinRoom)(u, roomId);
                }
                (0, webSocket_1.wsSend)(u.ws, {
                    type: 'match',
                    code: 200,
                    data: { roomId },
                    message: '匹配成功',
                });
            }
        }
        else {
            (0, webSocket_1.wsSend)(ws, { type: 'match', code: 200, message: '匹配中' });
        }
    }
    // 退出匹配
    cancelMatch({ ws, token, userInfo, params }) {
        var _a;
        const gameMode = (_a = params.gameMode) !== null && _a !== void 0 ? _a : GameModeFactory_1.GameMode.DOUDIZHU;
        const queueKey = buildMatchKey(params.level, gameMode);
        if (exports.matchUserList[queueKey]) {
            exports.matchUserList[queueKey] = exports.matchUserList[queueKey].filter((item) => userInfo.user_id !== item.user_id);
        }
        (0, webSocket_1.wsSend)(ws, {
            type: 'cancelMatch',
            code: 200,
            message: '退出匹配成功',
        });
    }
}
exports.webSocketMatchRouter = webSocketMatchRouter;
__decorate([
    (0, decors_1.authSocketToken)()
], webSocketMatchRouter.prototype, "match", null);
__decorate([
    (0, decors_1.authSocketToken)()
], webSocketMatchRouter.prototype, "cancelMatch", null);
//# sourceMappingURL=webSocketMatch.js.map