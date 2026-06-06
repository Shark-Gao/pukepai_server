"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HellShuangjianAiStrategy = exports.MediumShuangjianAiStrategy = exports.SimpleShuangjianAiStrategy = void 0;
exports.getShuangjianAiStrategy = getShuangjianAiStrategy;
const ShuangjianMode_1 = require("../gameMode/shuangjian/ShuangjianMode");
const ShuangjianCardLogic_1 = require("../gameMode/shuangjian/ShuangjianCardLogic");
const types_1 = require("./types");
function rankValue(card) {
    const real = (0, ShuangjianMode_1.toRealCard)(card);
    if (real === 53 || real === 54)
        return real;
    return (real - 1) % 13 + 1;
}
function rankPower(rank) {
    if (rank === 1)
        return 14;
    if (rank === 2)
        return 15;
    if (rank === 53)
        return 16;
    if (rank === 54)
        return 17;
    return rank;
}
function groupCardsByRank(cards) {
    const grouped = {};
    for (const card of cards || []) {
        const rank = rankValue(card);
        if (!grouped[rank])
            grouped[rank] = [];
        grouped[rank].push(card);
    }
    Object.keys(grouped).map(Number).forEach(rank => {
        grouped[rank].sort((a, b) => (0, ShuangjianMode_1.toRealCard)(a) - (0, ShuangjianMode_1.toRealCard)(b));
    });
    return grouped;
}
function getSmallestCardsExcept(cards, excluded, count) {
    const remains = cards
        .filter(card => excluded.indexOf(card) < 0)
        .slice()
        .sort((a, b) => rankPower(rankValue(a)) - rankPower(rankValue(b)) || (0, ShuangjianMode_1.toRealCard)(a) - (0, ShuangjianMode_1.toRealCard)(b));
    return remains.slice(0, count);
}
function collectStraightCandidates(grouped, minGroups, cardsPerRank) {
    const orderedRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    const candidates = [];
    for (let start = 0; start < orderedRanks.length; start++) {
        const run = [];
        for (let i = start; i < orderedRanks.length; i++) {
            const rank = orderedRanks[i];
            if (!grouped[rank] || grouped[rank].length < cardsPerRank)
                break;
            run.push(rank);
            if (run.length >= minGroups) {
                candidates.push(run.flatMap(itemRank => grouped[itemRank].slice(0, cardsPerRank)));
            }
        }
    }
    return candidates;
}
function isPowerPlay(playType) {
    var _a;
    const type = (_a = playType === null || playType === void 0 ? void 0 : playType.extra) === null || _a === void 0 ? void 0 : _a.type;
    return type === ShuangjianCardLogic_1.SjCardType.FIVE_TEN_K || type === ShuangjianCardLogic_1.SjCardType.BOMB || type === ShuangjianCardLogic_1.SjCardType.KING_BOMB;
}
function getAiPlayWeight(playType) {
    const extra = (playType === null || playType === void 0 ? void 0 : playType.extra) || {};
    const type = extra.type;
    if (type === ShuangjianCardLogic_1.SjCardType.FIVE_TEN_K) {
        const count = extra.fiveTenKCount || 1;
        if (count >= 4)
            return 120;
        if (count === 3)
            return 80;
        return extra.fiveTenKSuited ? 20 : 10;
    }
    if (type === ShuangjianCardLogic_1.SjCardType.BOMB) {
        return 30 + Math.max(0, (extra.headCount || 4) - 4) * 20;
    }
    if (type === ShuangjianCardLogic_1.SjCardType.KING_BOMB) {
        return extra.kingCount >= 4 ? 110 : (extra.kingCount === 3 ? 70 : 40);
    }
    return 1;
}
function isPlayOut(handCards, playCards) {
    return playCards.length > 0 && playCards.length === handCards.length;
}
function getAliveUserIds(roomInfo) {
    const roomUsers = roomInfo.roomUsers || {};
    return (roomInfo.roomUserIdList || [])
        .filter(id => { var _a; return !!id && Array.isArray((_a = roomUsers[id]) === null || _a === void 0 ? void 0 : _a.user_card) && roomUsers[id].user_card.length > 0; });
}
function getSeatRelation(roomInfo, userId, targetUserId) {
    const ring = (roomInfo.roomUserIdList || []).filter(id => !!id);
    const userIndex = ring.indexOf(userId);
    const targetIndex = ring.indexOf(targetUserId);
    if (userIndex < 0 || targetIndex < 0 || ring.length <= 0)
        return 'unknown';
    if (userIndex === (targetIndex - 1 + ring.length) % ring.length)
        return 'downstream';
    if (userIndex === (targetIndex + 1) % ring.length)
        return 'upstream';
    return 'opposite';
}
function getRankRangeCandidates(cards, minRank, maxRank, impl, targetType) {
    return cards.filter(playCards => {
        var _a;
        const playType = impl.judgeCardType(playCards);
        const mainRank = ((_a = playType === null || playType === void 0 ? void 0 : playType.extra) === null || _a === void 0 ? void 0 : _a.mainRank) || (playType === null || playType === void 0 ? void 0 : playType.weight) || 0;
        return mainRank >= minRank && mainRank <= maxRank && impl.compareCards(targetType, playType) > 0;
    });
}
function sortSinglesByPower(cards, desc = false) {
    return cards.sort((a, b) => {
        const diff = rankPower(rankValue(a[0])) - rankPower(rankValue(b[0]));
        return desc ? -diff : diff;
    });
}
function sortPairsByPower(cards, desc = false) {
    return cards.sort((a, b) => {
        const diff = rankPower(rankValue(a[0])) - rankPower(rankValue(b[0]));
        return desc ? -diff : diff;
    });
}
function getPlainTypePriority(playType) {
    var _a;
    switch ((_a = playType === null || playType === void 0 ? void 0 : playType.extra) === null || _a === void 0 ? void 0 : _a.type) {
        case ShuangjianCardLogic_1.SjCardType.SINGLE:
            return 1;
        case ShuangjianCardLogic_1.SjCardType.PAIR:
            return 2;
        case ShuangjianCardLogic_1.SjCardType.THREE_WITH_TWO:
            return 3;
        case ShuangjianCardLogic_1.SjCardType.STRAIGHT:
            return 4;
        case ShuangjianCardLogic_1.SjCardType.DOUBLE_STRAIGHT:
            return 5;
        case ShuangjianCardLogic_1.SjCardType.PLANE:
            return 6;
        default:
            return 99;
    }
}
function sortBySmallestLegalPlay(cards, impl) {
    return cards.sort((a, b) => {
        const typeA = impl.judgeCardType(a);
        const typeB = impl.judgeCardType(b);
        const priorityA = getPlainTypePriority(typeA);
        const priorityB = getPlainTypePriority(typeB);
        if (priorityA !== priorityB)
            return priorityA - priorityB;
        if (a.length !== b.length)
            return a.length - b.length;
        return (typeA.weight || 0) - (typeB.weight || 0);
    });
}
function getRemainCount(roomInfo, userId) {
    var _a, _b;
    return (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[userId]) === null || _b === void 0 ? void 0 : _b.user_card) || []).length;
}
function buildHandProfile(cards, impl) {
    const grouped = groupCardsByRank(cards);
    const kings = [].concat(grouped[53] || [], grouped[54] || []);
    let powerCount = kings.length >= 2 ? 1 : 0;
    let bigCardCount = 0;
    let pairCount = 0;
    let tripleCount = 0;
    for (const rank of Object.keys(grouped).map(Number)) {
        const count = grouped[rank].length;
        if (rankPower(rank) >= 14)
            bigCardCount += count;
        if (rank !== 53 && rank !== 54 && count >= 2)
            pairCount += 1;
        if (rank !== 53 && rank !== 54 && count >= 3)
            tripleCount += 1;
        if (rank !== 53 && rank !== 54 && count >= 4)
            powerCount += 1;
    }
    const validWholeHand = cards.length > 0 && impl.judgeCardType(cards).valid;
    const strength = powerCount * 18 + bigCardCount * 4 + tripleCount * 5 + pairCount * 2
        + (validWholeHand ? 16 : 0) - cards.length * 0.4;
    return { strength, powerCount, bigCardCount, validWholeHand };
}
function isShortHand(count, limit) {
    return count > 0 && count < limit;
}
function getRecentPlayedType(roomInfo, userId, impl) {
    var _a;
    const records = (roomInfo.play_card_record || []).slice().reverse();
    for (const record of records) {
        if ((record === null || record === void 0 ? void 0 : record.userId) !== userId || !Array.isArray(record.playCard) || record.playCard.length <= 0)
            continue;
        const playType = impl.judgeCardType(record.playCard);
        if (playType.valid && !isPowerPlay(playType))
            return ((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) || null;
    }
    return null;
}
function filterBySjType(candidates, impl, type) {
    return candidates.filter(cards => { var _a; return ((_a = impl.judgeCardType(cards).extra) === null || _a === void 0 ? void 0 : _a.type) === type; });
}
function sortByRunnerValue(cards, impl) {
    return cards.sort((a, b) => {
        const typeA = impl.judgeCardType(a);
        const typeB = impl.judgeCardType(b);
        const powerDiff = Number(isPowerPlay(typeA)) - Number(isPowerPlay(typeB));
        if (powerDiff !== 0)
            return powerDiff;
        if (a.length !== b.length)
            return b.length - a.length;
        const weightDiff = getAiPlayWeight(typeA) - getAiPlayWeight(typeB);
        if (weightDiff !== 0)
            return weightDiff;
        return (typeA.weight || 0) - (typeB.weight || 0);
    });
}
function canUsePowerPlay(playType, handCards, playCards, targetType, opponentDanger) {
    if (!isPowerPlay(playType))
        return true;
    if (isPlayOut(handCards, playCards))
        return true;
    if (isPowerPlay(targetType))
        return true;
    if (!opponentDanger)
        return false;
    const extra = (playType === null || playType === void 0 ? void 0 : playType.extra) || {};
    if (extra.type === ShuangjianCardLogic_1.SjCardType.BOMB)
        return (extra.headCount || 4) <= 5;
    return false;
}
function collectFiveTenKCandidates(grouped) {
    const fives = (grouped[5] || []).slice();
    const tens = (grouped[10] || []).slice();
    const kings = (grouped[13] || []).slice();
    const count = Math.min(fives.length, tens.length, kings.length);
    const candidates = [];
    for (let i = 1; i <= count; i++) {
        if (i === 2)
            continue;
        candidates.push(fives.slice(0, i).concat(tens.slice(0, i), kings.slice(0, i)));
    }
    return candidates;
}
function isRankInShuangjianStraight(rank, grouped, minGroups, cardsPerRank) {
    if (rank === 2 || rank === 53 || rank === 54)
        return false;
    const orderedRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    let run = [];
    for (const itemRank of orderedRanks) {
        if (grouped[itemRank] && grouped[itemRank].length >= cardsPerRank) {
            run.push(itemRank);
        }
        else {
            run = [];
        }
        if (run.length >= minGroups && run.indexOf(rank) >= 0)
            return true;
    }
    return false;
}
function isSingleBreakingShuangjianCombination(handCards, playCards) {
    if (!playCards || playCards.length !== 1 || handCards.length <= 1)
        return false;
    const grouped = groupCardsByRank(handCards);
    const rank = rankValue(playCards[0]);
    if ((grouped[rank] || []).length >= 2)
        return true;
    const kings = [].concat(grouped[53] || [], grouped[54] || []);
    if ((rank === 53 || rank === 54) && kings.length >= 2)
        return true;
    if ((rank === 5 || rank === 10 || rank === 13) && (grouped[5] || []).length > 0 && (grouped[10] || []).length > 0 && (grouped[13] || []).length > 0)
        return true;
    return isRankInShuangjianStraight(rank, grouped, 7, 1) || isRankInShuangjianStraight(rank, grouped, 3, 2);
}
function getTeamIds(roomInfo, userId) {
    const landlordCamp = (roomInfo.landlord_camp || []);
    const farmerCamp = (roomInfo.farmer_camp || []);
    if (landlordCamp.indexOf(userId) >= 0)
        return landlordCamp;
    if (farmerCamp.indexOf(userId) >= 0)
        return farmerCamp;
    return [userId];
}
function getOpposingIds(roomInfo, userId) {
    const teamIds = getTeamIds(roomInfo, userId);
    return getAliveUserIds(roomInfo).filter(id => teamIds.indexOf(id) < 0);
}
function getCardsOfUser(roomInfo, userId) {
    var _a, _b;
    return (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[userId]) === null || _b === void 0 ? void 0 : _b.user_card) || []).slice();
}
function getTeamCards(roomInfo, userIds) {
    return userIds.flatMap(id => getCardsOfUser(roomInfo, id));
}
function countPowerCandidates(cards, impl) {
    const grouped = groupCardsByRank(cards);
    let count = 0;
    for (const rank of Object.keys(grouped).map(Number)) {
        if (rank !== 53 && rank !== 54 && grouped[rank].length >= 4) {
            count += grouped[rank].length - 3;
        }
    }
    const kings = [].concat(grouped[53] || [], grouped[54] || []);
    if (kings.length >= 2)
        count += Math.min(kings.length, 4) - 1;
    count += collectFiveTenKCandidates(grouped).filter(cardsGroup => isPowerPlay(impl.judgeCardType(cardsGroup))).length;
    return count;
}
function getSignalTypeBonus(playType, teammateRecentType) {
    var _a;
    if (!teammateRecentType || ((_a = playType === null || playType === void 0 ? void 0 : playType.extra) === null || _a === void 0 ? void 0 : _a.type) !== teammateRecentType)
        return 0;
    return 22;
}
function getCardPressureValue(playType) {
    var _a;
    const type = (_a = playType === null || playType === void 0 ? void 0 : playType.extra) === null || _a === void 0 ? void 0 : _a.type;
    if (type === ShuangjianCardLogic_1.SjCardType.SINGLE)
        return 2;
    if (type === ShuangjianCardLogic_1.SjCardType.PAIR)
        return 4;
    if (type === ShuangjianCardLogic_1.SjCardType.THREE_WITH_TWO)
        return 9;
    if (type === ShuangjianCardLogic_1.SjCardType.STRAIGHT || type === ShuangjianCardLogic_1.SjCardType.DOUBLE_STRAIGHT)
        return 11;
    if (type === ShuangjianCardLogic_1.SjCardType.PLANE)
        return 16;
    return getAiPlayWeight(playType) / 4;
}
class BaseShuangjianAiStrategy {
    getUserCamp(roomInfo, userId) {
        const landlordCamp = (roomInfo.landlord_camp || []);
        const farmerCamp = (roomInfo.farmer_camp || []);
        if (landlordCamp.indexOf(userId) >= 0)
            return landlordCamp;
        if (farmerCamp.indexOf(userId) >= 0)
            return farmerCamp;
        return [];
    }
    isTeammate(roomInfo, userId, targetUserId) {
        if (!userId || !targetUserId || userId === targetUserId)
            return false;
        return this.getUserCamp(roomInfo, userId).indexOf(targetUserId) >= 0;
    }
    collectCandidates(impl, handCards) {
        const grouped = groupCardsByRank(handCards);
        const rankList = Object.keys(grouped)
            .map(Number)
            .sort((a, b) => rankPower(a) - rankPower(b));
        const candidates = [];
        for (const rank of rankList) {
            candidates.push([grouped[rank][0]]);
            if (rank !== 53 && rank !== 54 && grouped[rank].length >= 2) {
                candidates.push(grouped[rank].slice(0, 2));
            }
            if (rank !== 53 && rank !== 54 && grouped[rank].length >= 3) {
                const triple = grouped[rank].slice(0, 3);
                const kickers = getSmallestCardsExcept(handCards, triple, 2);
                if (kickers.length === 2)
                    candidates.push(triple.concat(kickers));
            }
            if (rank !== 53 && rank !== 54 && grouped[rank].length >= 4) {
                for (let bombSize = 4; bombSize <= grouped[rank].length; bombSize++) {
                    candidates.push(grouped[rank].slice(0, bombSize));
                }
            }
        }
        candidates.push(...collectStraightCandidates(grouped, 7, 1));
        candidates.push(...collectStraightCandidates(grouped, 3, 2));
        candidates.push(...collectFiveTenKCandidates(grouped));
        const tripleRanks = rankList.filter(rank => rank !== 2 && rank !== 53 && rank !== 54 && grouped[rank].length >= 3);
        const orderedTripleRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1].filter(rank => tripleRanks.indexOf(rank) >= 0);
        for (let start = 0; start < orderedTripleRanks.length; start++) {
            const run = [];
            for (let i = start; i < orderedTripleRanks.length; i++) {
                const rank = orderedTripleRanks[i];
                if (i > start && rankPower(rank) - rankPower(orderedTripleRanks[i - 1]) !== 1)
                    break;
                run.push(rank);
                if (run.length >= 2) {
                    const planeHeads = run.flatMap(itemRank => grouped[itemRank].slice(0, 3));
                    candidates.push(planeHeads);
                    const kickers = getSmallestCardsExcept(handCards, planeHeads, Math.min(run.length * 2, handCards.length - planeHeads.length));
                    if (kickers.length > 0)
                        candidates.push(planeHeads.concat(kickers));
                }
            }
        }
        const kings = [].concat(grouped[53] || [], grouped[54] || []);
        if (kings.length >= 2) {
            for (let kingCount = 2; kingCount <= Math.min(kings.length, 4); kingCount++) {
                candidates.push(kings.slice(0, kingCount));
            }
        }
        const unique = new Set();
        const validCandidates = candidates.filter(cards => {
            const playType = impl.judgeCardType(cards);
            if (!playType.valid)
                return false;
            const key = cards.slice().sort((a, b) => a - b).join(',');
            if (unique.has(key))
                return false;
            unique.add(key);
            return true;
        });
        const protectedCandidates = validCandidates.filter(cards => !isSingleBreakingShuangjianCombination(handCards, cards));
        return protectedCandidates.length > 0 ? protectedCandidates : validCandidates;
    }
}
class SimpleShuangjianAiStrategy extends BaseShuangjianAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Simple;
    }
    choosePlayCards(context) {
        var _a, _b, _c;
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const impl = roomInfo.gameModeImpl;
        const candidates = this.collectCandidates(impl, handCards);
        if (candidates.length <= 0)
            return [];
        const grouped = groupCardsByRank(handCards);
        const teammateId = this.getTeammateId(roomInfo, userId);
        const teammateRemain = teammateId ? (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[teammateId]) === null || _b === void 0 ? void 0 : _b.user_card) || []).length : 0;
        const opponents = this.getOpponentIds(roomInfo, userId);
        const hasOpponentOneCard = opponents.some(id => { var _a, _b; return (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[id]) === null || _b === void 0 ? void 0 : _b.user_card) || []).length === 1; });
        const opponentOnePlayAway = this.isOpponentOnePlayAway(roomInfo, userId, impl);
        if (handCards.length === 1) {
            return [[handCards[0]]].sort((a, b) => rankPower(rankValue(b[0])) - rankPower(rankValue(a[0])))[0];
        }
        if (isFreePlay) {
            const teammateFreePlay = !!(lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) && this.isTeammate(roomInfo, userId, lastRecord.userId);
            const freeChoice = teammateFreePlay
                ? this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard)
                : this.chooseOpeningPlay(grouped, candidates, impl, teammateRemain, hasOpponentOneCard);
            return freeChoice;
        }
        const targetType = impl.judgeCardType((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []);
        if (!targetType.valid)
            return [];
        const beatCandidates = candidates.filter(cards => {
            const playType = impl.judgeCardType(cards);
            if (!playType.valid || impl.compareCards(targetType, playType) <= 0)
                return false;
            if (isPowerPlay(playType) && !isPlayOut(handCards, cards) && !isPowerPlay(targetType) && !opponentOnePlayAway)
                return false;
            return true;
        });
        if (beatCandidates.length <= 0)
            return [];
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const relation = getSeatRelation(roomInfo, userId, targetUserId);
        const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
        if (targetIsTeammate) {
            const playOutCandidates = beatCandidates.filter(cards => isPlayOut(handCards, cards));
            if (playOutCandidates.length <= 0)
                return [];
            return sortBySmallestLegalPlay(playOutCandidates, impl)[0];
        }
        const targetSjType = (_c = targetType.extra) === null || _c === void 0 ? void 0 : _c.type;
        if (targetSjType === ShuangjianCardLogic_1.SjCardType.SINGLE) {
            if (teammateRemain === 1 || hasOpponentOneCard)
                return [];
            if (relation === 'downstream') {
                const downstreamSingles = getRankRangeCandidates(this.onlySingles(beatCandidates, impl), 8, 13, impl, targetType);
                return sortSinglesByPower(downstreamSingles, true)[0] || [];
            }
            if (relation === 'upstream') {
                const upstreamSingles = getRankRangeCandidates(this.onlySingles(beatCandidates, impl), 14, 15, impl, targetType);
                return sortSinglesByPower(upstreamSingles)[0] || [];
            }
            return [];
        }
        if (targetSjType === ShuangjianCardLogic_1.SjCardType.PAIR) {
            if (relation === 'downstream') {
                const downstreamPairs = getRankRangeCandidates(this.onlyPairs(beatCandidates, impl), 8, 13, impl, targetType);
                return sortPairsByPower(downstreamPairs, true)[0] || [];
            }
            if (relation === 'upstream') {
                const upstreamPairs = getRankRangeCandidates(this.onlyPairs(beatCandidates, impl), 14, 15, impl, targetType);
                return sortPairsByPower(upstreamPairs)[0] || [];
            }
            if (teammateRemain === 2) {
                const pairs = this.onlyPairs(beatCandidates, impl);
                return sortPairsByPower(pairs)[0] || [];
            }
            return [];
        }
        const plainBeatCandidates = beatCandidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
        const choices = plainBeatCandidates.length > 0 ? plainBeatCandidates : beatCandidates;
        choices.sort((a, b) => {
            const typeA = impl.judgeCardType(a);
            const typeB = impl.judgeCardType(b);
            if (getAiPlayWeight(typeA) !== getAiPlayWeight(typeB))
                return getAiPlayWeight(typeA) - getAiPlayWeight(typeB);
            if ((typeA.weight || 0) !== (typeB.weight || 0))
                return (typeA.weight || 0) - (typeB.weight || 0);
            return a.length - b.length;
        });
        return choices[0] || [];
    }
    getTeammateId(roomInfo, userId) {
        return this.getUserCamp(roomInfo, userId).find(id => id !== userId) || '';
    }
    getOpponentIds(roomInfo, userId) {
        const camp = this.getUserCamp(roomInfo, userId);
        const aliveUserIds = getAliveUserIds(roomInfo);
        if (camp.length <= 0)
            return aliveUserIds.filter(id => id !== userId);
        return aliveUserIds.filter(id => camp.indexOf(id) < 0);
    }
    isOpponentOnePlayAway(roomInfo, userId, impl) {
        return this.getOpponentIds(roomInfo, userId).some(id => {
            var _a, _b;
            const cards = (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[id]) === null || _b === void 0 ? void 0 : _b.user_card) || []);
            return cards.length > 0 && impl.judgeCardType(cards).valid;
        });
    }
    onlySingles(candidates, impl) {
        return candidates.filter(cards => { var _a; return ((_a = impl.judgeCardType(cards).extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE; });
    }
    onlyPairs(candidates, impl) {
        return candidates.filter(cards => { var _a; return ((_a = impl.judgeCardType(cards).extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.PAIR; });
    }
    chooseOpeningPlay(grouped, candidates, impl, teammateRemain, hasOpponentOneCard) {
        if (teammateRemain !== 1 && !hasOpponentOneCard) {
            const singles = this.onlySingles(candidates, impl);
            for (const rank of [3, 4, 5, 6, 7]) {
                const single = singles.find(cards => rankValue(cards[0]) === rank);
                if (single)
                    return single;
            }
        }
        if (teammateRemain === 2 || teammateRemain !== 1) {
            const pairs = this.onlyPairs(candidates, impl);
            for (const rank of [3, 4, 5, 6, 7]) {
                const pair = pairs.find(cards => rankValue(cards[0]) === rank);
                if (pair)
                    return pair;
            }
        }
        return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
    }
    chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard) {
        const choices = candidates.filter(cards => {
            var _a, _b;
            const playType = impl.judgeCardType(cards);
            if (isPowerPlay(playType))
                return false;
            if (((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard))
                return false;
            return [ShuangjianCardLogic_1.SjCardType.SINGLE, ShuangjianCardLogic_1.SjCardType.PAIR, ShuangjianCardLogic_1.SjCardType.THREE_WITH_TWO, ShuangjianCardLogic_1.SjCardType.STRAIGHT].indexOf((_b = playType.extra) === null || _b === void 0 ? void 0 : _b.type) >= 0;
        });
        if (choices.length > 0)
            return sortBySmallestLegalPlay(choices, impl)[0];
        const nonPower = candidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
        if (nonPower.length > 0)
            return sortBySmallestLegalPlay(nonPower, impl)[0];
        return [];
    }
}
exports.SimpleShuangjianAiStrategy = SimpleShuangjianAiStrategy;
class MediumShuangjianAiStrategy extends SimpleShuangjianAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Medium;
    }
    choosePlayCards(context) {
        var _a, _b, _c;
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const impl = roomInfo.gameModeImpl;
        const candidates = this.collectCandidates(impl, handCards);
        if (candidates.length <= 0)
            return [];
        const teammateId = this.getTeammateId(roomInfo, userId);
        const teammateCards = teammateId ? (((_b = (_a = roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[teammateId]) === null || _b === void 0 ? void 0 : _b.user_card) || []) : [];
        const teammateRemain = teammateCards.length;
        const opponents = this.getOpponentIds(roomInfo, userId);
        const opponentRemains = opponents.map(id => getRemainCount(roomInfo, id)).filter(count => count > 0);
        const hasOpponentOneCard = opponentRemains.some(count => count === 1);
        const hasDangerOpponent = opponentRemains.some(count => isShortHand(count, 5));
        const myProfile = buildHandProfile(handCards, impl);
        const teammateProfile = buildHandProfile(teammateCards, impl);
        const teammateNeedsAllSupport = isShortHand(teammateRemain, 8);
        const isRunner = !teammateNeedsAllSupport && (myProfile.strength >= teammateProfile.strength || myProfile.validWholeHand);
        if (handCards.length === 1) {
            return [[handCards[0]]].sort((a, b) => rankPower(rankValue(b[0])) - rankPower(rankValue(a[0])))[0];
        }
        if (isFreePlay) {
            if (teammateNeedsAllSupport) {
                const feedPlay = this.chooseFeedTeammatePlay(roomInfo, userId, teammateId, candidates, impl, teammateRemain, hasOpponentOneCard);
                if (feedPlay.length > 0)
                    return feedPlay;
            }
            const preferredType = teammateId ? getRecentPlayedType(roomInfo, teammateId, impl) : null;
            if (preferredType) {
                const sameTypeCards = filterBySjType(candidates, impl, preferredType)
                    .filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
                if (sameTypeCards.length > 0)
                    return sortBySmallestLegalPlay(sameTypeCards, impl)[0];
            }
            if (isRunner) {
                const runnerPlay = this.chooseRunnerFreePlay(candidates, impl, handCards, hasDangerOpponent);
                if (runnerPlay.length > 0)
                    return runnerPlay;
            }
            return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
        }
        const targetType = impl.judgeCardType((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []);
        if (!targetType.valid)
            return [];
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
        if (targetIsTeammate) {
            const playOutCards = candidates.filter(cards => isPlayOut(handCards, cards)
                && impl.compareCards(targetType, impl.judgeCardType(cards)) > 0);
            return playOutCards.length > 0 ? sortByRunnerValue(playOutCards, impl)[0] : [];
        }
        const targetRemain = getRemainCount(roomInfo, targetUserId);
        const targetDanger = isShortHand(targetRemain, 5) || hasDangerOpponent;
        const relation = getSeatRelation(roomInfo, userId, targetUserId);
        const beatCandidates = candidates.filter(cards => {
            const playType = impl.judgeCardType(cards);
            return playType.valid
                && impl.compareCards(targetType, playType) > 0
                && canUsePowerPlay(playType, handCards, cards, targetType, targetDanger);
        });
        if (beatCandidates.length <= 0)
            return [];
        if (teammateNeedsAllSupport && !targetDanger) {
            const conservative = beatCandidates.filter(cards => {
                var _a;
                return !isPowerPlay(impl.judgeCardType(cards))
                    && ((_a = impl.judgeCardType(cards).extra) === null || _a === void 0 ? void 0 : _a.type) !== ShuangjianCardLogic_1.SjCardType.SINGLE;
            });
            if (conservative.length > 0)
                return sortBySmallestLegalPlay(conservative, impl)[0];
        }
        const targetSjType = (_c = targetType.extra) === null || _c === void 0 ? void 0 : _c.type;
        if (targetSjType === ShuangjianCardLogic_1.SjCardType.SINGLE) {
            if (teammateRemain === 1 || hasOpponentOneCard)
                return [];
            const singles = this.onlySingles(beatCandidates, impl);
            if (targetDanger)
                return sortSinglesByPower(singles)[0] || [];
            if (relation === 'downstream') {
                return sortSinglesByPower(getRankRangeCandidates(singles, 8, 13, impl, targetType), true)[0] || [];
            }
            if (relation === 'upstream') {
                return sortSinglesByPower(getRankRangeCandidates(singles, 14, 15, impl, targetType))[0] || [];
            }
            return [];
        }
        if (targetSjType === ShuangjianCardLogic_1.SjCardType.PAIR) {
            const pairs = this.onlyPairs(beatCandidates, impl);
            if (targetDanger)
                return sortPairsByPower(pairs)[0] || [];
            if (relation === 'downstream') {
                return sortPairsByPower(getRankRangeCandidates(pairs, 8, 13, impl, targetType), true)[0] || [];
            }
            if (relation === 'upstream') {
                return sortPairsByPower(getRankRangeCandidates(pairs, 14, 15, impl, targetType))[0] || [];
            }
            return [];
        }
        return this.chooseBestPressPlay(beatCandidates, impl, targetDanger);
    }
    chooseFeedTeammatePlay(roomInfo, userId, teammateId, candidates, impl, teammateRemain, hasOpponentOneCard) {
        const preferredType = teammateId ? getRecentPlayedType(roomInfo, teammateId, impl) : null;
        if (preferredType) {
            const sameTypeCards = filterBySjType(candidates, impl, preferredType)
                .filter(cards => !isPowerPlay(impl.judgeCardType(cards)))
                .filter(cards => { var _a; return !(((_a = impl.judgeCardType(cards).extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard)); });
            if (sameTypeCards.length > 0)
                return sortBySmallestLegalPlay(sameTypeCards, impl)[0];
        }
        if (teammateRemain === 2) {
            const pairs = this.onlyPairs(candidates, impl).filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
            if (pairs.length > 0)
                return sortPairsByPower(pairs)[0];
        }
        return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
    }
    chooseRunnerFreePlay(candidates, impl, handCards, allowControlPower) {
        const choices = candidates.filter(cards => {
            const playType = impl.judgeCardType(cards);
            return canUsePowerPlay(playType, handCards, cards, { extra: { type: ShuangjianCardLogic_1.SjCardType.INVALID } }, allowControlPower);
        });
        return choices.length > 0 ? sortByRunnerValue(choices, impl)[0] : [];
    }
    chooseBestPressPlay(candidates, impl, targetDanger) {
        const plainCandidates = candidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
        const choices = plainCandidates.length > 0 || !targetDanger ? plainCandidates : candidates;
        if (choices.length <= 0)
            return [];
        return (targetDanger ? sortByRunnerValue(choices, impl) : sortBySmallestLegalPlay(choices, impl))[0] || [];
    }
}
exports.MediumShuangjianAiStrategy = MediumShuangjianAiStrategy;
class HellShuangjianAiStrategy extends SimpleShuangjianAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Hell;
    }
    choosePlayCards(context) {
        var _a;
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const impl = roomInfo.gameModeImpl;
        const candidates = this.collectCandidates(impl, handCards);
        if (candidates.length <= 0)
            return [];
        const teammateId = this.getTeammateId(roomInfo, userId);
        const teammateCards = teammateId ? getCardsOfUser(roomInfo, teammateId) : [];
        const opponents = this.getOpponentIds(roomInfo, userId);
        const targetType = isFreePlay ? null : impl.judgeCardType((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []);
        if (!isFreePlay && !(targetType === null || targetType === void 0 ? void 0 : targetType.valid))
            return [];
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const targetDanger = opponents.some(id => isShortHand(getRemainCount(roomInfo, id), 5));
        const decisionContext = {
            roomInfo,
            userId,
            handCards,
            teammateId,
            teammateCards,
            opponents,
            isFreePlay,
            targetType,
            targetUserId,
            targetIsTeammate: !isFreePlay && this.isTeammate(roomInfo, userId, targetUserId),
            targetDanger: targetDanger || isShortHand(getRemainCount(roomInfo, targetUserId), 5),
            teammateRecentType: teammateId ? getRecentPlayedType(roomInfo, teammateId, impl) : null,
            myProfile: buildHandProfile(handCards, impl),
            teammateProfile: buildHandProfile(teammateCards, impl),
            teamWinRate: this.estimateDoubleRunRate(roomInfo, userId, impl, true),
            opponentWinRate: this.estimateDoubleRunRate(roomInfo, userId, impl, false),
        };
        if (handCards.length === 1) {
            return [[handCards[0]]].sort((a, b) => rankPower(rankValue(b[0])) - rankPower(rankValue(a[0])))[0];
        }
        const legalCandidates = candidates.filter(cards => this.isHellLegalCandidate(cards, impl, decisionContext));
        if (legalCandidates.length <= 0)
            return [];
        const scored = legalCandidates.map(cards => ({
            cards,
            score: this.scoreCandidate(cards, impl, decisionContext),
        })).sort((a, b) => b.score - a.score);
        return ((_a = scored[0]) === null || _a === void 0 ? void 0 : _a.cards) || [];
    }
    isHellLegalCandidate(cards, impl, context) {
        var _a;
        const playType = impl.judgeCardType(cards);
        if (!playType.valid)
            return false;
        if (!context.isFreePlay) {
            if (impl.compareCards(context.targetType, playType) <= 0)
                return false;
            if (context.targetIsTeammate && !isPlayOut(context.handCards, cards))
                return false;
        }
        const teammateRemain = context.teammateCards.length;
        const hasOpponentOneCard = context.opponents.some(id => getRemainCount(context.roomInfo, id) === 1);
        if (((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard) && !isPlayOut(context.handCards, cards)) {
            return false;
        }
        return canUsePowerPlay(playType, context.handCards, cards, context.targetType || { extra: { type: ShuangjianCardLogic_1.SjCardType.INVALID } }, context.targetDanger)
            || this.isEndgameKill(context, cards, impl);
    }
    scoreCandidate(cards, impl, context) {
        const playType = impl.judgeCardType(cards);
        const remainingMine = context.handCards.length - cards.length;
        const teammateRemain = context.teammateCards.length;
        const teamAdvantage = context.teamWinRate - context.opponentWinRate;
        let score = 0;
        score += cards.length * 8;
        score += getCardPressureValue(playType);
        score += getSignalTypeBonus(playType, context.teammateRecentType);
        score += context.myProfile.strength >= context.teammateProfile.strength ? cards.length * 2 : -cards.length;
        score += teamAdvantage * 55;
        if (isPlayOut(context.handCards, cards))
            score += 260;
        if (remainingMine <= 3)
            score += (4 - remainingMine) * 35;
        if (remainingMine <= 15)
            score += this.scoreEndgameRoute(cards, impl, context);
        if (teammateRemain > 0 && teammateRemain <= 3) {
            score += this.scorePartnerFinishSupport(playType, context, cards);
        }
        else if (teammateRemain > 0 && teammateRemain < 8) {
            score += getSignalTypeBonus(playType, context.teammateRecentType) + 25;
        }
        if (!context.isFreePlay) {
            score += this.scorePressingValue(playType, context, cards);
        }
        else {
            score += this.scoreOpeningControl(playType, context, cards);
        }
        score += this.scoreBombEconomy(playType, context, cards);
        score += this.scoreOpponentThreatAfterPlay(cards, impl, context);
        return score;
    }
    estimateDoubleRunRate(roomInfo, userId, impl, forMyTeam) {
        const myTeam = getTeamIds(roomInfo, userId).filter(id => !!id);
        const targetTeam = forMyTeam ? myTeam : getOpposingIds(roomInfo, userId);
        const otherTeam = forMyTeam ? getOpposingIds(roomInfo, userId) : myTeam;
        const targetCards = getTeamCards(roomInfo, targetTeam);
        const otherCards = getTeamCards(roomInfo, otherTeam);
        const targetProfiles = targetTeam.map(id => buildHandProfile(getCardsOfUser(roomInfo, id), impl));
        const otherProfiles = otherTeam.map(id => buildHandProfile(getCardsOfUser(roomInfo, id), impl));
        const targetRemain = targetTeam.reduce((sum, id) => sum + getRemainCount(roomInfo, id), 0);
        const otherRemain = otherTeam.reduce((sum, id) => sum + getRemainCount(roomInfo, id), 0);
        const targetStrength = targetProfiles.reduce((sum, profile) => sum + profile.strength, 0);
        const otherStrength = otherProfiles.reduce((sum, profile) => sum + profile.strength, 0);
        const bombDelta = countPowerCandidates(targetCards, impl) - countPowerCandidates(otherCards, impl);
        const remainDelta = otherRemain - targetRemain;
        const raw = 0.5 + remainDelta * 0.018 + (targetStrength - otherStrength) * 0.012 + bombDelta * 0.035;
        return Math.max(0.05, Math.min(0.95, raw));
    }
    scorePressingValue(playType, context, cards) {
        var _a;
        let score = 0;
        const targetRemain = getRemainCount(context.roomInfo, context.targetUserId);
        const relation = getSeatRelation(context.roomInfo, context.userId, context.targetUserId);
        if (context.targetDanger)
            score += 75;
        if (isShortHand(targetRemain, 5))
            score += (5 - targetRemain) * 28;
        if (relation === 'upstream')
            score += 18;
        if (relation === 'downstream' && !context.targetDanger)
            score += 8;
        if (isPowerPlay(playType) && context.targetDanger)
            score += 35;
        if (((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE && context.opponents.some(id => getRemainCount(context.roomInfo, id) === 1))
            score -= 200;
        if (context.targetIsTeammate && !isPlayOut(context.handCards, cards))
            score -= 500;
        return score;
    }
    scoreOpeningControl(playType, context, cards) {
        var _a;
        let score = 0;
        const teammateRemain = context.teammateCards.length;
        if (teammateRemain > 0 && teammateRemain < 8)
            score += 36;
        if (((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) === context.teammateRecentType)
            score += 24;
        if (context.myProfile.strength >= context.teammateProfile.strength)
            score += cards.length >= 5 ? 32 : 8;
        else
            score += getPlainTypePriority(playType) <= 2 ? 18 : 4;
        if (isPowerPlay(playType) && context.opponentWinRate < 0.6)
            score -= 70;
        return score;
    }
    scorePartnerFinishSupport(playType, context, cards) {
        var _a, _b, _c;
        const teammateRemain = context.teammateCards.length;
        let score = 100 - teammateRemain * 15;
        if (teammateRemain === 1 && ((_a = playType.extra) === null || _a === void 0 ? void 0 : _a.type) === ShuangjianCardLogic_1.SjCardType.SINGLE)
            score -= 260;
        if (teammateRemain === 2 && ((_b = playType.extra) === null || _b === void 0 ? void 0 : _b.type) === ShuangjianCardLogic_1.SjCardType.PAIR)
            score += 80;
        if (((_c = playType.extra) === null || _c === void 0 ? void 0 : _c.type) === context.teammateRecentType)
            score += 60;
        if (isPowerPlay(playType))
            score += context.targetDanger ? 45 : -40;
        return score;
    }
    scoreBombEconomy(playType, context, cards) {
        if (!isPowerPlay(playType))
            return 0;
        if (isPlayOut(context.handCards, cards))
            return 180;
        const extra = playType.extra || {};
        if (extra.type === ShuangjianCardLogic_1.SjCardType.BOMB) {
            const headCount = extra.headCount || 4;
            if (context.targetDanger && headCount <= 5)
                return 55;
            if (context.targetDanger && headCount >= 6)
                return 15;
            return headCount >= 6 ? -90 : -45;
        }
        if (extra.type === ShuangjianCardLogic_1.SjCardType.KING_BOMB)
            return context.targetDanger ? 40 : -120;
        if (extra.type === ShuangjianCardLogic_1.SjCardType.FIVE_TEN_K)
            return context.targetDanger ? 25 : -35;
        return -20;
    }
    scoreOpponentThreatAfterPlay(cards, impl, context) {
        const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
        const remainProfile = buildHandProfile(remaining, impl);
        const opponentMinRemain = Math.min(...context.opponents.map(id => getRemainCount(context.roomInfo, id)).filter(count => count > 0));
        let score = remainProfile.validWholeHand ? 70 : 0;
        score += remainProfile.powerCount * 8;
        if (opponentMinRemain <= 3)
            score += context.targetDanger ? 40 : -20;
        if (remaining.length <= 0)
            score += 300;
        return score;
    }
    scoreEndgameRoute(cards, impl, context) {
        const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
        if (remaining.length === 0)
            return 240;
        const remainingCandidates = this.collectCandidates(impl, remaining);
        const canFinishNext = remainingCandidates.some(candidate => candidate.length === remaining.length && impl.judgeCardType(candidate).valid);
        let score = canFinishNext ? 120 : 0;
        if (context.teammateCards.length <= 3 && context.teammateCards.length > 0)
            score += 80;
        if (context.opponents.some(id => getRemainCount(context.roomInfo, id) <= 3 && getRemainCount(context.roomInfo, id) > 0))
            score += 65;
        return score;
    }
    isEndgameKill(context, cards, impl) {
        const teamRemain = context.handCards.length + context.teammateCards.length;
        if (teamRemain > 15)
            return false;
        if (isPlayOut(context.handCards, cards))
            return true;
        const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
        return remaining.length <= 6 && this.collectCandidates(impl, remaining)
            .some(candidate => candidate.length === remaining.length && impl.judgeCardType(candidate).valid);
    }
}
exports.HellShuangjianAiStrategy = HellShuangjianAiStrategy;
const simpleShuangjianAi = new SimpleShuangjianAiStrategy();
const mediumShuangjianAi = new MediumShuangjianAiStrategy();
const hellShuangjianAi = new HellShuangjianAiStrategy();
function getShuangjianAiStrategy(level) {
    switch ((0, types_1.normalizeRobotLevel)(level)) {
        case types_1.RobotLevel.Medium:
            return mediumShuangjianAi;
        case types_1.RobotLevel.Hell:
            return hellShuangjianAi;
        case types_1.RobotLevel.Simple:
        default:
            return simpleShuangjianAi;
    }
}
//# sourceMappingURL=shuangjianAi.js.map