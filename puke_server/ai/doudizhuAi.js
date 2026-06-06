"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HellDoudizhuAiStrategy = exports.MediumDoudizhuAiStrategy = exports.SimpleDoudizhuAiStrategy = void 0;
exports.getDoudizhuAiStrategy = getDoudizhuAiStrategy;
const cardHint_1 = require("../cardLogic/cardHint");
const cardLogic_1 = require("../cardLogic/cardLogic");
const types_1 = require("./types");
const DoudizhuCardSize = cardLogic_1.CardSize;
const SMALL_TO_BIG_RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];
function cardRank(card) {
    var _a, _b;
    return ((_b = (_a = (0, cardLogic_1.getPoint)([card])) === null || _a === void 0 ? void 0 : _a[0]) === null || _b === void 0 ? void 0 : _b.value) || 0;
}
function rankPower(value) {
    if (value === 1)
        return 14;
    if (value === 2)
        return 15;
    if (value === 53)
        return 16;
    if (value === 54)
        return 17;
    return value;
}
function playMinPower(cards) {
    if (!cards || cards.length <= 0)
        return 0;
    return Math.min(...cards.map(card => rankPower(cardRank(card))));
}
function playMaxPower(cards) {
    if (!cards || cards.length <= 0)
        return 0;
    return Math.max(...cards.map(card => rankPower(cardRank(card))));
}
function cardTypeName(cards) {
    var _a;
    return ((_a = cardLogic_1.default.judgeCardType(cards)) === null || _a === void 0 ? void 0 : _a.name) || '';
}
function isBombPlay(cards) {
    const typeName = cardTypeName(cards);
    return typeName === cardLogic_1.CardTypeValue.Boom.name || typeName === cardLogic_1.CardTypeValue.kingboom.name;
}
function isPlainPlay(cards) {
    return cards.length > 0 && !isBombPlay(cards);
}
function getPlayTypePriority(cards) {
    const typeName = cardTypeName(cards);
    switch (typeName) {
        case cardLogic_1.CardTypeValue.One.name: return 1;
        case cardLogic_1.CardTypeValue.Double.name: return 2;
        case cardLogic_1.CardTypeValue.Three.name: return 3;
        case cardLogic_1.CardTypeValue.Scroll.name: return 4;
        case cardLogic_1.CardTypeValue.DoubleScroll.name: return 5;
        case cardLogic_1.CardTypeValue.ThreeWithOne.name: return 6;
        case cardLogic_1.CardTypeValue.ThreeWithTwo.name: return 7;
        case cardLogic_1.CardTypeValue.Plane.name: return 8;
        case cardLogic_1.CardTypeValue.Boom.name: return 30;
        case cardLogic_1.CardTypeValue.kingboom.name: return 40;
        default: return 20;
    }
}
function getPlayerRemain(roomInfo, userId) {
    var _a, _b;
    return (((_b = (_a = roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[userId]) === null || _b === void 0 ? void 0 : _b.user_card) || []).length;
}
function getNextPlayerId(roomInfo, userId) {
    const ids = ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUserIdList) || []);
    const index = ids.indexOf(userId);
    if (index < 0 || ids.length <= 0)
        return '';
    return ids[index - 1 < 0 ? ids.length - 1 : index - 1] || '';
}
function getPrevPlayerId(roomInfo, userId) {
    const ids = ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUserIdList) || []);
    const index = ids.indexOf(userId);
    if (index < 0 || ids.length <= 0)
        return '';
    return ids[index + 1 >= ids.length ? 0 : index + 1] || '';
}
function getFarmerSeatRelation(roomInfo, farmerId) {
    const landlordId = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '';
    if (!landlordId || farmerId === landlordId)
        return 'other';
    if (getPrevPlayerId(roomInfo, farmerId) === landlordId)
        return 'downstream';
    if (getNextPlayerId(roomInfo, farmerId) === landlordId)
        return 'upstream';
    return 'other';
}
function sortBySmallest(candidates) {
    return candidates.slice().sort((a, b) => {
        const typeDiff = getPlayTypePriority(a) - getPlayTypePriority(b);
        if (typeDiff !== 0)
            return typeDiff;
        const lengthDiff = a.length - b.length;
        if (lengthDiff !== 0)
            return lengthDiff;
        return playMinPower(a) - playMinPower(b);
    });
}
function sortByLargest(candidates) {
    return candidates.slice().sort((a, b) => {
        const typeDiff = getPlayTypePriority(b) - getPlayTypePriority(a);
        if (typeDiff !== 0)
            return typeDiff;
        const lengthDiff = b.length - a.length;
        if (lengthDiff !== 0)
            return lengthDiff;
        return playMaxPower(b) - playMaxPower(a);
    });
}
function sortSameTypeBySmallest(candidates) {
    return candidates.slice().sort((a, b) => {
        const bombDiff = Number(isBombPlay(a)) - Number(isBombPlay(b));
        if (bombDiff !== 0)
            return bombDiff;
        return playMinPower(a) - playMinPower(b);
    });
}
function filterRankRange(candidates, minPower, maxPower) {
    return candidates.filter(cards => {
        const power = playMinPower(cards);
        return power >= minPower && power <= maxPower;
    });
}
function countConsecutive(values) {
    const sorted = values
        .filter(value => value !== 2 && value !== 53 && value !== 54)
        .sort((a, b) => DoudizhuCardSize[a] - DoudizhuCardSize[b]);
    let best = 0;
    let current = 0;
    let lastSize = 0;
    sorted.forEach(value => {
        const size = DoudizhuCardSize[value];
        current = size === lastSize + 1 ? current + 1 : 1;
        best = Math.max(best, current);
        lastSize = size;
    });
    return best;
}
function isRankInStraight(value, values, minLength) {
    if (value === 2 || value === 53 || value === 54)
        return false;
    const uniqueValues = Array.from(new Set(values.filter(item => item !== 2 && item !== 53 && item !== 54)))
        .sort((a, b) => DoudizhuCardSize[a] - DoudizhuCardSize[b]);
    let run = [];
    for (const item of uniqueValues) {
        const last = run[run.length - 1];
        if (!last || DoudizhuCardSize[item] === DoudizhuCardSize[last] + 1) {
            run.push(item);
        }
        else {
            run = [item];
        }
        if (run.length >= minLength && run.indexOf(value) >= 0)
            return true;
    }
    return false;
}
function isSingleBreakingCombination(handCards, playCards) {
    if (!playCards || playCards.length !== 1 || handCards.length <= 1)
        return false;
    const value = cardRank(playCards[0]);
    const values = ((0, cardLogic_1.getPoint)(handCards) || []).map(card => card.value);
    const sameRankCount = values.filter(item => item === value).length;
    if (sameRankCount >= 2)
        return true;
    if ((value === 53 && values.indexOf(54) >= 0) || (value === 54 && values.indexOf(53) >= 0))
        return true;
    return isRankInStraight(value, values, 5);
}
function buildHandProfile(cards) {
    const points = (0, cardLogic_1.getPoint)(cards) || [];
    const valueCount = new Map();
    points.forEach(card => {
        valueCount.set(card.value, (valueCount.get(card.value) || 0) + 1);
    });
    const hasSmallKing = valueCount.has(53);
    const hasBigKing = valueCount.has(54);
    const hasKingBoom = hasSmallKing && hasBigKing;
    const twoCount = valueCount.get(2) || 0;
    const aceCount = valueCount.get(1) || 0;
    const bombCount = Array.from(valueCount.entries())
        .filter(([value, count]) => value !== 53 && value !== 54 && count >= 4)
        .length;
    const tripleCount = Array.from(valueCount.entries())
        .filter(([value, count]) => value !== 53 && value !== 54 && count >= 3)
        .length;
    const pairCount = Array.from(valueCount.entries())
        .filter(([value, count]) => value !== 53 && value !== 54 && count >= 2)
        .length;
    const lowSingleCount = Array.from(valueCount.entries())
        .filter(([value, count]) => count === 1 && value !== 1 && value !== 2 && value !== 53 && value !== 54 && DoudizhuCardSize[value] <= DoudizhuCardSize[10])
        .length;
    const longestStraight = countConsecutive(Array.from(valueCount.keys()));
    const longestDoubleStraight = countConsecutive(Array.from(valueCount.entries())
        .filter(([_, count]) => count >= 2)
        .map(([value]) => value));
    let strength = 0;
    if (hasKingBoom)
        strength += 32;
    else {
        if (hasSmallKing)
            strength += 10;
        if (hasBigKing)
            strength += 12;
    }
    strength += bombCount * 28;
    strength += twoCount * 10;
    strength += aceCount * 5;
    strength += tripleCount * 6;
    strength += pairCount * 2;
    if (longestStraight >= 5)
        strength += longestStraight * 3;
    if (longestDoubleStraight >= 3)
        strength += longestDoubleStraight * 5;
    strength -= lowSingleCount * 2;
    const neatness = tripleCount * 4 + pairCount * 2 + longestStraight + longestDoubleStraight * 2 - lowSingleCount;
    return {
        valueCount,
        bombCount,
        hasKingBoom,
        twoCount,
        aceCount,
        tripleCount,
        pairCount,
        lowSingleCount,
        longestStraight,
        longestDoubleStraight,
        strength,
        neatness,
    };
}
function isWholeHandPlay(handCards, playCards) {
    return playCards.length > 0 && playCards.length === handCards.length;
}
function getTeammateId(roomInfo, userId) {
    if ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) === userId)
        return '';
    return ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUserIdList) || []).find(id => id && id !== userId && id !== (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id)) || '';
}
function getOpponentIds(roomInfo, userId) {
    const landlordId = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '';
    const ids = ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUserIdList) || []).filter(id => !!id && id !== userId);
    if (userId === landlordId)
        return ids;
    return landlordId ? [landlordId] : [];
}
function getRecentActivePlayer(roomInfo, userId) {
    var _a;
    const records = ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.play_card_record) || []);
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if ((record === null || record === void 0 ? void 0 : record.userId) !== userId && ((_a = record === null || record === void 0 ? void 0 : record.playCard) === null || _a === void 0 ? void 0 : _a.length) > 0)
            return record.userId;
    }
    return '';
}
function countConsecutivePlays(roomInfo, userId) {
    const records = ((roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.play_card_record) || []);
    let count = 0;
    for (let i = records.length - 1; i >= 0; i--) {
        const record = records[i];
        if (!(record === null || record === void 0 ? void 0 : record.playCard) || record.playCard.length <= 0)
            continue;
        if (record.userId !== userId)
            break;
        count += 1;
    }
    return count;
}
class BaseDoudizhuAiStrategy {
    shouldSelectLandlord(cards) {
        const profile = buildHandProfile(cards);
        if (profile.bombCount > 0)
            return true;
        if (profile.hasKingBoom && profile.twoCount >= 2)
            return true;
        if (profile.twoCount >= 3 && (profile.aceCount >= 1 || profile.tripleCount >= 1 || profile.longestStraight >= 6))
            return true;
        return profile.strength >= 45;
    }
    isTeammate(roomInfo, userId, targetUserId) {
        if (!userId || !targetUserId || userId === targetUserId)
            return false;
        return roomInfo.landlord_id !== userId && roomInfo.landlord_id !== targetUserId;
    }
    canPlayOut(handCards, playCards) {
        return isWholeHandPlay(handCards, playCards);
    }
    getCandidates(context) {
        var _a;
        const candidates = cardHint_1.default.cardHint(context.isFreePlay ? [] : (((_a = context.lastRecord) === null || _a === void 0 ? void 0 : _a.playCard) || []), context.handCards) || [];
        const protectedCandidates = candidates.filter(cards => !isSingleBreakingCombination(context.handCards, cards));
        return protectedCandidates.length > 0 ? protectedCandidates : candidates;
    }
    getWeakestPlay(candidates, avoidSingle = false) {
        const plays = candidates.filter(cards => isPlainPlay(cards) && (!avoidSingle || cardTypeName(cards) !== cardLogic_1.CardTypeValue.One.name));
        return (plays.length > 0 ? sortBySmallest(plays) : sortBySmallest(candidates))[0] || [];
    }
    getSmallestSameType(candidates, typeName, avoidBomb = true) {
        const plays = candidates.filter(cards => cardTypeName(cards) === typeName && (!avoidBomb || !isBombPlay(cards)));
        return sortSameTypeBySmallest(plays)[0] || [];
    }
    getLargestSameType(candidates, typeName) {
        const plays = candidates.filter(cards => cardTypeName(cards) === typeName && !isBombPlay(cards));
        return sortByLargest(plays)[0] || [];
    }
    getBombWhenAllowed(context, candidates, dangerOnly) {
        const { roomInfo, userId, handCards } = context;
        const opponents = getOpponentIds(roomInfo, userId);
        const opponentMayWin = opponents.some(id => getPlayerRemain(roomInfo, id) <= 2 && getPlayerRemain(roomInfo, id) > 0);
        const canWin = candidates.some(cards => isWholeHandPlay(handCards, cards));
        if (dangerOnly && !opponentMayWin && !canWin)
            return [];
        return sortSameTypeBySmallest(candidates.filter(isBombPlay))[0] || [];
    }
}
class SimpleDoudizhuAiStrategy extends BaseDoudizhuAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Simple;
    }
    choosePlayCards(context) {
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const landlordId = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '';
        const isLandlord = userId === landlordId;
        const candidates = this.getCandidates(context);
        if (candidates.length <= 0)
            return [];
        const wholeHand = candidates.find(cards => isWholeHandPlay(handCards, cards));
        if (isLandlord && wholeHand)
            return wholeHand;
        if (isFreePlay) {
            const avoidSingle = !isLandlord && getPlayerRemain(roomInfo, landlordId) === 1;
            return this.getWeakestPlay(candidates, avoidSingle);
        }
        const targetCards = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || [];
        const targetTypeName = cardTypeName(targetCards);
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const targetIsLandlord = targetUserId === landlordId;
        const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
        if (!isLandlord && targetIsTeammate) {
            return this.chooseSimpleFarmerFollowTeammate(context, candidates, targetTypeName);
        }
        if (isLandlord) {
            return this.chooseSimpleLandlordFollow(context, candidates, targetTypeName, targetUserId);
        }
        if (targetIsLandlord) {
            return this.chooseSimpleFarmerFollowLandlord(context, candidates, targetTypeName);
        }
        return [];
    }
    chooseSimpleFarmerFollowLandlord(context, candidates, targetTypeName) {
        var _a;
        const landlordRemain = getPlayerRemain(context.roomInfo, ((_a = context.roomInfo) === null || _a === void 0 ? void 0 : _a.landlord_id) || '');
        const relation = getFarmerSeatRelation(context.roomInfo, context.userId);
        if (landlordRemain === 1 && targetTypeName === cardLogic_1.CardTypeValue.One.name)
            return [];
        if (targetTypeName === cardLogic_1.CardTypeValue.One.name) {
            const singles = candidates.filter(cards => cardTypeName(cards) === cardLogic_1.CardTypeValue.One.name);
            if (relation === 'downstream')
                return sortByLargest(filterRankRange(singles, 8, 13))[0] || [];
            if (relation === 'upstream')
                return sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0] || [];
        }
        if (targetTypeName === cardLogic_1.CardTypeValue.Double.name) {
            const pairs = candidates.filter(cards => cardTypeName(cards) === cardLogic_1.CardTypeValue.Double.name);
            if (landlordRemain === 2)
                return sortSameTypeBySmallest(pairs)[0] || [];
            if (relation === 'downstream')
                return sortByLargest(filterRankRange(pairs, 8, 13))[0] || [];
            if (relation === 'upstream')
                return sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0] || [];
        }
        if ([cardLogic_1.CardTypeValue.Three.name, cardLogic_1.CardTypeValue.Scroll.name, cardLogic_1.CardTypeValue.DoubleScroll.name, cardLogic_1.CardTypeValue.Plane.name].indexOf(targetTypeName) >= 0) {
            return this.getSmallestSameType(candidates, targetTypeName);
        }
        return this.getBombWhenAllowed(context, candidates, true);
    }
    chooseSimpleFarmerFollowTeammate(context, candidates, targetTypeName) {
        if (this.canPlayOut(context.handCards, candidates[0] || []))
            return candidates[0];
        const relation = getFarmerSeatRelation(context.roomInfo, context.userId);
        if (targetTypeName === cardLogic_1.CardTypeValue.One.name) {
            return relation === 'upstream'
                ? this.getLargestSameType(candidates, cardLogic_1.CardTypeValue.One.name)
                : this.getSmallestSameType(candidates, cardLogic_1.CardTypeValue.One.name);
        }
        if (targetTypeName === cardLogic_1.CardTypeValue.Double.name) {
            return relation === 'upstream'
                ? this.getLargestSameType(candidates, cardLogic_1.CardTypeValue.Double.name)
                : this.getSmallestSameType(candidates, cardLogic_1.CardTypeValue.Double.name);
        }
        return [];
    }
    chooseSimpleLandlordFollow(context, candidates, targetTypeName, targetUserId) {
        var _a;
        const relation = getFarmerSeatRelation(context.roomInfo, targetUserId);
        const targetMaxPower = playMaxPower(((_a = context.lastRecord) === null || _a === void 0 ? void 0 : _a.playCard) || []);
        if (targetTypeName === cardLogic_1.CardTypeValue.One.name) {
            const singles = candidates.filter(cards => cardTypeName(cards) === cardLogic_1.CardTypeValue.One.name);
            if (relation === 'downstream') {
                return sortSameTypeBySmallest(filterRankRange(singles, 8, 13))[0]
                    || sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0]
                    || [];
            }
            if (targetMaxPower <= rankPower(10))
                return [];
            return sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0] || [];
        }
        if (targetTypeName === cardLogic_1.CardTypeValue.Double.name) {
            const pairs = candidates.filter(cards => cardTypeName(cards) === cardLogic_1.CardTypeValue.Double.name);
            if (relation === 'downstream') {
                return sortSameTypeBySmallest(filterRankRange(pairs, 8, 13))[0]
                    || sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0]
                    || [];
            }
            if (targetMaxPower <= rankPower(10))
                return [];
            return sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0] || [];
        }
        if ([cardLogic_1.CardTypeValue.Scroll.name, cardLogic_1.CardTypeValue.DoubleScroll.name, cardLogic_1.CardTypeValue.Plane.name].indexOf(targetTypeName) >= 0) {
            return this.getSmallestSameType(candidates, targetTypeName);
        }
        return this.getBombWhenAllowed(context, candidates, true);
    }
}
exports.SimpleDoudizhuAiStrategy = SimpleDoudizhuAiStrategy;
class MediumDoudizhuAiStrategy extends SimpleDoudizhuAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Medium;
    }
    choosePlayCards(context) {
        var _a, _b;
        const candidates = this.getCandidates(context);
        if (candidates.length <= 0)
            return [];
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const isLandlord = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) === userId;
        const myProfile = buildHandProfile(handCards);
        const teammateId = getTeammateId(roomInfo, userId);
        const teammateProfile = teammateId ? buildHandProfile(((_b = (_a = roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.roomUsers) === null || _a === void 0 ? void 0 : _a[teammateId]) === null || _b === void 0 ? void 0 : _b.user_card) || []) : null;
        const opponents = getOpponentIds(roomInfo, userId);
        const hasDangerOpponent = opponents.some(id => getPlayerRemain(roomInfo, id) <= 3 && getPlayerRemain(roomInfo, id) > 0);
        const isMainAttacker = isLandlord || !teammateProfile || myProfile.strength + myProfile.neatness >= teammateProfile.strength + teammateProfile.neatness;
        const wholeHand = candidates.find(cards => isWholeHandPlay(handCards, cards));
        if (wholeHand)
            return wholeHand;
        if (isFreePlay) {
            if (isLandlord)
                return this.choosePlannedFreePlay(candidates, myProfile, hasDangerOpponent);
            if (!isMainAttacker && teammateId)
                return this.chooseSupportFreePlay(context, candidates, teammateId);
            return this.choosePlannedFreePlay(candidates, myProfile, hasDangerOpponent);
        }
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
        const targetIsLandlord = targetUserId === (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id);
        const targetTypeName = cardTypeName((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []);
        if (!isLandlord && targetIsTeammate) {
            const playOut = candidates.filter(cards => isWholeHandPlay(handCards, cards));
            if (playOut.length > 0)
                return sortByLargest(playOut)[0];
            return [];
        }
        if (!isLandlord && targetIsLandlord) {
            if (getPlayerRemain(roomInfo, (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '') === 1 && targetTypeName === cardLogic_1.CardTypeValue.One.name)
                return [];
            const plain = candidates.filter(isPlainPlay);
            if (hasDangerOpponent)
                return sortBySmallest(candidates)[0] || [];
            return sortSameTypeBySmallest(plain.filter(cards => cardTypeName(cards) === targetTypeName))[0]
                || this.getBombWhenAllowed(context, candidates, true);
        }
        if (isLandlord) {
            const targetRemain = getPlayerRemain(roomInfo, targetUserId);
            const relation = getFarmerSeatRelation(roomInfo, targetUserId);
            const shouldPress = targetRemain <= 5 || relation === 'downstream' || countConsecutivePlays(roomInfo, targetUserId) >= 2;
            if (!shouldPress && playMaxPower((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []) <= rankPower(10))
                return [];
            return sortSameTypeBySmallest(candidates.filter(isPlainPlay).filter(cards => cardTypeName(cards) === targetTypeName))[0]
                || this.getBombWhenAllowed(context, candidates, targetRemain <= 1);
        }
        return super.choosePlayCards(context);
    }
    choosePlannedFreePlay(candidates, profile, hasDangerOpponent) {
        const plain = candidates.filter(isPlainPlay);
        if (hasDangerOpponent)
            return sortByLargest(plain.length > 0 ? plain : candidates)[0] || [];
        const weakTypes = profile.lowSingleCount >= 2
            ? [cardLogic_1.CardTypeValue.One.name, cardLogic_1.CardTypeValue.Double.name, cardLogic_1.CardTypeValue.Three.name, cardLogic_1.CardTypeValue.Scroll.name]
            : [cardLogic_1.CardTypeValue.Scroll.name, cardLogic_1.CardTypeValue.DoubleScroll.name, cardLogic_1.CardTypeValue.Three.name, cardLogic_1.CardTypeValue.One.name, cardLogic_1.CardTypeValue.Double.name];
        for (const typeName of weakTypes) {
            const play = this.getSmallestSameType(plain, typeName);
            if (play.length > 0)
                return play;
        }
        return this.getWeakestPlay(candidates);
    }
    chooseSupportFreePlay(context, candidates, teammateId) {
        var _a;
        const teammateRemain = getPlayerRemain(context.roomInfo, teammateId);
        if (teammateRemain === 1)
            return this.getSmallestSameType(candidates, cardLogic_1.CardTypeValue.One.name);
        if (teammateRemain === 2)
            return this.getSmallestSameType(candidates, cardLogic_1.CardTypeValue.Double.name);
        return this.getWeakestPlay(candidates, getPlayerRemain(context.roomInfo, ((_a = context.roomInfo) === null || _a === void 0 ? void 0 : _a.landlord_id) || '') === 1);
    }
}
exports.MediumDoudizhuAiStrategy = MediumDoudizhuAiStrategy;
class HellDoudizhuAiStrategy extends MediumDoudizhuAiStrategy {
    constructor() {
        super(...arguments);
        this.level = types_1.RobotLevel.Hell;
    }
    choosePlayCards(context) {
        var _a;
        const candidates = this.getCandidates(context);
        if (candidates.length <= 0)
            return [];
        const legal = candidates.filter(cards => this.isLegalHellCandidate(context, cards));
        if (legal.length <= 0)
            return [];
        const scored = legal.map(cards => ({
            cards,
            score: this.scoreHellCandidate(context, cards),
        })).sort((a, b) => b.score - a.score);
        return ((_a = scored[0]) === null || _a === void 0 ? void 0 : _a.cards) || [];
    }
    isLegalHellCandidate(context, cards) {
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const isLandlord = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) === userId;
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const targetIsTeammate = !isFreePlay && this.isTeammate(roomInfo, userId, targetUserId);
        const landlordRemain = getPlayerRemain(roomInfo, (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '');
        if (isWholeHandPlay(handCards, cards))
            return true;
        if (!isLandlord && cardTypeName(cards) === cardLogic_1.CardTypeValue.One.name && landlordRemain === 1)
            return false;
        if (targetIsTeammate)
            return false;
        if (isBombPlay(cards)) {
            const opponentDanger = getOpponentIds(roomInfo, userId).some(id => getPlayerRemain(roomInfo, id) <= 2 && getPlayerRemain(roomInfo, id) > 0);
            return opponentDanger || handCards.length - cards.length <= 3;
        }
        return true;
    }
    scoreHellCandidate(context, cards) {
        const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
        const isLandlord = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) === userId;
        const targetUserId = (lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.userId) || '';
        const typeName = cardTypeName(cards);
        const profile = buildHandProfile(handCards);
        const remaining = handCards.filter(card => cards.indexOf(card) < 0);
        const remainProfile = buildHandProfile(remaining);
        const opponents = getOpponentIds(roomInfo, userId);
        const opponentMinRemain = Math.min(...opponents.map(id => getPlayerRemain(roomInfo, id)).filter(count => count > 0), 99);
        const teammateId = getTeammateId(roomInfo, userId);
        const teammateRemain = teammateId ? getPlayerRemain(roomInfo, teammateId) : 0;
        let score = 0;
        score += cards.length * 10;
        score += isPlainPlay(cards) ? 20 : -60;
        score += isWholeHandPlay(handCards, cards) ? 500 : 0;
        score += (profile.strength - remainProfile.strength) * 0.4;
        score += remaining.length <= 3 ? (4 - remaining.length) * 55 : 0;
        score -= playMaxPower(cards) * 1.5;
        if (isFreePlay) {
            score += this.scoreHellFreePlay(typeName, cards, isLandlord, profile, teammateRemain, opponentMinRemain);
        }
        else {
            score += this.scoreHellFollowPlay(typeName, cards, context, targetUserId, opponentMinRemain);
        }
        if (isLandlord) {
            if (opponentMinRemain <= 2)
                score += 80;
            if (countConsecutivePlays(roomInfo, getRecentActivePlayer(roomInfo, userId)) >= 2)
                score += 35;
            if (typeName === cardLogic_1.CardTypeValue.One.name && opponents.some(id => getPlayerRemain(roomInfo, id) === 1))
                score -= 90;
        }
        else {
            const landlordRemain = getPlayerRemain(roomInfo, (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) || '');
            if (landlordRemain <= 2)
                score += 85;
            if (teammateRemain === 1 && typeName === cardLogic_1.CardTypeValue.One.name)
                score -= 160;
            if (teammateRemain === 2 && typeName === cardLogic_1.CardTypeValue.Double.name)
                score += 55;
        }
        if (isBombPlay(cards)) {
            score += opponentMinRemain <= 2 || remaining.length <= 3 ? 120 : -180;
        }
        return score;
    }
    scoreHellFreePlay(typeName, cards, isLandlord, profile, teammateRemain, opponentMinRemain) {
        let score = 0;
        if (isLandlord) {
            if (profile.lowSingleCount > 0 && typeName === cardLogic_1.CardTypeValue.One.name)
                score += 70;
            if (profile.pairCount >= 3 && typeName === cardLogic_1.CardTypeValue.Double.name)
                score += 45;
            if (typeName === cardLogic_1.CardTypeValue.Scroll.name || typeName === cardLogic_1.CardTypeValue.DoubleScroll.name)
                score += cards.length * 5;
            if (opponentMinRemain <= 3)
                score += cards.length * 8;
        }
        else {
            if (teammateRemain === 1 && typeName !== cardLogic_1.CardTypeValue.One.name)
                score += 70;
            if (teammateRemain === 2 && typeName === cardLogic_1.CardTypeValue.Double.name)
                score += 80;
            if (typeName === cardLogic_1.CardTypeValue.Scroll.name || typeName === cardLogic_1.CardTypeValue.DoubleScroll.name)
                score += 30;
        }
        score -= getPlayTypePriority(cards) * 2;
        return score;
    }
    scoreHellFollowPlay(typeName, cards, context, targetUserId, opponentMinRemain) {
        const { roomInfo, userId, lastRecord } = context;
        const isLandlord = (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id) === userId;
        const targetRemain = getPlayerRemain(roomInfo, targetUserId);
        const targetTypeName = cardTypeName((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []);
        let score = 0;
        if (typeName === targetTypeName)
            score += 70;
        if (targetRemain <= 3)
            score += 100 - targetRemain * 18;
        if (opponentMinRemain <= 2)
            score += 75;
        if (isLandlord) {
            const relation = getFarmerSeatRelation(roomInfo, targetUserId);
            if (relation === 'downstream')
                score += 55;
            if (relation === 'upstream' && playMaxPower((lastRecord === null || lastRecord === void 0 ? void 0 : lastRecord.playCard) || []) <= rankPower(10))
                score -= 85;
        }
        else {
            if (targetUserId === (roomInfo === null || roomInfo === void 0 ? void 0 : roomInfo.landlord_id))
                score += 65;
            if (getFarmerSeatRelation(roomInfo, userId) === 'upstream')
                score += 20;
        }
        score -= playMaxPower(cards);
        return score;
    }
}
exports.HellDoudizhuAiStrategy = HellDoudizhuAiStrategy;
const simpleDoudizhuAi = new SimpleDoudizhuAiStrategy();
const mediumDoudizhuAi = new MediumDoudizhuAiStrategy();
const hellDoudizhuAi = new HellDoudizhuAiStrategy();
function getDoudizhuAiStrategy(level) {
    switch ((0, types_1.normalizeRobotLevel)(level)) {
        case types_1.RobotLevel.Medium:
            return mediumDoudizhuAi;
        case types_1.RobotLevel.Hell:
            return hellDoudizhuAi;
        case types_1.RobotLevel.Simple:
        default:
            return simpleDoudizhuAi;
    }
}
//# sourceMappingURL=doudizhuAi.js.map