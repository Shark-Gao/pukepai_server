"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerReadyStatus = exports.GameStatus = exports.CreateRoom = exports.RoomObj = exports.RoomType = void 0;
exports.userJoinRoom = userJoinRoom;
const uuid_1 = require("uuid");
const tools_1 = require("./tools");
const mysql_1 = require("../mysql");
const GameModeFactory_1 = require("../gameMode/GameModeFactory");
const IGameMode_1 = require("../gameMode/IGameMode");
const types_1 = require("../ai/types");
// 游戏状态枚举
var GameStatus;
(function (GameStatus) {
    GameStatus[GameStatus["NOSTART"] = 0] = "NOSTART";
    GameStatus[GameStatus["SNATCHLABDLORD"] = 1] = "SNATCHLABDLORD";
    GameStatus[GameStatus["START"] = 2] = "START";
})(GameStatus || (exports.GameStatus = GameStatus = {}));
// 玩家准备状态
var PlayerReadyStatus;
(function (PlayerReadyStatus) {
    PlayerReadyStatus[PlayerReadyStatus["READY"] = 0] = "READY";
    PlayerReadyStatus[PlayerReadyStatus["UNREADY"] = 1] = "UNREADY";
})(PlayerReadyStatus || (exports.PlayerReadyStatus = PlayerReadyStatus = {}));
// 房间类型
var RoomType;
(function (RoomType) {
    RoomType[RoomType["USERCREATE"] = 0] = "USERCREATE";
    RoomType[RoomType["MATCHING"] = 1] = "MATCHING";
})(RoomType || (exports.RoomType = RoomType = {}));
// 游戏房间状态抽象类（不入库的房间状态数据）
class GameRoomStatus {
}
// 房间类
class Room extends GameRoomStatus {
    // 修改用户信息
    setRoomUserStatus(RoomUserStatus) {
        // 修改用户信息，先判断是否有该用户
        if (this.roomUsers && this.roomUsers[RoomUserStatus.user_id]) {
            // 修改用户信息
            Object.assign(this.roomUsers[RoomUserStatus.user_id], RoomUserStatus);
        }
        else {
            console.log('用户不存在,该房间');
        }
    }
    constructor(obj) {
        super();
        this.start_time = null;
        this.end_time = null;
        this.room_owner_id = null; // 房主id
        this.landlord_id = null; // 地主id
        this.room_rate = 1; // 初始倍率为1
        this.level = null; // 房间等级
        this.room_base = null; // 房间基数
        this.room_id = null; // 房间id
        this.roomUsers = null; // 定义未map 方便用户取值，但是循环麻烦
        // Up to 4 seats so the same array works for both Doudizhu (3) and Shuangjian (4)
        this.roomUserIdList = ["", "", "", ""]; // 为什么有定义一个用户id List，因为出牌的时候要逆时针出牌，但是用户加入房间再次退出的时候，直接重roomUsers中删除了，所以相对应的位置也改变了
        this.gameStatus = GameStatus.NOSTART;
        this.bottom_card = []; // 底牌默认空
        this.snatch_landlord_record = []; // 抢地主总记录
        this.current_snatch_landlord_user = ""; // 当前抢地主玩家
        this.snatch_landlord_time = 20; // 用户抢地主默认时间
        this.snatch_landlord_countDown = this.snatch_landlord_time; // 用户抢地主剩余时间
        this.play_card_time = 20; // 用户出牌等待时间
        this.play_card_countDown = this.play_card_time; // 用户出牌剩余时间
        this.double_time = 5; // 用户选择加倍默认时间
        this.double_countDown = -1; // 用户选择加倍剩余时间(-1 未选择过加倍)
        this.count_down_timer = null; // 计时器
        this.play_card_record = []; // 玩家出牌记录
        this.current_play_card_user = ""; // 当前出牌用户id
        this.room_type = null; // 房间类型 玩家创建 和 系统匹配
        this.robot_level = types_1.RobotLevel.Simple; // AI difficulty level
        // ==================== Shuangjian / multi-mode fields ====================
        this.game_mode = IGameMode_1.GameMode.DOUDIZHU; // 0=Doudizhu, 1=Shuangjian
        this.special_rules = {}; // 双剑特殊规则
        this.partner_card = -1; // 搭档牌（庄家随机指定的一张牌）
        this.is_baopai = false; // 是否包牌(1打3)
        this.partner_revealed = false; // 搭档牌是否已揭晓
        this.landlord_camp = []; // 庄家阵营 user_id 列表
        this.farmer_camp = []; // 闲家阵营 user_id 列表
        this.shuangjian_free_play_user = ''; // 双剑特殊自由出牌用户
        this.pass_user_record = []; // 出完牌的玩家排名记录
        this.baopai_countDown = -1; // 包牌选择剩余时间
        this.baopai_time = 15; // 包牌选择默认时间
        this.gameModeImpl = null; // 当前模式策略实例（由 GameModeFactory 创建）
        // 初始化数据
        Object.keys(obj).forEach(key => {
            if (this[key] !== undefined) {
                this[key] = obj[key];
            }
        });
    }
}
// 房间对象
const RoomObj = {};
exports.RoomObj = RoomObj;
function buildRoomUserStatus(userInfo, ready = PlayerReadyStatus.UNREADY, isHosted = false) {
    return {
        id: userInfo.id,
        user_card: [],
        ws: null,
        user_id: userInfo.user_id,
        user_name: userInfo.user_name,
        user_head_img: userInfo.user_head_img,
        user_account: userInfo.user_account,
        gold: userInfo.gold,
        wx_openid: userInfo.wx_openid,
        ready,
        redouble_status: null,
        mingpai: false,
        get_ingots: 0,
        snatch_landlord_num: 0,
        is_hosted: isHosted,
    };
}
function createRobotUser(index, levelBase) {
    const robotId = `robot_${(0, uuid_1.v4)().replace(/-/g, '').slice(0, 12)}`;
    return {
        id: robotId,
        user_id: robotId,
        user_name: `Robot ${index}`,
        user_head_img: '/Image/default_head.png',
        user_account: robotId,
        gold: String(Math.max(Number(levelBase || 0) * 100, 999999)),
        wx_openid: '',
    };
}
/**
 * 创建房间
 * @param {Object} userInfo 用户信息
 * @param {number} level 房间等级
 * @param {RoomType} roomType 房间类型 玩家创建 和 系统匹配
 * @param {GameMode} gameMode 游戏模式（默认斗地主）
 * @param {SpecialRules} specialRules 双剑特殊规则
 */
const CreateRoom = async ({ userInfo, level, roomType = RoomType.USERCREATE, gameMode = IGameMode_1.GameMode.DOUDIZHU, specialRules = {}, robotCount = 0, robotLevel = types_1.RobotLevel.Simple }) => {
    // 获取房间等级信息
    const [rows] = await mysql_1.default.inst.query(`select id, level, base from room_level`);
    const [userInfoDb] = await mysql_1.default.inst.query(`select id, user_id, user_name, user_account, user_head_img, wx_openid, gold from users where user_id = ?`, [userInfo.user_id]);
    console.log(userInfoDb);
    // Build the mode implementation upfront so capability queries work immediately.
    const modeImpl = GameModeFactory_1.gameModeFactory.create(gameMode);
    const maxSeats = modeImpl.getMaxPlayerCount();
    const safeRobotCount = Math.min(Math.max(Number(robotCount) || 0, 0), Math.max(maxSeats - 1, 0));
    const safeRobotLevel = (0, types_1.normalizeRobotLevel)(robotLevel);
    console.log("robot difficulty level", safeRobotLevel, types_1.RobotLevel[safeRobotLevel], "raw:", robotLevel);
    const levelInfo = rows.find((item) => item.level === level);
    if (!levelInfo) {
        throw new Error(`Room level not found: ${level}`);
    }
    const room_id = (0, tools_1.generateRoomId)(RoomObj);
    console.log("生成房间id为", room_id, "模式:", gameMode);
    // Pre-fill an empty seat list with the correct length
    const seatList = new Array(maxSeats).fill("");
    seatList[0] = userInfoDb[0].user_id;
    const roomUsers = {
        [userInfoDb[0].user_id]: buildRoomUserStatus(userInfoDb[0]),
    };
    for (let i = 1; i <= safeRobotCount; i++) {
        const robotUser = createRobotUser(i, (levelInfo === null || levelInfo === void 0 ? void 0 : levelInfo.base) || 0);
        roomUsers[robotUser.user_id] = buildRoomUserStatus(robotUser, PlayerReadyStatus.READY, true);
        seatList[i] = robotUser.user_id;
    }
    RoomObj[room_id] = new Room({
        room_id,
        room_owner_id: userInfoDb[0].user_id, // 房主id
        level, // 房间等级
        room_rate: 1, //  初始倍率为1
        room_base: levelInfo.base, // 房间基数
        room_type: roomType, // 房间类型
        robot_level: safeRobotLevel,
        game_mode: gameMode,
        special_rules: specialRules || {},
        gameModeImpl: modeImpl,
        roomUsers,
        roomUserIdList: seatList
    });
    return room_id;
};
exports.CreateRoom = CreateRoom;
// 房间加入用户
function userJoinRoom(userInfo, roomId) {
    const roomInfo = RoomObj[roomId];
    // 获取用户已经加入的房间ID
    const userJoinRooms = Object.keys(RoomObj).filter(roomId => {
        var _a;
        return (_a = RoomObj[roomId].roomUsers) === null || _a === void 0 ? void 0 : _a[userInfo.user_id];
    });
    // 房间不存在
    if (!roomInfo) {
        return {
            status: false,
            message: '房间不存在'
        };
    }
    else if (userJoinRooms.length > 0) { // 存在已经加入的房间
        // 如果已经加入的房间和要加入的房间ID一致，证明是断线重连，则直接返回true
        if (userJoinRooms[0] == roomId) {
            return {
                status: true,
                message: '允许加入'
            };
        }
        else {
            return {
                status: false,
                message: '你已经加入过别的房间，不能加入两个房间'
            };
        }
    }
    else if (Object.keys(roomInfo.roomUsers || {}).length >= (roomInfo.gameModeImpl ? roomInfo.gameModeImpl.getMaxPlayerCount() : 3)) {
        // 判断用户列表中有多少用户（按当前模式动态决定上限）
        return {
            status: false,
            message: "房间已满"
        };
    }
    else {
        // 添加用户
        if (!roomInfo.roomUsers) {
            roomInfo.roomUsers = {};
        }
        roomInfo.roomUsers[userInfo.user_id] = Object.assign({ ws: null, user_card: [], ready: PlayerReadyStatus.UNREADY, redouble_status: null, mingpai: false, get_ingots: 0, snatch_landlord_num: 0, is_hosted: false }, userInfo);
        // 存入用户id列表
        const index = roomInfo.roomUserIdList.indexOf("");
        roomInfo.roomUserIdList[index] = userInfo.user_id;
        return {
            status: true,
            message: "加入成功"
        };
    }
}
//# sourceMappingURL=room.js.map