/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * ShuangjianMode - Concrete game-mode strategy for "Fengcheng Shuangjian"
 * (Twin-Sword Showdown), 4-player only.
 *
 * Card encoding
 * -------------
 * Two standard 54-card decks (108 cards in total). To keep IDs unique while
 * staying compatible with the existing 1..54 single-deck logic, the second
 * deck uses ids in the [101..154] range:
 *   realCard(id) = id > 100 ? id - 100 : id   // 1..54
 *
 * Lifecycle hooks live here; concrete card-type judgment / award /
 * settlement is added in tasks 5 & 6.
 */
import { IGameMode, CardTypeResult, SettlementResult } from '../IGameMode';
import { wsSend } from '../../router/websocket/webSocket';
import { getRandomNumber, clientReturnRoomUsers } from '../../utils/tools';
import {
    judgeCardTypeShuangjian,
    compareShuangjian,
    cardHintShuangjian,
    SjJudgeResult,
    SjCardType,
} from './ShuangjianCardLogic';
import {
    calcAwardsForUser,
    calcShuangjianSettlement,
    AwardDetail,
    SettlementUserResult,
    VictoryStatus,
} from './ShuangjianAward';
import { saveShuangjianRecordMysql } from '../../mysql/shuangjianRecord';

/** Convert a Shuangjian double-deck card id back to the canonical 1..54 id. */
export function toRealCard(id: number): number {
    return id > 100 ? id - 100 : id;
}

/**
 * Sort Shuangjian cards (descending by rank, then by deck/suit so that
 * identical pairs sit next to each other for nicer hand presentation).
 */
function sortShuangjianCards(cards: number[]): number[] {
    const rankOrder = [54, 53, 2, 1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3]; // big->small
    const rankIdx = (id: number) => {
        const real = toRealCard(id);
        if (real === 53 || real === 54) return rankOrder.indexOf(real);
        const rank = (real - 1) % 13 + 1;
        return rankOrder.indexOf(rank);
    };
    return cards.sort((a, b) => {
        const ra = rankIdx(a);
        const rb = rankIdx(b);
        if (ra !== rb) return ra - rb;
        return toRealCard(a) - toRealCard(b);
    });
}

export class ShuangjianMode extends IGameMode {
    // ----- Capability -----
    /** Fengcheng Shuangjian is a fixed 4-seat game. */
    getMaxPlayerCount(): number { return 4; }
    getMinPlayerCount(): number { return 4; }

    // ----- Lifecycle -----
    /**
     * Build a fresh 108-card double deck, shuffle, and deal 27 cards to
     * each of the 4 seated players.
     */
    dealCards(roomInfo: any): void {
        const seatCount = 4;
        const perPlayer = 27;

        // Build double deck: [1..54, 101..154]
        let deck: number[] = [];
        for (let i = 1; i <= 54; i++) deck.push(i);
        for (let i = 1; i <= 54; i++) deck.push(i + 100);
        // Fisher–Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        // Distribute. Note: only the first seatCount seats are valid.
        const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);
        for (let s = 0; s < seatCount; s++) {
            const slice = deck.slice(s * perPlayer, (s + 1) * perPlayer);
            roomInfo.roomUsers[userIds[s]].user_card = sortShuangjianCards(slice);
        }
        roomInfo.bottom_card = deck.slice(seatCount * perPlayer); // remaining (used for partner-card pick)
        roomInfo.start_time = new Date();

        // Reset round-scoped state
        roomInfo.snatch_landlord_record = [];
        roomInfo.is_baopai = false;
        roomInfo.partner_card = -1;
        roomInfo.partner_revealed = false;
        roomInfo.landlord_camp = [];
        roomInfo.farmer_camp = [];
        roomInfo.pass_user_record = [];
        roomInfo.shuangjian_free_play_user = '';

        // Notify each user. We dual-broadcast so the existing RoomScene
        // pipeline can reuse its `dealCards` listener (renderCard, deal-card
        // animation, etc.) while the ShuangjianModeView still receives the
        // mode-specific metadata via its own event.
        for (const uid of userIds) {
            const me = roomInfo.roomUsers[uid];
            const newRoomUsers = clientReturnRoomUsers(roomInfo.roomUsers, uid);
            // Legacy event: drives the universal deal animation & render.
            wsSend(me.ws, {
                type: 'dealCards',
                code: 200,
                data: newRoomUsers,
                message: '成功',
            });
            // Mode-specific metadata: only the ShuangjianModeView listens.
            wsSend(me.ws, {
                type: 'dealCardsShuangjian',
                code: 200,
                data: {
                    roomUsers: newRoomUsers,
                    seatCount,
                    perPlayer,
                },
                message: '成功',
            });
        }

        // Decide banker after a short delay so the deal animation can play.
        setTimeout(() => this.selectLandlord(roomInfo), 3050);
    }

    /**
     * Decide the banker (zhuangjia / landlord). First round is random,
     * subsequent rounds use the previous head-game winner.
     */
    selectLandlord(roomInfo: any): void {
        const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);
        let bankerId: string;
        const lastHead = (roomInfo._last_head_user_id as string) || '';
        if (lastHead && userIds.indexOf(lastHead) >= 0) {
            bankerId = lastHead;
        } else {
            bankerId = userIds[getRandomNumber(0, userIds.length - 1)];
        }
        roomInfo.landlord_id = bankerId;

        // Broadcast banker
        for (const uid of userIds) {
            wsSend(roomInfo.roomUsers[uid].ws, {
                type: 'shuangjianLandlord',
                code: 200,
                data: { userId: bankerId },
                message: '成功',
            });
        }

        this.onAfterLandlordDecided(roomInfo);
    }

    /**
     * After banker is decided: open the baopai (1-vs-3 declaration) selection
     * window. If the banker declines, randomly pick a partner card from
     * non-banker hands and broadcast its hidden meaning.
     */
    onAfterLandlordDecided(roomInfo: any): void {
        // Debug fast-path: when SHUANGJIAN_SKIP_BAOPAI=1 we bypass the 15s
        // banker-only window and immediately fall into 2-vs-2 mode. This is
        // useful before the client baopai UI is wired up so testers don't
        // have to sit through the timeout every round.
        // if (process.env.SHUANGJIAN_SKIP_BAOPAI === '1') {
            this.applyBaopaiResult(roomInfo, false);
            return;
        // }

        // Open baopai window for the banker.
        roomInfo.baopai_countDown = roomInfo.baopai_time;
        const bankerId = roomInfo.landlord_id;

        // Tell every player a baopai window is open (only banker can act).
        const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);
        const tick = () => {
            for (const uid of userIds) {
                wsSend(roomInfo.roomUsers[uid].ws, {
                    type: 'selectBaopai',
                    code: 200,
                    data: {
                        userId: bankerId,
                        downTime: roomInfo.baopai_countDown,
                    },
                });
            }
            if (roomInfo.baopai_countDown <= 0) {
                clearInterval(roomInfo.count_down_timer);
                // Timeout = automatic "do not bao".
                this.applyBaopaiResult(roomInfo, false);
                return;
            }
            roomInfo.baopai_countDown -= 1;
        };
        tick();
        roomInfo.count_down_timer = setInterval(tick, 1000);
    }

    /**
     * Called when the banker explicitly chooses "bao" / "no bao" via the
     * `selectBaopai` websocket route, OR when the timer expires.
     */
    // tslint:disable-next-line:no-parameter-reassignment
    applyBaopaiResult(roomInfo: any, isBao: boolean): void {
        roomInfo.is_baopai = isBao;
        const bankerId = roomInfo.landlord_id;
        const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);

        if (isBao) {
            // 1-vs-3: banker is the only landlord camp.
            roomInfo.landlord_camp = [bankerId];
            roomInfo.farmer_camp = userIds.filter((id: string) => id !== bankerId);
            roomInfo.partner_revealed = true;
        } else {
            // 2-vs-2: pick a partner card that is GUARANTEED to be held by
            // some non-banker player. Spec: "庄家会随机选一张搭档牌，
            // 其它三家有这张搭档牌的玩家就是庄家的盟友".
            //
            // Collecting the candidate pool from non-banker hands ensures the
            // partner reveal will fire at least once during play, so the 2-v-2
            // camp formation works even if the leftover deck is empty.
            const candidatePool: number[] = [];
            for (const uid of userIds) {
                if (uid === bankerId) continue;
                const hand = (roomInfo.roomUsers[uid].user_card || []) as number[];
                for (const c of hand) candidatePool.push(c);
            }
            if (candidatePool.length > 0) {
                const idx = getRandomNumber(0, candidatePool.length - 1);
                roomInfo.partner_card = candidatePool[idx];
                const partnerUserId = userIds.find((uid: string) => {
                    if (uid === bankerId) return false;
                    const hand = (roomInfo.roomUsers[uid].user_card || []) as number[];
                    return hand.indexOf(roomInfo.partner_card) >= 0;
                });

                roomInfo.landlord_camp = partnerUserId ? [bankerId, partnerUserId] : [bankerId];
                roomInfo.farmer_camp = userIds.filter((id: string) => roomInfo.landlord_camp.indexOf(id) < 0);
                roomInfo.partner_revealed = true;
            } else {
                // Degenerate fallback: no other player has any card. Treat it
                // as a baopai outcome so the round can still finish cleanly.
                roomInfo.is_baopai = true;
                roomInfo.landlord_camp = [bankerId];
                roomInfo.farmer_camp = userIds.filter((id: string) => id !== bankerId);
                roomInfo.partner_revealed = true;
                isBao = true; // reflect in the broadcast below
            }
        }

        // Broadcast result. Camps are included so clients can show teammate
        // markers as soon as the play phase starts.
        for (const uid of userIds) {
            wsSend(roomInfo.roomUsers[uid].ws, {
                type: 'baopaiResult',
                code: 200,
                data: {
                    userId: bankerId,
                    isBaopai: isBao,
                    partnerCard: uid === bankerId ? roomInfo.partner_card : -1,
                    partnerRevealed: roomInfo.partner_revealed,
                    landlordCamp: roomInfo.landlord_camp,
                    farmerCamp: roomInfo.farmer_camp,
                },
            });
        }

        this.startPlay(roomInfo);
    }

    /**
     * Move to the actual play phase. Banker plays first.
     * Detailed turn-taking & timer logic mirrors Doudizhu's startPlayCardInit
     * but operates over a fixed 4-seat ring.
     */
    private startPlay(roomInfo: any): void {
        roomInfo.gameStatus = 2; // GameStatus.START — keep as numeric to avoid circular import
        roomInfo.play_card_time = 60;
        roomInfo.play_card_countDown = roomInfo.play_card_time;
        roomInfo.current_play_card_user = roomInfo.landlord_id;
        const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);
        for (const uid of userIds) {
            wsSend(roomInfo.roomUsers[uid].ws, {
                type: 'shuangjianStartPlay',
                code: 200,
                data: {
                    userId: roomInfo.landlord_id,
                    downTime: roomInfo.play_card_time,
                },
            });
        }
        // Kick off the recurring play-card timer. Importing lazily keeps
        // the strategy pure (no router-layer coupling) and avoids cycles.
        // tslint:disable-next-line:no-var-requires
        const { startShuangjianPlayLoop } = require('../../router/websocket/webSocketShuangjianPlayCard');
        startShuangjianPlayLoop(roomInfo.room_id);
    }

    // ----- Card logic (delegates to ShuangjianCardLogic) -----
    judgeCardType(cards: number[]): CardTypeResult {
        const r: SjJudgeResult = judgeCardTypeShuangjian(cards);
        return {
            valid: r.valid,
            cardType: r.type,
            weight: r.mainRank,
            extra: r,
        };
    }
    compareCards(a: CardTypeResult, b: CardTypeResult): number {
        if (!a || !b || !a.extra || !b.extra) return 0;
        return compareShuangjian(a.extra as SjJudgeResult, b.extra as SjJudgeResult);
    }
    getCardHint(targetCards: number[], myCards: number[]): number[] {
        return cardHintShuangjian(targetCards || [], myCards || []);
    }

    // ----- Play hooks -----
    /**
     * Detect partner-card reveal & track ranking when a player runs out.
     * Full play loop (timers, robotPlay, gameOver) will be wired in task 6.
     */
    onPlayCard(roomInfo: any, userId: string, cards: number[]): void {
        // Partner-card reveal: the moment the chosen partner card appears,
        // its holder joins the banker's camp (allies form 2-vs-2).
        if (!roomInfo.is_baopai && !roomInfo.partner_revealed && roomInfo.partner_card > 0) {
            if (cards.indexOf(roomInfo.partner_card) >= 0) {
                roomInfo.partner_revealed = true;
                if (roomInfo.landlord_camp.indexOf(userId) < 0) {
                    roomInfo.landlord_camp.push(userId);
                }
                roomInfo.farmer_camp = (roomInfo.roomUserIdList as string[])
                    .filter(id => !!id && roomInfo.landlord_camp.indexOf(id) < 0);

                const userIds = roomInfo.roomUserIdList.filter((id: string) => !!id);
                for (const uid of userIds) {
                    wsSend(roomInfo.roomUsers[uid].ws, {
                        type: 'partnerReveal',
                        code: 200,
                        data: {
                            partnerCard: roomInfo.partner_card,
                            partnerUserId: userId,
                            landlordCamp: roomInfo.landlord_camp,
                            farmerCamp: roomInfo.farmer_camp,
                        },
                    });
                }
            }
        }

        // Track ranking for finished players.
        const me = roomInfo.roomUsers[userId];
        if (me && (!me.user_card || me.user_card.length === 0)) {
            const already = roomInfo.pass_user_record.some((r: any) => r.userId === userId);
            if (!already) {
                roomInfo.pass_user_record.push({
                    userId,
                    rank: roomInfo.pass_user_record.length + 1,
                });
                if (roomInfo.pass_user_record.length === 1) {
                    // remember head-game player for next round's banker selection.
                    roomInfo._last_head_user_id = userId;
                }
            }
        }
    }

    /**
     * Determine whether the round is over.
     *
     *   - 包牌 (1-vs-3): any single empty hand finishes the round.
     *   - 2-vs-2: both members of one camp must run out of cards.
     */
    isGameOver(roomInfo: any): boolean {
        const userIds: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);
        const isEmpty = (uid: string) => {
            const u = roomInfo.roomUsers[uid];
            return u && (!u.user_card || u.user_card.length === 0);
        };

        if (roomInfo.is_baopai) {
            return userIds.some(isEmpty);
        }

        // 2-vs-2: both members of one camp must finish. Before the partner
        // card is revealed there is only one banker-side player; in that
        // window we fall back to a generic "任意两人走完" check so the round
        // can still resolve in case the partner card never surfaces (e.g.
        // banker happens to clear all 27 cards before any opponent plays it).
        const lc = (roomInfo.landlord_camp as string[]) || [];
        const fc = (roomInfo.farmer_camp as string[]) || [];
        if (roomInfo.partner_revealed) {
            if (lc.length >= 2 && lc.every(isEmpty)) return true;
            if (fc.length >= 2 && fc.every(isEmpty)) return true;
            return false;
        }
        // Pre-reveal fallback: end the round if the banker is empty AND any
        // opponent is also empty (2 players cleared total) — this maps to a
        // "双关" outcome since camps will be settled at calcSettlement time.
        const emptyCount = userIds.filter(isEmpty).length;
        return emptyCount >= 2;
    }

    /**
     * Calculate per-player awards and final scores. Internally delegates to
     * `calcShuangjianSettlement` from ShuangjianAward.ts.
     */
    calcSettlement(roomInfo: any): SettlementResult[] {
        const sr = roomInfo.special_rules || {};
        const userIds: string[] = (roomInfo.roomUserIdList as string[]).filter(id => !!id);

        // Build rank list. Players who finished are already in pass_user_record
        // (head→tail). Append remaining players sorted by remaining card count.
        const finished = (roomInfo.pass_user_record as { userId: string; rank: number }[])
            .slice().sort((a, b) => a.rank - b.rank).map(r => r.userId);
        const remaining = userIds
            .filter(uid => finished.indexOf(uid) < 0)
            .sort((a, b) => roomInfo.roomUsers[a].user_card.length - roomInfo.roomUsers[b].user_card.length);
        const orderedIds = finished.concat(remaining);

        // Each player's award detail is computed from the cards they STARTED
        // with in this round; we reconstruct from play_card_record + remaining hand.
        const startCards: { [uid: string]: number[] } = {};
        for (const uid of userIds) {
            const played: number[] = [];
            for (const rec of (roomInfo.play_card_record || [])) {
                if (rec.userId === uid && Array.isArray(rec.playCard)) {
                    played.push(...rec.playCard);
                }
            }
            const remain = roomInfo.roomUsers[uid].user_card || [];
            startCards[uid] = played.concat(remain);
        }

        const awardMap: { [uid: string]: AwardDetail } = {};
        const rankList = orderedIds.map(uid => {
            const detail = calcAwardsForUser(startCards[uid] || []);
            awardMap[uid] = detail;
            return { userId: uid, awards: detail.totalAwards };
        });

        const { victoryStatus, results } = calcShuangjianSettlement({
            isBaopai: !!roomInfo.is_baopai,
            drawAsOne: !!sr.drawAsOne,
            doubleScore: !!sr.doubleScore,
            fiveAwardChallenge: !!sr.fiveAwardChallenge,
            rankList,
            landlordCamp: roomInfo.landlord_camp || [],
            farmerCamp: roomInfo.farmer_camp || [],
            bankerId: roomInfo.landlord_id,
            baseScore: roomInfo.room_base || 1,
        });

        // Stash for saveRecord & gameOver broadcast.
        roomInfo._shuangjian_victory_status = victoryStatus as VictoryStatus;
        roomInfo._shuangjian_award_map = awardMap;

        // Convert to IGameMode SettlementResult shape.
        // Win/loss is determined by final hand state: empty hand wins, otherwise loses.
        return results.map((r: SettlementUserResult) => {
            const finalHand = roomInfo.roomUsers[r.userId]?.user_card || [];
            const finished = finalHand.length === 0;
            const scoreMagnitude = Math.abs(Number(r.getScore || 0)) || (roomInfo.room_base || 1);
            return {
                userId: r.userId,
                rank: r.rank,
                getScore: finished ? scoreMagnitude : -scoreMagnitude,
                awards: awardMap[r.userId],
                camp: r.camp,
            };
        });
    }
    async saveRecordMysql(roomInfo: any, settlement: SettlementResult[]): Promise<void> {
        // Stash settlement so the storage layer can flatten it into row form.
        roomInfo._shuangjian_settle_results = settlement;
        roomInfo.end_time = new Date();
        // Never throw — the helper logs internally.
        await saveShuangjianRecordMysql(roomInfo);
    }
}
