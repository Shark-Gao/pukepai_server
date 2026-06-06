import cardHint from '../cardLogic/cardHint';
import CardLogic, { CardSize, CardTypeValue, getPoint } from '../cardLogic/cardLogic';
import { DoudizhuAiStrategy, RobotLevel, RobotPlayDecisionContext, normalizeRobotLevel } from './types';

const DoudizhuCardSize = CardSize as Record<number, number>;
const SMALL_TO_BIG_RANKS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];

type SeatRelation = 'downstream' | 'upstream' | 'other';

interface DoudizhuHandProfile {
  valueCount: Map<number, number>;
  bombCount: number;
  hasKingBoom: boolean;
  twoCount: number;
  aceCount: number;
  tripleCount: number;
  pairCount: number;
  lowSingleCount: number;
  longestStraight: number;
  longestDoubleStraight: number;
  strength: number;
  neatness: number;
}

function cardRank(card: number): number {
  return getPoint([card])?.[0]?.value || 0;
}

function rankPower(value: number): number {
  if (value === 1) return 14;
  if (value === 2) return 15;
  if (value === 53) return 16;
  if (value === 54) return 17;
  return value;
}

function playMinPower(cards: number[]): number {
  if (!cards || cards.length <= 0) return 0;
  return Math.min(...cards.map(card => rankPower(cardRank(card))));
}

function playMaxPower(cards: number[]): number {
  if (!cards || cards.length <= 0) return 0;
  return Math.max(...cards.map(card => rankPower(cardRank(card))));
}

function cardTypeName(cards: number[]): string {
  return CardLogic.judgeCardType(cards)?.name || '';
}

function isBombPlay(cards: number[]): boolean {
  const typeName = cardTypeName(cards);
  return typeName === CardTypeValue.Boom.name || typeName === CardTypeValue.kingboom.name;
}

function isPlainPlay(cards: number[]): boolean {
  return cards.length > 0 && !isBombPlay(cards);
}

function getPlayTypePriority(cards: number[]): number {
  const typeName = cardTypeName(cards);
  switch (typeName) {
    case CardTypeValue.One.name: return 1;
    case CardTypeValue.Double.name: return 2;
    case CardTypeValue.Three.name: return 3;
    case CardTypeValue.Scroll.name: return 4;
    case CardTypeValue.DoubleScroll.name: return 5;
    case CardTypeValue.ThreeWithOne.name: return 6;
    case CardTypeValue.ThreeWithTwo.name: return 7;
    case CardTypeValue.Plane.name: return 8;
    case CardTypeValue.Boom.name: return 30;
    case CardTypeValue.kingboom.name: return 40;
    default: return 20;
  }
}

function getPlayerRemain(roomInfo: any, userId: string): number {
  return (roomInfo?.roomUsers?.[userId]?.user_card || []).length;
}

function getNextPlayerId(roomInfo: any, userId: string): string {
  const ids = (roomInfo?.roomUserIdList || []) as string[];
  const index = ids.indexOf(userId);
  if (index < 0 || ids.length <= 0) return '';
  return ids[index - 1 < 0 ? ids.length - 1 : index - 1] || '';
}

function getPrevPlayerId(roomInfo: any, userId: string): string {
  const ids = (roomInfo?.roomUserIdList || []) as string[];
  const index = ids.indexOf(userId);
  if (index < 0 || ids.length <= 0) return '';
  return ids[index + 1 >= ids.length ? 0 : index + 1] || '';
}

function getFarmerSeatRelation(roomInfo: any, farmerId: string): SeatRelation {
  const landlordId = roomInfo?.landlord_id || '';
  if (!landlordId || farmerId === landlordId) return 'other';
  if (getPrevPlayerId(roomInfo, farmerId) === landlordId) return 'downstream';
  if (getNextPlayerId(roomInfo, farmerId) === landlordId) return 'upstream';
  return 'other';
}

function sortBySmallest(candidates: number[][]): number[][] {
  return candidates.slice().sort((a, b) => {
    const typeDiff = getPlayTypePriority(a) - getPlayTypePriority(b);
    if (typeDiff !== 0) return typeDiff;
    const lengthDiff = a.length - b.length;
    if (lengthDiff !== 0) return lengthDiff;
    return playMinPower(a) - playMinPower(b);
  });
}

function sortByLargest(candidates: number[][]): number[][] {
  return candidates.slice().sort((a, b) => {
    const typeDiff = getPlayTypePriority(b) - getPlayTypePriority(a);
    if (typeDiff !== 0) return typeDiff;
    const lengthDiff = b.length - a.length;
    if (lengthDiff !== 0) return lengthDiff;
    return playMaxPower(b) - playMaxPower(a);
  });
}

function sortSameTypeBySmallest(candidates: number[][]): number[][] {
  return candidates.slice().sort((a, b) => {
    const bombDiff = Number(isBombPlay(a)) - Number(isBombPlay(b));
    if (bombDiff !== 0) return bombDiff;
    return playMinPower(a) - playMinPower(b);
  });
}

function filterRankRange(candidates: number[][], minPower: number, maxPower: number): number[][] {
  return candidates.filter(cards => {
    const power = playMinPower(cards);
    return power >= minPower && power <= maxPower;
  });
}

function countConsecutive(values: number[]): number {
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

function isRankInStraight(value: number, values: number[], minLength: number): boolean {
  if (value === 2 || value === 53 || value === 54) return false;
  const uniqueValues = Array.from(new Set(values.filter(item => item !== 2 && item !== 53 && item !== 54)))
    .sort((a, b) => DoudizhuCardSize[a] - DoudizhuCardSize[b]);
  let run: number[] = [];
  for (const item of uniqueValues) {
    const last = run[run.length - 1];
    if (!last || DoudizhuCardSize[item] === DoudizhuCardSize[last] + 1) {
      run.push(item);
    } else {
      run = [item];
    }
    if (run.length >= minLength && run.indexOf(value) >= 0) return true;
  }
  return false;
}

function isSingleBreakingCombination(handCards: number[], playCards: number[]): boolean {
  if (!playCards || playCards.length !== 1 || handCards.length <= 1) return false;
  const value = cardRank(playCards[0]);
  const values = (getPoint(handCards) || []).map(card => card.value);
  const sameRankCount = values.filter(item => item === value).length;
  if (sameRankCount >= 2) return true;
  if ((value === 53 && values.indexOf(54) >= 0) || (value === 54 && values.indexOf(53) >= 0)) return true;
  return isRankInStraight(value, values, 5);
}

function buildHandProfile(cards: number[]): DoudizhuHandProfile {
  const points = getPoint(cards) || [];
  const valueCount = new Map<number, number>();
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
  if (hasKingBoom) strength += 32;
  else {
    if (hasSmallKing) strength += 10;
    if (hasBigKing) strength += 12;
  }
  strength += bombCount * 28;
  strength += twoCount * 10;
  strength += aceCount * 5;
  strength += tripleCount * 6;
  strength += pairCount * 2;
  if (longestStraight >= 5) strength += longestStraight * 3;
  if (longestDoubleStraight >= 3) strength += longestDoubleStraight * 5;
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

function isWholeHandPlay(handCards: number[], playCards: number[]): boolean {
  return playCards.length > 0 && playCards.length === handCards.length;
}

function getTeammateId(roomInfo: any, userId: string): string {
  if (roomInfo?.landlord_id === userId) return '';
  return ((roomInfo?.roomUserIdList || []) as string[]).find(id => id && id !== userId && id !== roomInfo?.landlord_id) || '';
}

function getOpponentIds(roomInfo: any, userId: string): string[] {
  const landlordId = roomInfo?.landlord_id || '';
  const ids = ((roomInfo?.roomUserIdList || []) as string[]).filter(id => !!id && id !== userId);
  if (userId === landlordId) return ids;
  return landlordId ? [landlordId] : [];
}

function getRecentActivePlayer(roomInfo: any, userId: string): string {
  const records = (roomInfo?.play_card_record || []) as any[];
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (record?.userId !== userId && record?.playCard?.length > 0) return record.userId;
  }
  return '';
}

function countConsecutivePlays(roomInfo: any, userId: string): number {
  const records = (roomInfo?.play_card_record || []) as any[];
  let count = 0;
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i];
    if (!record?.playCard || record.playCard.length <= 0) continue;
    if (record.userId !== userId) break;
    count += 1;
  }
  return count;
}

abstract class BaseDoudizhuAiStrategy implements DoudizhuAiStrategy {
  public abstract readonly level: RobotLevel;

  public shouldSelectLandlord(cards: number[]): boolean {
    const profile = buildHandProfile(cards);
    if (profile.bombCount > 0) return true;
    if (profile.hasKingBoom && profile.twoCount >= 2) return true;
    if (profile.twoCount >= 3 && (profile.aceCount >= 1 || profile.tripleCount >= 1 || profile.longestStraight >= 6)) return true;
    return profile.strength >= 45;
  }

  public abstract choosePlayCards(context: RobotPlayDecisionContext): number[];

  protected isTeammate(roomInfo: any, userId: string, targetUserId: string): boolean {
    if (!userId || !targetUserId || userId === targetUserId) return false;
    return roomInfo.landlord_id !== userId && roomInfo.landlord_id !== targetUserId;
  }

  protected canPlayOut(handCards: number[], playCards: number[]): boolean {
    return isWholeHandPlay(handCards, playCards);
  }

  protected getCandidates(context: RobotPlayDecisionContext): number[][] {
    const candidates = cardHint.cardHint(context.isFreePlay ? [] : (context.lastRecord?.playCard || []), context.handCards) || [];
    const protectedCandidates = candidates.filter(cards => !isSingleBreakingCombination(context.handCards, cards));
    return protectedCandidates.length > 0 ? protectedCandidates : candidates;
  }

  protected getWeakestPlay(candidates: number[][], avoidSingle: boolean = false): number[] {
    const plays = candidates.filter(cards => isPlainPlay(cards) && (!avoidSingle || cardTypeName(cards) !== CardTypeValue.One.name));
    return (plays.length > 0 ? sortBySmallest(plays) : sortBySmallest(candidates))[0] || [];
  }

  protected getSmallestSameType(candidates: number[][], typeName: string, avoidBomb: boolean = true): number[] {
    const plays = candidates.filter(cards => cardTypeName(cards) === typeName && (!avoidBomb || !isBombPlay(cards)));
    return sortSameTypeBySmallest(plays)[0] || [];
  }

  protected getLargestSameType(candidates: number[][], typeName: string): number[] {
    const plays = candidates.filter(cards => cardTypeName(cards) === typeName && !isBombPlay(cards));
    return sortByLargest(plays)[0] || [];
  }

  protected getBombWhenAllowed(context: RobotPlayDecisionContext, candidates: number[][], dangerOnly: boolean): number[] {
    const { roomInfo, userId, handCards } = context;
    const opponents = getOpponentIds(roomInfo, userId);
    const opponentMayWin = opponents.some(id => getPlayerRemain(roomInfo, id) <= 2 && getPlayerRemain(roomInfo, id) > 0);
    const canWin = candidates.some(cards => isWholeHandPlay(handCards, cards));
    if (dangerOnly && !opponentMayWin && !canWin) return [];
    return sortSameTypeBySmallest(candidates.filter(isBombPlay))[0] || [];
  }
}

export class SimpleDoudizhuAiStrategy extends BaseDoudizhuAiStrategy {
  public readonly level: RobotLevel = RobotLevel.Simple;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const landlordId = roomInfo?.landlord_id || '';
    const isLandlord = userId === landlordId;
    const candidates = this.getCandidates(context);
    if (candidates.length <= 0) return [];

    const wholeHand = candidates.find(cards => isWholeHandPlay(handCards, cards));
    if (isLandlord && wholeHand) return wholeHand;

    if (isFreePlay) {
      const avoidSingle = !isLandlord && getPlayerRemain(roomInfo, landlordId) === 1;
      return this.getWeakestPlay(candidates, avoidSingle);
    }

    const targetCards = lastRecord?.playCard || [];
    const targetTypeName = cardTypeName(targetCards);
    const targetUserId = lastRecord?.userId || '';
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

  private chooseSimpleFarmerFollowLandlord(context: RobotPlayDecisionContext, candidates: number[][], targetTypeName: string): number[] {
    const landlordRemain = getPlayerRemain(context.roomInfo, context.roomInfo?.landlord_id || '');
    const relation = getFarmerSeatRelation(context.roomInfo, context.userId);

    if (landlordRemain === 1 && targetTypeName === CardTypeValue.One.name) return [];

    if (targetTypeName === CardTypeValue.One.name) {
      const singles = candidates.filter(cards => cardTypeName(cards) === CardTypeValue.One.name);
      if (relation === 'downstream') return sortByLargest(filterRankRange(singles, 8, 13))[0] || [];
      if (relation === 'upstream') return sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0] || [];
    }

    if (targetTypeName === CardTypeValue.Double.name) {
      const pairs = candidates.filter(cards => cardTypeName(cards) === CardTypeValue.Double.name);
      if (landlordRemain === 2) return sortSameTypeBySmallest(pairs)[0] || [];
      if (relation === 'downstream') return sortByLargest(filterRankRange(pairs, 8, 13))[0] || [];
      if (relation === 'upstream') return sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0] || [];
    }

    if ([CardTypeValue.Three.name, CardTypeValue.Scroll.name, CardTypeValue.DoubleScroll.name, CardTypeValue.Plane.name].indexOf(targetTypeName as any) >= 0) {
      return this.getSmallestSameType(candidates, targetTypeName);
    }

    return this.getBombWhenAllowed(context, candidates, true);
  }

  private chooseSimpleFarmerFollowTeammate(context: RobotPlayDecisionContext, candidates: number[][], targetTypeName: string): number[] {
    if (this.canPlayOut(context.handCards, candidates[0] || [])) return candidates[0];
    const relation = getFarmerSeatRelation(context.roomInfo, context.userId);
    if (targetTypeName === CardTypeValue.One.name) {
      return relation === 'upstream'
        ? this.getLargestSameType(candidates, CardTypeValue.One.name)
        : this.getSmallestSameType(candidates, CardTypeValue.One.name);
    }
    if (targetTypeName === CardTypeValue.Double.name) {
      return relation === 'upstream'
        ? this.getLargestSameType(candidates, CardTypeValue.Double.name)
        : this.getSmallestSameType(candidates, CardTypeValue.Double.name);
    }
    return [];
  }

  private chooseSimpleLandlordFollow(context: RobotPlayDecisionContext, candidates: number[][], targetTypeName: string, targetUserId: string): number[] {
    const relation = getFarmerSeatRelation(context.roomInfo, targetUserId);
    const targetMaxPower = playMaxPower(context.lastRecord?.playCard || []);

    if (targetTypeName === CardTypeValue.One.name) {
      const singles = candidates.filter(cards => cardTypeName(cards) === CardTypeValue.One.name);
      if (relation === 'downstream') {
        return sortSameTypeBySmallest(filterRankRange(singles, 8, 13))[0]
          || sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0]
          || [];
      }
      if (targetMaxPower <= rankPower(10)) return [];
      return sortSameTypeBySmallest(filterRankRange(singles, 14, 15))[0] || [];
    }

    if (targetTypeName === CardTypeValue.Double.name) {
      const pairs = candidates.filter(cards => cardTypeName(cards) === CardTypeValue.Double.name);
      if (relation === 'downstream') {
        return sortSameTypeBySmallest(filterRankRange(pairs, 8, 13))[0]
          || sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0]
          || [];
      }
      if (targetMaxPower <= rankPower(10)) return [];
      return sortSameTypeBySmallest(filterRankRange(pairs, 14, 15))[0] || [];
    }

    if ([CardTypeValue.Scroll.name, CardTypeValue.DoubleScroll.name, CardTypeValue.Plane.name].indexOf(targetTypeName as any) >= 0) {
      return this.getSmallestSameType(candidates, targetTypeName);
    }

    return this.getBombWhenAllowed(context, candidates, true);
  }
}

export class MediumDoudizhuAiStrategy extends SimpleDoudizhuAiStrategy {
  public readonly level: RobotLevel = RobotLevel.Medium;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const candidates = this.getCandidates(context);
    if (candidates.length <= 0) return [];

    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const isLandlord = roomInfo?.landlord_id === userId;
    const myProfile = buildHandProfile(handCards);
    const teammateId = getTeammateId(roomInfo, userId);
    const teammateProfile = teammateId ? buildHandProfile(roomInfo?.roomUsers?.[teammateId]?.user_card || []) : null;
    const opponents = getOpponentIds(roomInfo, userId);
    const hasDangerOpponent = opponents.some(id => getPlayerRemain(roomInfo, id) <= 3 && getPlayerRemain(roomInfo, id) > 0);
    const isMainAttacker = isLandlord || !teammateProfile || myProfile.strength + myProfile.neatness >= teammateProfile.strength + teammateProfile.neatness;

    const wholeHand = candidates.find(cards => isWholeHandPlay(handCards, cards));
    if (wholeHand) return wholeHand;

    if (isFreePlay) {
      if (isLandlord) return this.choosePlannedFreePlay(candidates, myProfile, hasDangerOpponent);
      if (!isMainAttacker && teammateId) return this.chooseSupportFreePlay(context, candidates, teammateId);
      return this.choosePlannedFreePlay(candidates, myProfile, hasDangerOpponent);
    }

    const targetUserId = lastRecord?.userId || '';
    const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
    const targetIsLandlord = targetUserId === roomInfo?.landlord_id;
    const targetTypeName = cardTypeName(lastRecord?.playCard || []);

    if (!isLandlord && targetIsTeammate) {
      const playOut = candidates.filter(cards => isWholeHandPlay(handCards, cards));
      if (playOut.length > 0) return sortByLargest(playOut)[0];
      return [];
    }

    if (!isLandlord && targetIsLandlord) {
      if (getPlayerRemain(roomInfo, roomInfo?.landlord_id || '') === 1 && targetTypeName === CardTypeValue.One.name) return [];
      const plain = candidates.filter(isPlainPlay);
      if (hasDangerOpponent) return sortBySmallest(candidates)[0] || [];
      return sortSameTypeBySmallest(plain.filter(cards => cardTypeName(cards) === targetTypeName))[0]
        || this.getBombWhenAllowed(context, candidates, true);
    }

    if (isLandlord) {
      const targetRemain = getPlayerRemain(roomInfo, targetUserId);
      const relation = getFarmerSeatRelation(roomInfo, targetUserId);
      const shouldPress = targetRemain <= 5 || relation === 'downstream' || countConsecutivePlays(roomInfo, targetUserId) >= 2;
      if (!shouldPress && playMaxPower(lastRecord?.playCard || []) <= rankPower(10)) return [];
      return sortSameTypeBySmallest(candidates.filter(isPlainPlay).filter(cards => cardTypeName(cards) === targetTypeName))[0]
        || this.getBombWhenAllowed(context, candidates, targetRemain <= 1);
    }

    return super.choosePlayCards(context);
  }

  private choosePlannedFreePlay(candidates: number[][], profile: DoudizhuHandProfile, hasDangerOpponent: boolean): number[] {
    const plain = candidates.filter(isPlainPlay);
    if (hasDangerOpponent) return sortByLargest(plain.length > 0 ? plain : candidates)[0] || [];
    const weakTypes = profile.lowSingleCount >= 2
      ? [CardTypeValue.One.name, CardTypeValue.Double.name, CardTypeValue.Three.name, CardTypeValue.Scroll.name]
      : [CardTypeValue.Scroll.name, CardTypeValue.DoubleScroll.name, CardTypeValue.Three.name, CardTypeValue.One.name, CardTypeValue.Double.name];
    for (const typeName of weakTypes) {
      const play = this.getSmallestSameType(plain, typeName);
      if (play.length > 0) return play;
    }
    return this.getWeakestPlay(candidates);
  }

  private chooseSupportFreePlay(context: RobotPlayDecisionContext, candidates: number[][], teammateId: string): number[] {
    const teammateRemain = getPlayerRemain(context.roomInfo, teammateId);
    if (teammateRemain === 1) return this.getSmallestSameType(candidates, CardTypeValue.One.name);
    if (teammateRemain === 2) return this.getSmallestSameType(candidates, CardTypeValue.Double.name);
    return this.getWeakestPlay(candidates, getPlayerRemain(context.roomInfo, context.roomInfo?.landlord_id || '') === 1);
  }
}

export class HellDoudizhuAiStrategy extends MediumDoudizhuAiStrategy {
  public readonly level: RobotLevel = RobotLevel.Hell;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const candidates = this.getCandidates(context);
    if (candidates.length <= 0) return [];

    const legal = candidates.filter(cards => this.isLegalHellCandidate(context, cards));
    if (legal.length <= 0) return [];

    const scored = legal.map(cards => ({
      cards,
      score: this.scoreHellCandidate(context, cards),
    })).sort((a, b) => b.score - a.score);

    return scored[0]?.cards || [];
  }

  private isLegalHellCandidate(context: RobotPlayDecisionContext, cards: number[]): boolean {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const isLandlord = roomInfo?.landlord_id === userId;
    const targetUserId = lastRecord?.userId || '';
    const targetIsTeammate = !isFreePlay && this.isTeammate(roomInfo, userId, targetUserId);
    const landlordRemain = getPlayerRemain(roomInfo, roomInfo?.landlord_id || '');

    if (isWholeHandPlay(handCards, cards)) return true;
    if (!isLandlord && cardTypeName(cards) === CardTypeValue.One.name && landlordRemain === 1) return false;
    if (targetIsTeammate) return false;

    if (isBombPlay(cards)) {
      const opponentDanger = getOpponentIds(roomInfo, userId).some(id => getPlayerRemain(roomInfo, id) <= 2 && getPlayerRemain(roomInfo, id) > 0);
      return opponentDanger || handCards.length - cards.length <= 3;
    }

    return true;
  }

  private scoreHellCandidate(context: RobotPlayDecisionContext, cards: number[]): number {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const isLandlord = roomInfo?.landlord_id === userId;
    const targetUserId = lastRecord?.userId || '';
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
    } else {
      score += this.scoreHellFollowPlay(typeName, cards, context, targetUserId, opponentMinRemain);
    }

    if (isLandlord) {
      if (opponentMinRemain <= 2) score += 80;
      if (countConsecutivePlays(roomInfo, getRecentActivePlayer(roomInfo, userId)) >= 2) score += 35;
      if (typeName === CardTypeValue.One.name && opponents.some(id => getPlayerRemain(roomInfo, id) === 1)) score -= 90;
    } else {
      const landlordRemain = getPlayerRemain(roomInfo, roomInfo?.landlord_id || '');
      if (landlordRemain <= 2) score += 85;
      if (teammateRemain === 1 && typeName === CardTypeValue.One.name) score -= 160;
      if (teammateRemain === 2 && typeName === CardTypeValue.Double.name) score += 55;
    }

    if (isBombPlay(cards)) {
      score += opponentMinRemain <= 2 || remaining.length <= 3 ? 120 : -180;
    }

    return score;
  }

  private scoreHellFreePlay(typeName: string, cards: number[], isLandlord: boolean, profile: DoudizhuHandProfile, teammateRemain: number, opponentMinRemain: number): number {
    let score = 0;
    if (isLandlord) {
      if (profile.lowSingleCount > 0 && typeName === CardTypeValue.One.name) score += 70;
      if (profile.pairCount >= 3 && typeName === CardTypeValue.Double.name) score += 45;
      if (typeName === CardTypeValue.Scroll.name || typeName === CardTypeValue.DoubleScroll.name) score += cards.length * 5;
      if (opponentMinRemain <= 3) score += cards.length * 8;
    } else {
      if (teammateRemain === 1 && typeName !== CardTypeValue.One.name) score += 70;
      if (teammateRemain === 2 && typeName === CardTypeValue.Double.name) score += 80;
      if (typeName === CardTypeValue.Scroll.name || typeName === CardTypeValue.DoubleScroll.name) score += 30;
    }
    score -= getPlayTypePriority(cards) * 2;
    return score;
  }

  private scoreHellFollowPlay(typeName: string, cards: number[], context: RobotPlayDecisionContext, targetUserId: string, opponentMinRemain: number): number {
    const { roomInfo, userId, lastRecord } = context;
    const isLandlord = roomInfo?.landlord_id === userId;
    const targetRemain = getPlayerRemain(roomInfo, targetUserId);
    const targetTypeName = cardTypeName(lastRecord?.playCard || []);
    let score = 0;

    if (typeName === targetTypeName) score += 70;
    if (targetRemain <= 3) score += 100 - targetRemain * 18;
    if (opponentMinRemain <= 2) score += 75;
    if (isLandlord) {
      const relation = getFarmerSeatRelation(roomInfo, targetUserId);
      if (relation === 'downstream') score += 55;
      if (relation === 'upstream' && playMaxPower(lastRecord?.playCard || []) <= rankPower(10)) score -= 85;
    } else {
      if (targetUserId === roomInfo?.landlord_id) score += 65;
      if (getFarmerSeatRelation(roomInfo, userId) === 'upstream') score += 20;
    }
    score -= playMaxPower(cards);
    return score;
  }
}

const simpleDoudizhuAi = new SimpleDoudizhuAiStrategy();
const mediumDoudizhuAi = new MediumDoudizhuAiStrategy();
const hellDoudizhuAi = new HellDoudizhuAiStrategy();

export function getDoudizhuAiStrategy(level: any): DoudizhuAiStrategy {
  switch (normalizeRobotLevel(level)) {
    case RobotLevel.Medium:
      return mediumDoudizhuAi;
    case RobotLevel.Hell:
      return hellDoudizhuAi;
    case RobotLevel.Simple:
    default:
      return simpleDoudizhuAi;
  }
}
