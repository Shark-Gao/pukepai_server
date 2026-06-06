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
import { RoomObj, GameStatus, PlayerReadyStatus } from '../../utils/room';
import { wsSend } from './webSocket';
import { clientReturnRoomUsers } from '../../utils/tools';
import { GameMode } from '../../gameMode/IGameMode';
import { ShuangjianMode } from '../../gameMode/shuangjian/ShuangjianMode';
import { getShuangjianAiStrategy } from '../../ai/shuangjianAi';

/** Per-play broadcast type used by the Shuangjian client. */
const MSG_PLAY_CARD = 'userPlayCard';      // reuse Doudizhu event so RoomPlayCard renders without changes
const MSG_GAME_OVER = 'shuangjianGameOver';
const MSG_PLAY_TIMER = 'playCardTimer';    // reuse Doudizhu turn-timer event

/**
 * Drive the "next player to play" logic for Shuangjian. We walk the seat
 * ring counter-clockwise (matching Doudizhu's convention) and skip any
 * player whose hand is empty.
 *
 * The ring is roomUserIdList; for Shuangjian the array length is fixed at 4.
 */
function nextPlayerInRing(roomInfo: any, currentUserId: string): string | null {
    const roomUsers = roomInfo.roomUsers as any;
    const ring: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);
    if (ring.length === 0) return null;
    const startIdx = ring.indexOf(currentUserId);
    if (startIdx < 0) return ring[0];
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

function getLastNonEmptyRecord(roomInfo: any): { record: any; index: number } | null {
    const records = (roomInfo.play_card_record || []) as any[];
    for (let i = records.length - 1; i >= 0; i--) {
        if (records[i]?.playCard?.length > 0) {
            return { record: records[i], index: i };
        }
    }
    return null;
}

function isFreePlayTurn(roomInfo: any, userId: string, lastRecord?: any): boolean {
    if (roomInfo.shuangjian_free_play_user === userId) return true;
    return !lastRecord || lastRecord.userId === userId;
}

function getUserCamp(roomInfo: any, userId: string): string[] {
    const landlordCamp = (roomInfo.landlord_camp || []) as string[];
    const farmerCamp = (roomInfo.farmer_camp || []) as string[];
    if (landlordCamp.indexOf(userId) >= 0) return landlordCamp;
    if (farmerCamp.indexOf(userId) >= 0) return farmerCamp;
    return [];
}

function getTeammateWithCards(roomInfo: any, userId: string): string | null {
    const roomUsers = roomInfo.roomUsers as any;
    const camp = getUserCamp(roomInfo, userId);
    for (const teammateId of camp) {
        if (teammateId !== userId && roomUsers[teammateId]?.user_card?.length > 0) {
            return teammateId;
        }
    }
    return null;
}

function getTeammateFreePlayUserAfterAllPass(roomInfo: any): string | null {
    const lastInfo = getLastNonEmptyRecord(roomInfo);
    if (!lastInfo) return null;

    const lastUserId = lastInfo.record.userId;
    const roomUsers = roomInfo.roomUsers as any;
    if (roomUsers[lastUserId]?.user_card?.length > 0) return null;

    const teammateId = getTeammateWithCards(roomInfo, lastUserId);
    if (!teammateId) return null;

    const aliveUserIds = ((roomInfo.roomUserIdList || []) as string[])
        .filter(id => !!id && roomUsers[id]?.user_card?.length > 0);
    if (aliveUserIds.length <= 0) return null;

    const passedAfterLastPlay = new Set<string>();
    const records = (roomInfo.play_card_record || []) as any[];
    for (let i = lastInfo.index + 1; i < records.length; i++) {
        if (records[i]?.playCard?.length === 0) {
            passedAfterLastPlay.add(records[i].userId);
        }
    }

    return aliveUserIds.every(id => passedAfterLastPlay.has(id)) ? teammateId : null;
}

/**
 * Cancel any active timer and notify the next player it's their turn.
 */
function pushTurnToUser(roomId: string, userId: string): void {
    const roomInfo = RoomObj[roomId];
    if (!roomInfo) return;
    if (roomInfo.count_down_timer) {
        clearInterval(roomInfo.count_down_timer);
        roomInfo.count_down_timer = null;
    }
    roomInfo.current_play_card_user = userId;
    const roomUsers = roomInfo.roomUsers as any;
    const isHostedTurn = !!roomUsers[userId]?.is_hosted;
    roomInfo.play_card_countDown = isHostedTurn ? Math.min(roomInfo.play_card_time || 20, 3) : roomInfo.play_card_time;

    const userIds: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);
    const tick = () => {
        // Build the most recent non-empty record (used as "yapai" reference).
        const lastRecord = (roomInfo.play_card_record as any[])
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        const isFreePlay = isFreePlayTurn(roomInfo, userId, lastRecord);
        for (const uid of userIds) {
            const me = roomUsers[uid];
            wsSend(me.ws, {
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
            // Timeout: real players pass the first time, then enter hosted mode on the second consecutive timeout.
            if (roomUsers[userId]?.is_hosted) {
                robotPlayAndAdvance(roomId, userId);
                return;
            }

            roomInfo.play_card_timeout_record = roomInfo.play_card_timeout_record || {};
            roomInfo.play_card_timeout_record[userId] = (roomInfo.play_card_timeout_record[userId] || 0) + 1;
            if (roomInfo.play_card_timeout_record[userId] >= 2) {
                roomUsers[userId].is_hosted = true;
                robotPlayAndAdvance(roomId, userId);
                return;
            }

            if (isFreePlay) {
                robotPlayAndAdvance(roomId, userId);
            } else {
                recordPassAndAdvance(roomId, userId);
            }
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
export function startShuangjianPlayLoop(roomId: string): void {
    const roomInfo = RoomObj[roomId];
    if (!roomInfo || !roomInfo.landlord_id) return;
    pushTurnToUser(roomId, roomInfo.landlord_id);
}

function robotPlayAndAdvance(roomId: string, userId: string): void {
    const roomInfo = RoomObj[roomId];
    if (!roomInfo || roomInfo.current_play_card_user !== userId) return;
    const roomUsers = roomInfo.roomUsers as any;
    const me = roomUsers[userId];
    if (!me || !Array.isArray(me.user_card) || me.user_card.length <= 0) {
        recordPassAndAdvance(roomId, userId);
        return;
    }

    const lastRecord = (roomInfo.play_card_record as any[])
        .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
    const isFreePlay = isFreePlayTurn(roomInfo, userId, lastRecord);
    const aiStrategy = getShuangjianAiStrategy(roomInfo.robot_level);
    let playCards: number[] = aiStrategy.choosePlayCards({
        roomInfo,
        userId,
        handCards: me.user_card || [],
        lastRecord,
        isFreePlay,
    });

    if (playCards.length <= 0) {
        const protectTeammatePlay = !isFreePlay && getUserCamp(roomInfo, userId).indexOf(lastRecord?.userId) >= 0;
        if (!protectTeammatePlay) {
            const impl = roomInfo.gameModeImpl as ShuangjianMode;
            const hintCards = impl.getCardHint(isFreePlay ? [] : (lastRecord.playCard || []), me.user_card || []);
            playCards = Array.isArray(hintCards) ? hintCards : [];
        }
    }

    if (playCards.length > 0) {
        const impl = roomInfo.gameModeImpl as ShuangjianMode;
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
        console.error('[Shuangjian] robot play failed', error);
        const latestRoomInfo = RoomObj[roomId];
        if (!latestRoomInfo || latestRoomInfo.current_play_card_user !== userId) return;
        const latestRecord = (latestRoomInfo.play_card_record as any[])
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        const latestRoomUsers = latestRoomInfo.roomUsers as any;
        if (isFreePlayTurn(latestRoomInfo, userId, latestRecord)) {
            const fallbackCard = (latestRoomUsers[userId]?.user_card || [])[0];
            if (fallbackCard !== undefined) {
                handleShuangjianUserPlayCard({
                    ws: latestRoomUsers[userId].ws,
                    userInfo: latestRoomUsers[userId],
                    params: { roomId, playCards: [fallbackCard] },
                });
            }
        } else {
            recordPassAndAdvance(roomId, userId);
        }
    });
}

/** Record an automatic pass (timeout) and advance to the next player. */
function recordPassAndAdvance(roomId: string, userId: string): void {
    const roomInfo = RoomObj[roomId];
    if (!roomInfo) return;
    const record = {
        userId,
        playCard: [] as number[],
        gameOver: false,
        gameOverData: [],
    };
    roomInfo.play_card_record.push(record);
    if (roomInfo.shuangjian_free_play_user === userId) {
        roomInfo.shuangjian_free_play_user = '';
    }

    const roomUsers = roomInfo.roomUsers as any;
    const userIds: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);
    for (const uid of userIds) {
        wsSend(roomUsers[uid].ws, {
            type: MSG_PLAY_CARD,
            code: 200,
            data: {
                ...record,
                autoPass: true,
                play_card_record: roomInfo.play_card_record,
                landlordCamp: roomInfo.landlord_camp,
                farmerCamp: roomInfo.farmer_camp,
                partnerRevealed: roomInfo.partner_revealed,
            },
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
    if (next) pushTurnToUser(roomId, next);
}

/**
 * Build the per-camp gameOver payload from settlement results, including
 * each player's award detail and final score.
 */
function buildGameOverPayload(roomInfo: any, settlement: any[]): any {
    const roomUsers = roomInfo.roomUsers as any;
    const winners: any[] = [];
    const losers: any[] = [];
    for (const r of settlement) {
        const u = roomUsers[r.userId] || {};
        // Update in-room gold so subsequent rounds see the correct balance.
        const newGold = (Number(u.gold) || 0) + Number(r.getScore || 0) * (roomInfo.room_base || 1);
        const safeGold = newGold < 0 ? 0 : newGold;
        roomUsers[r.userId].gold = String(safeGold);
        roomUsers[r.userId].get_ingots = Number(r.getScore || 0) * (roomInfo.room_base || 1);

        const flat = {
            ...u,
            user_id: r.userId,
            rank: r.rank,
            camp: r.camp,
            awards: r.awards || null,
            getScore: r.getScore,
            get_ingots: roomUsers[r.userId].get_ingots,
            victory: r.getScore > 0,
        };
        if (r.getScore > 0) winners.push(flat);
        else losers.push(flat);
    }
    return { winners, losers };
}

/**
 * Public entry — invoked by webSocketPlayCardRouter when the room is in
 * Shuangjian mode. Mirrors the Doudizhu userPlayCard signature.
 */
export async function handleShuangjianUserPlayCard(
    { ws, userInfo, params }: any
): Promise<void> {
    const roomInfo = RoomObj[params.roomId];
    if (!roomInfo) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '房间不存在' });
        return;
    }
    if ((roomInfo.game_mode ?? GameMode.DOUDIZHU) !== GameMode.SHUANGJIAN) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '非双剑房间' });
        return;
    }
    const roomUsers = roomInfo.roomUsers as any;
    const me = roomUsers[userInfo.user_id];
    if (!me) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '玩家不在该房间' });
        return;
    }
    if (roomInfo.current_play_card_user && roomInfo.current_play_card_user !== userInfo.user_id) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '还未轮到你出牌' });
        return;
    }

    const playCards: number[] = Array.isArray(params.playCards) ? params.playCards.slice() : [];
    if (roomInfo.play_card_timeout_record) {
        roomInfo.play_card_timeout_record[userInfo.user_id] = 0;
    }

    // ----- Pass -----
    if (playCards.length === 0) {
        // A pass is only legal when there is a play to follow (yapai).
        const lastRecord = (roomInfo.play_card_record as any[])
            .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
        if (isFreePlayTurn(roomInfo, userInfo.user_id, lastRecord)) {
            wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '请出牌' });
            return;
        }
        recordPassAndAdvance(params.roomId, userInfo.user_id);
        return;
    }

    // ----- Validate ownership -----
    const copyHand = me.user_card.slice();
    const owns = playCards.every((cid: number) => {
        const i = copyHand.indexOf(cid);
        if (i < 0) return false;
        copyHand.splice(i, 1);
        return true;
    });
    if (!owns) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '出牌错误：手牌不匹配' });
        return;
    }

    // ----- Validate card type -----
    const impl = roomInfo.gameModeImpl as ShuangjianMode;
    const myType = impl.judgeCardType(playCards);
    if (!myType.valid) {
        wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '牌型不合法' });
        return;
    }
    // ----- Compare with last play (if pressing) -----
    const lastRecord = (roomInfo.play_card_record as any[])
        .reduceRight((pre, cur) => (!pre && cur.playCard.length > 0 ? cur : pre), null);
    if (!isFreePlayTurn(roomInfo, userInfo.user_id, lastRecord) && lastRecord && lastRecord.userId !== userInfo.user_id) {
        const lastType = impl.judgeCardType(lastRecord.playCard);
        // compareCards returns >0 if current play beats previous play.
        if (impl.compareCards(lastType, myType) <= 0) {
            wsSend(ws, { type: MSG_PLAY_CARD, code: 400, message: '管不上上家' });
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
        gameOverData: [] as any[],
    };
    roomInfo.play_card_record.push(playRecord);

    // ----- Broadcast play -----
    const userIds: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);
    for (const uid of userIds) {
        wsSend(roomUsers[uid].ws, {
            type: MSG_PLAY_CARD,
            code: 200,
            data: {
                ...playRecord,
                play_card_record: roomInfo.play_card_record,
                landlordCamp: roomInfo.landlord_camp,
                farmerCamp: roomInfo.farmer_camp,
                partnerRevealed: roomInfo.partner_revealed,
            },
            message: '成功',
        });
    }

    // ----- Game over? -----
    if (impl.isGameOver(roomInfo)) {
        const settlement = impl.calcSettlement(roomInfo);
        try {
            await impl.saveRecordMysql(roomInfo, settlement);
        } catch (e) {
            console.error('[Shuangjian] saveRecordMysql failed', e);
        }
        const payload = buildGameOverPayload(roomInfo, settlement);
        const allRoomUsers = clientReturnRoomUsers(roomUsers, '', false);

        for (const uid of userIds) {
            wsSend(roomUsers[uid].ws, {
                type: MSG_GAME_OVER,
                code: 200,
                data: {
                    settlement,
                    winners: payload.winners,
                    losers: payload.losers,
                    victoryStatus: (roomInfo as any)._shuangjian_victory_status,
                    awardMap: (roomInfo as any)._shuangjian_award_map,
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
        roomInfo.gameStatus = GameStatus.NOSTART;
        roomInfo.play_card_record = [];
        roomInfo.current_play_card_user = '';
        roomInfo.shuangjian_free_play_user = '';
        roomInfo.partner_card = -1;
        roomInfo.partner_revealed = false;
        roomInfo.landlord_camp = [];
        roomInfo.farmer_camp = [];
        roomInfo.pass_user_record = [];
        roomInfo.play_card_timeout_record = {};
        roomInfo.is_baopai = false;
        for (const uid of userIds) {
            const u = roomUsers[uid];
            if (u) {
                u.user_card = [];
                u.ready = PlayerReadyStatus.UNREADY;
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
