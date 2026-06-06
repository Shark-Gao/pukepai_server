"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startShuangjianPlayLoop = startShuangjianPlayLoop;
exports.handleShuangjianUserPlayCard = handleShuangjianUserPlayCard;
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * webSocketShuangjianPlayCard
 *
 * Owns the entire play-card flow for the Shuangjian (Twin-Sword) mode:
 *
 *   1. Validate the play via gameModeImpl.judgeCardType / compareCards.
 *   2. Apply onPlayCard hooks (partner reveal, ranking).
 *   3. Decide whether the round is over via gameModeImpl.isGameOver, and if
 *      so build the settlement payload and broadcast it.
 *   4. Otherwise rotate the turn around the 4-seat ring, skipping any
 *      players who have already finished their cards.
 *
 * The Doudizhu path lives untouched in webSocketPlayCardRouter; this module
 * is only invoked when room.game_mode === GameMode.SHUANGJIAN.
 */
const room_1 = require("../../utils/room");
const webSocket_1 = require("./webSocket");
const tools_1 = require("../../utils/tools");
const IGameMode_1 = require("../../gameMode/IGameMode");
const shuangjianAi_1 = require("../../ai/shuangjianAi");
/** Per-play broadcast type used by the Shuangjian client. */
const MSG_PLAY_CARD = 'userPlayCard'; // reuse Doudizhu event so RoomPlayCard renders without changes
const MSG_GAME_OVER = 'shuangjianGameOver';
const MSG_PLAY_TIMER = 'playCardTimer'; // reuse Doudizhu turn-timer event
/**
 * Drive the "next player to play" logic for Shuangjian. We walk the seat
 * ring counter-clockwise (matching Doudizhu's convention) and skip any
 * player whose hand is empty.
 *
 * The ring is roomUserIdList; for Shuangjian the array length is fixed at 4.
 */
function nextPlayerInRing(roomInfo, currentUserId) {
    const roomUsers = roomInfo.roomUsers;
    const ring = roomInfo.roomUserIdList.filter(id => !!id);
    if (ring.length === 0)
        return null;
    const startIdx = ring.indexOf(currentUserId);
    if (startIdx < 0)
        return ring[0];
    for (let step = 1; step <= ring.length; step++) {
        // Counter-clockwise: previous index, wrap around the head.
        const idx = (startIdx - step + ring.length) % ring.length;
        const candidate = ring[idx];
        const u = roomUsers[candidate];
        if (u && Array.isArray(u.user_card) && u.user_card.length > 0) {
            return candidate;
        }
    }
    return null; // every other seat is empty (round must be over)
}
function getLastNonEmptyRecord(roomInfo) {
    var _a, _b;
    const records = (roomInfo.play_card_record || []);
    for (let i = records.length - 1; i >= 0; i--) {
        if (((_b = (_a = records[i]) === null || _a === void 0 ? void 0 : _a.playCard) === null || _b === void 0 ? void 0 : _b.length) > 0) {
            return { record: records[i], index: i };
        }
    }
    return null;
}
function isFreePlayTurn(roomInfo, userId, lastRecord) {
    if (roomInfo.shuangjian_free_play_user === userId)
        return true;
    return !lastRecord || lastRecord.userId === userId;
}
function getUserCamp(roomInfo, userId) {
    const landlordCamp = (roomInfo.landlord_camp || []);
    const farmerCamp = (roomInfo.farmer_camp || []);
    if (landlordCamp.indexOf(userId) >= 0)
        return landlordCamp;
    if (farmerCamp.indexOf(userId) >= 0)
        return farmerCamp;
    return [];
}
function getTeammateWithCards(roomInfo, userId) {
    var _a, _b;
    const roomUsers = roomInfo.roomUsers;
    const camp = getUserCamp(roomInfo, userId);
    for (const teammateId of camp) {
        if (teammateId !== userId && ((_b = (_a = roomUsers[teammateId]) === null || _a === void 0 ? void 0 : _a.user_card) === null || _b === void 0 ? void 0 : _b.length) > 0) {
            return teammateId;
        }
    }
    return null;
}
function getTeammateFreePlayUserAfterAllPass(roomInfo) {
    var _a, _b, _c, _d;
    const lastInfo = getLastNonEmptyRecord(roomInfo);
    if (!lastInfo)
        return null;
    const lastUserId = lastInfo.record.userId;
    const roomUsers = roomInfo.roomUsers;
    if (((_b = (_a = roomUsers[lastUserId]) === null || _a === void 0 ? void 0 : _a.user_card) === null || _b === void 0 ? void 0 : _b.length) > 0)
        return null;
    const teammateId = getTeammateWithCards(roomInfo, lastUserId);
    if (!teammateId)
        return null;
    const aliveUserIds = (roomInfo.roomUserIdList || [])
        .filter(id => { var _a, _b; return !!id && ((_b = (_a = roomUsers[id]) === null || _a === void 0 ? void 0 : _a.user_card) === null || _b === void 0 ? void 0 : _b.length) > 0; });
    if (aliveUserIds.length <= 0)
        return null;
    const passedAfterLastPlay = new Set();
    const records = (roomInfo.play_card_record || []);
    for (let i = lastInfo.index + 1; i < records.length; i++) {
        if (((_d = (_c = records[i]) === null || _c === void 0 ? void 0 : _c.playCard) === null || _d === void 0 ? void 0 : _d.length) === 0) {
            passedAfterLastPlay.add(records[i].userId);
        }
    }
    return aliveUserIds.every(id => passedAfterLastPlay.has(id)) ? teammateId : null;
}
/**
 * Cancel any active timer and notify the next player it's their turn.
 */
function pushTurnToUser(roomId, userId) {
    var _a;
    const roomInfo = room_1.RoomObj[roomId];
    if (!roomInfo)
        return;
    if (roomInfo.count_down_timer) {
        clearInterval(roomInfo.count_down_timer);
        roomInfo.count_down_timer = null;
    }
    roomInfo.current_play_card_user = userId;
    const roomUsers = roomInfo.roomUsers;
    const isHostedTurn = !!((_a = roomUsers[userId]) === null || _a === void 0 ? void 0 : _a.is_hosted);
    roomInfo.play_card_countDown = isHostedTurn ? Math.min(roomInfo.play_card_time || 20, 3) : roomInfo.play_card_time;
    const userIds = roomInfo.roomUserIdList.filter(id => !!id);
    const tick = () => {
        // Build the most recent non-empty record (used as "yapai" reference).
        const lastRecord = roomInfo.play_card_record
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        const isFreePlay = isFreePlayTurn(roomInfo, userId, lastRecord);
        for (const uid of userIds) {
            const me = roomUsers[uid];
            (0, webSocket_1.wsSend)(me.ws, {
                type: MSG_PLAY_TIMER,
                code: 200,
                data: {
                    userId,
                    downTime: roomInfo.play_card_countDown,
                    isYaPai: !isFreePlay,
                    userCard: me.user_card,
                },
                message: '成功',
            });
        }
        if (roomInfo.play_card_countDown <= 0) {
            clearInterval(roomInfo.count_down_timer);
            roomInfo.count_down_timer = null;
            // Timeout / hosted turn: free play must play at least one card; pressing can pass only when no card can beat.
            robotPlayAndAdvance(roomId, userId);
            return;
        }
        roomInfo.play_card_countDown -= 1;
    };
    tick();
    roomInfo.count_down_timer = setInterval(tick, 1000);
}
/**
 * Initial entry called by ShuangjianMode.startPlay → triggers the first
 * timer for the banker.
 */
function startShuangjianPlayLoop(roomId) {
    const roomInfo = room_1.RoomObj[roomId];
    if (!roomInfo || !roomInfo.landlord_id)
        return;
    pushTurnToUser(roomId, roomInfo.landlord_id);
}
function robotPlayAndAdvance(roomId, userId) {
    const roomInfo = room_1.RoomObj[roomId];
    if (!roomInfo || roomInfo.current_play_card_user !== userId)
        return;
    const roomUsers = roomInfo.roomUsers;
    const me = roomUsers[userId];
    if (!me || !Array.isArray(me.user_card) || me.user_card.length <= 0) {
        recordPassAndAdvance(roomId, userId);
        return;
    }
    const lastRecord = roomInfo.play_card_record
        .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
    const isFreePlay = isFreePlayTurn(roomInfo, userId, lastRecord);
    const aiStrategy = (0, shuangjianAi_1.getShuangjianAiStrategy)(roomInfo.robot_level);
    let playCards = aiStrategy.choosePlayCards({
        roomInfo,
        userId,
        handCards: me.user_card || [],
        lastRecord,
        isFreePlay,
    });
    if (playCards.length <= 0) {
        const protectTeammatePlay = !isFreePlay && getUserCamp(roomInfo, userId).indexOf(lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) >= 0;
        if (!protectTeammatePlay) {
            const impl = roomInfo.gameModeImpl;
            const hintCards = impl.getCardHint(isFreePlay ? [] : (lastRecord.playCard || []), me.user_card || []);
            playCards = Array.isArray(hintCards) ? hintCards : [];
        }
    }
    if (playCards.length > 0) {
        const impl = roomInfo.gameModeImpl;
        const playType = impl.judgeCardType(playCards);
        const owns = playCards.every(card => (me.user_card || []).indexOf(card) >= 0);
        const canPress = isFreePlay || impl.compareCards(impl.judgeCardType(lastRecord.playCard || []), playType) > 0;
        if (!owns || !playType.valid || !canPress) {
            playCards = [];
        }
    }
    if (!playCards || playCards.length <= 0) {
        if (!isFreePlay) {
            recordPassAndAdvance(roomId, userId);
            return;
        }
        const fallbackCard = (me.user_card || [])[0];
        if (fallbackCard === undefined) {
            recordPassAndAdvance(roomId, userId);
            return;
        }
        playCards = [fallbackCard];
    }
    handleShuangjianUserPlayCard({
        ws: me.ws,
        userInfo: me,
        params: { roomId, playCards },
    }).catch((error) => {
        var _a;
        console.error('[Shuangjian] robot play failed', error);
        const latestRoomInfo = room_1.RoomObj[roomId];
        if (!latestRoomInfo || latestRoomInfo.current_play_card_user !== userId)
            return;
        const latestRecord = latestRoomInfo.play_card_record
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        const latestRoomUsers = latestRoomInfo.roomUsers;
        if (isFreePlayTurn(latestRoomInfo, userId, latestRecord)) {
            const fallbackCard = (((_a = latestRoomUsers[userId]) === null || _a === void 0 ? void 0 : _a.user_card) || [])[0];
            if (fallbackCard !== undefined) {
                handleShuangjianUserPlayCard({
                    ws: latestRoomUsers[userId].ws,
                    userInfo: latestRoomUsers[userId],
                    params: { roomId, playCards: [fallbackCard] },
                });
            }
        }
        else {
            recordPassAndAdvance(roomId, userId);
        }
    });
}
/** Record an automatic pass (timeout) and advance to the next player. */
function recordPassAndAdvance(roomId, userId) {
    const roomInfo = room_1.RoomObj[roomId];
    if (!roomInfo)
        return;
    const record = {
        userId,
        playCard: [],
        gameOver: false,
        gameOverData: [],
    };
    roomInfo.play_card_record.push(record);
    if (roomInfo.shuangjian_free_play_user === userId) {
        roomInfo.shuangjian_free_play_user = '';
    }
    const roomUsers = roomInfo.roomUsers;
    const userIds = roomInfo.roomUserIdList.filter(id => !!id);
    for (const uid of userIds) {
        (0, webSocket_1.wsSend)(roomUsers[uid].ws, {
            type: MSG_PLAY_CARD,
            code: 200,
            data: Object.assign(Object.assign({}, record), { autoPass: true, play_card_record: roomInfo.play_card_record, landlordCamp: roomInfo.landlord_camp, farmerCamp: roomInfo.farmer_camp, partnerRevealed: roomInfo.partner_revealed }),
            message: '成功',
        });
    }
    const teammateFreeUser = getTeammateFreePlayUserAfterAllPass(roomInfo);
    if (teammateFreeUser) {
        roomInfo.shuangjian_free_play_user = teammateFreeUser;
        pushTurnToUser(roomId, teammateFreeUser);
        return;
    }
    const next = nextPlayerInRing(roomInfo, userId);
    if (next)
        pushTurnToUser(roomId, next);
}
/**
 * Build the per-camp gameOver payload from settlement results, including
 * each player's award detail and final score.
 */
function buildGameOverPayload(roomInfo, settlement) {
    const roomUsers = roomInfo.roomUsers;
    const winners = [];
    const losers = [];
    for (const r of settlement) {
        const u = roomUsers[r.userId] || {};
        // Update in-room gold so subsequent rounds see the correct balance.
        const newGold = (Number(u.gold) || 0) + Number(r.getScore || 0) * (roomInfo.room_base || 1);
        const safeGold = newGold < 0 ? 0 : newGold;
        roomUsers[r.userId].gold = String(safeGold);
        roomUsers[r.userId].get_ingots = Number(r.getScore || 0) * (roomInfo.room_base || 1);
        const flat = Object.assign(Object.assign({}, u), { user_id: r.userId, rank: r.rank, camp: r.camp, awards: r.awards || null, getScore: r.getScore, get_ingots: roomUsers[r.userId].get_ingots, victory: r.getScore > 0 });
        if (r.getScore > 0)
            winners.push(flat);
        else
            losers.push(flat);
    }
    return { winners, losers };
}
/**
 * Public entry — invoked by webSocketPlayCardRouter when the room is in
 * Shuangjian mode. Mirrors the Doudizhu userPlayCard signature.
 */
async function handleShuangjianUserPlayCard({ ws, userInfo, params }) {
    var _a;
    const roomInfo = room_1.RoomObj[params.roomId];
    if (!roomInfo) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '房间不存在' });
        return;
    }
    if (((_a = roomInfo.game_mode) !== null && _a !== void 0 ? _a : IGameMode_1.GameMode.DOUDIZHU) !== IGameMode_1.GameMode.SHUANGJIAN) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '非双剑房间' });
        return;
    }
    const roomUsers = roomInfo.roomUsers;
    const me = roomUsers[userInfo.user_id];
    if (!me) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '玩家不在该房间' });
        return;
    }
    if (roomInfo.current_play_card_user && roomInfo.current_play_card_user !== userInfo.user_id) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '还未轮到你出牌' });
        return;
    }
    const playCards = Array.isArray(params.playCards) ? params.playCards.slice() : [];
    // ----- Pass -----
    if (playCards.length === 0) {
        // A pass is only legal when there is a play to follow (yapai).
        const lastRecord = roomInfo.play_card_record
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        if (isFreePlayTurn(roomInfo, userInfo.user_id, lastRecord)) {
            (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '请出牌' });
            return;
        }
        recordPassAndAdvance(params.roomId, userInfo.user_id);
        return;
    }
    // ----- Validate ownership -----
    const copyHand = me.user_card.slice();
    const owns = playCards.every((cid) => {
        const i = copyHand.indexOf(cid);
        if (i < 0)
            return false;
        copyHand.splice(i, 1);
        return true;
    });
    if (!owns) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '出牌错误：手牌不匹配' });
        return;
    }
    // ----- Validate card type -----
    const impl = roomInfo.gameModeImpl;
    const myType = impl.judgeCardType(playCards);
    if (!myType.valid) {
        (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '牌型不合法' });
        return;
    }
    // ----- Compare with last play (if pressing) -----
    const lastRecord = roomInfo.play_card_record
        .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
    if (!isFreePlayTurn(roomInfo, userInfo.user_id, lastRecord) && lastRecord && lastRecord.userId !== userInfo.user_id) {
        const lastType = impl.judgeCardType(lastRecord.playCard);
        // compareCards returns >0 if current play beats previous play.
        if (impl.compareCards(lastType, myType) <= 0) {
            (0, webSocket_1.wsSend)(ws, { type: MSG_PLAY_CARD, code: 400, message: '管不上上家' });
            return;
        }
    }
    // ----- Apply play -----
    me.user_card = copyHand;
    if (roomInfo.shuangjian_free_play_user === userInfo.user_id) {
        roomInfo.shuangjian_free_play_user = '';
    }
    impl.onPlayCard(roomInfo, userInfo.user_id, playCards);
    const playRecord = {
        userId: userInfo.user_id,
        playCard: playCards,
        gameOver: false,
        gameOverData: [],
    };
    roomInfo.play_card_record.push(playRecord);
    // ----- Broadcast play -----
    const userIds = roomInfo.roomUserIdList.filter(id => !!id);
    for (const uid of userIds) {
        (0, webSocket_1.wsSend)(roomUsers[uid].ws, {
            type: MSG_PLAY_CARD,
            code: 200,
            data: Object.assign(Object.assign({}, playRecord), { play_card_record: roomInfo.play_card_record, landlordCamp: roomInfo.landlord_camp, farmerCamp: roomInfo.farmer_camp, partnerRevealed: roomInfo.partner_revealed }),
            message: '成功',
        });
    }
    // ----- Game over? -----
    if (impl.isGameOver(roomInfo)) {
        const settlement = impl.calcSettlement(roomInfo);
        try {
            await impl.saveRecordMysql(roomInfo, settlement);
        }
        catch (e) {
            console.error('[Shuangjian] saveRecordMysql failed', e);
        }
        const payload = buildGameOverPayload(roomInfo, settlement);
        const allRoomUsers = (0, tools_1.clientReturnRoomUsers)(roomUsers, '', false);
        for (const uid of userIds) {
            (0, webSocket_1.wsSend)(roomUsers[uid].ws, {
                type: MSG_GAME_OVER,
                code: 200,
                data: {
                    settlement,
                    winners: payload.winners,
                    losers: payload.losers,
                    victoryStatus: roomInfo._shuangjian_victory_status,
                    awardMap: roomInfo._shuangjian_award_map,
                    roomUsers: allRoomUsers,
                    landlordCamp: roomInfo.landlord_camp,
                    farmerCamp: roomInfo.farmer_camp,
                },
                message: '成功',
            });
        }
        // Reset round-scoped state so the next ready-up restarts cleanly.
        if (roomInfo.count_down_timer) {
            clearInterval(roomInfo.count_down_timer);
            roomInfo.count_down_timer = null;
        }
        roomInfo.gameStatus = room_1.GameStatus.NOSTART;
        roomInfo.play_card_record = [];
        roomInfo.current_play_card_user = '';
        roomInfo.shuangjian_free_play_user = '';
        roomInfo.partner_card = -1;
        roomInfo.partner_revealed = false;
        roomInfo.landlord_camp = [];
        roomInfo.farmer_camp = [];
        roomInfo.pass_user_record = [];
        roomInfo.is_baopai = false;
        for (const uid of userIds) {
            const u = roomUsers[uid];
            if (u) {
                u.user_card = [];
                u.ready = room_1.PlayerReadyStatus.UNREADY;
                u.is_hosted = false;
            }
        }
        return;
    }
    // ----- Advance to next player -----
    const next = nextPlayerInRing(roomInfo, userInfo.user_id);
    if (next) {
        pushTurnToUser(params.roomId, next);
    }
}
//# sourceMappingURL=webSocketShuangjianPlayCard.js.map