import { ShuangjianMode, toRealCard } from '../gameMode/shuangjian/ShuangjianMode';
import { SjCardType } from '../gameMode/shuangjian/ShuangjianCardLogic';
import { RobotLevel, RobotPlayDecisionContext, ShuangjianAiStrategy, normalizeRobotLevel } from './types';

function rankValue(card: number): number {
  const real = toRealCard(card);
  if (real === 53 || real === 54) return real;
  return (real - 1) % 13 + 1;
}

function rankPower(rank: number): number {
  if (rank === 1) return 14;
  if (rank === 2) return 15;
  if (rank === 53) return 16;
  if (rank === 54) return 17;
  return rank;
}

function groupCardsByRank(cards: number[]): { [rank: number]: number[] } {
  const grouped: { [rank: number]: number[] } = {};
  for (const card of cards || []) {
    const rank = rankValue(card);
    if (!grouped[rank]) grouped[rank] = [];
    grouped[rank].push(card);
  }
  Object.keys(grouped).map(Number).forEach(rank => {
    grouped[rank].sort((a: number, b: number) => toRealCard(a) - toRealCard(b));
  });
  return grouped;
}

function getSmallestCardsExcept(cards: number[], excluded: number[], count: number): number[] {
  const remains = cards
    .filter(card => excluded.indexOf(card) < 0)
    .slice()
    .sort((a, b) => rankPower(rankValue(a)) - rankPower(rankValue(b)) || toRealCard(a) - toRealCard(b));
  return remains.slice(0, count);
}

function collectStraightCandidates(grouped: { [rank: number]: number[] }, minGroups: number, cardsPerRank: number): number[][] {
  const orderedRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
  const candidates: number[][] = [];
  for (let start = 0; start < orderedRanks.length; start++) {
    const run: number[] = [];
    for (let i = start; i < orderedRanks.length; i++) {
      const rank = orderedRanks[i];
      if (!grouped[rank] || grouped[rank].length < cardsPerRank) break;
      run.push(rank);
      if (run.length >= minGroups) {
        candidates.push(run.flatMap(itemRank => grouped[itemRank].slice(0, cardsPerRank)));
      }
    }
  }
  return candidates;
}

function isPowerPlay(playType: any): boolean {
  const type = playType?.extra?.type;
  return type === SjCardType.FIVE_TEN_K || type === SjCardType.BOMB || type === SjCardType.KING_BOMB;
}

function getAiPlayWeight(playType: any): number {
  const extra = playType?.extra || {};
  const type = extra.type;
  if (type === SjCardType.FIVE_TEN_K) {
    const count = extra.fiveTenKCount || 1;
    if (count >= 4) return 120;
    if (count === 3) return 80;
    return extra.fiveTenKSuited ? 20 : 10;
  }
  if (type === SjCardType.BOMB) {
    return 30 + Math.max(0, (extra.headCount || 4) - 4) * 20;
  }
  if (type === SjCardType.KING_BOMB) {
    return extra.kingCount >= 4 ? 110 : (extra.kingCount === 3 ? 70 : 40);
  }
  return 1;
}

function isPlayOut(handCards: number[], playCards: number[]): boolean {
  return playCards.length > 0 && playCards.length === handCards.length;
}

function getAliveUserIds(roomInfo: any): string[] {
  const roomUsers = roomInfo.roomUsers || {};
  return ((roomInfo.roomUserIdList || []) as string[])
    .filter(id => !!id && Array.isArray(roomUsers[id]?.user_card) && roomUsers[id].user_card.length > 0);
}

function getSeatRelation(roomInfo: any, userId: string, targetUserId: string): 'downstream' | 'upstream' | 'opposite' | 'unknown' {
  const ring = ((roomInfo.roomUserIdList || []) as string[]).filter(id => !!id);
  const userIndex = ring.indexOf(userId);
  const targetIndex = ring.indexOf(targetUserId);
  if (userIndex < 0 || targetIndex < 0 || ring.length <= 0) return 'unknown';
  if (userIndex === (targetIndex - 1 + ring.length) % ring.length) return 'downstream';
  if (userIndex === (targetIndex + 1) % ring.length) return 'upstream';
  return 'opposite';
}

function getRankRangeCandidates(
  cards: number[][],
  minRank: number,
  maxRank: number,
  impl: ShuangjianMode,
  targetType: any,
): number[][] {
  return cards.filter(playCards => {
    const playType = impl.judgeCardType(playCards);
    const mainRank = playType?.extra?.mainRank || playType?.weight || 0;
    return mainRank >= minRank && mainRank <= maxRank && impl.compareCards(targetType, playType) > 0;
  });
}

function sortSinglesByPower(cards: number[][], desc: boolean = false): number[][] {
  return cards.sort((a, b) => {
    const diff = rankPower(rankValue(a[0])) - rankPower(rankValue(b[0]));
    return desc ? -diff : diff;
  });
}

function sortPairsByPower(cards: number[][], desc: boolean = false): number[][] {
  return cards.sort((a, b) => {
    const diff = rankPower(rankValue(a[0])) - rankPower(rankValue(b[0]));
    return desc ? -diff : diff;
  });
}

function getPlainTypePriority(playType: any): number {
  switch (playType?.extra?.type) {
    case SjCardType.SINGLE:
      return 1;
    case SjCardType.PAIR:
      return 2;
    case SjCardType.THREE_WITH_TWO:
      return 3;
    case SjCardType.STRAIGHT:
      return 4;
    case SjCardType.DOUBLE_STRAIGHT:
      return 5;
    case SjCardType.PLANE:
      return 6;
    default:
      return 99;
  }
}

function sortBySmallestLegalPlay(cards: number[][], impl: ShuangjianMode): number[][] {
  return cards.sort((a, b) => {
    const typeA = impl.judgeCardType(a);
    const typeB = impl.judgeCardType(b);
    const priorityA = getPlainTypePriority(typeA);
    const priorityB = getPlainTypePriority(typeB);
    if (priorityA !== priorityB) return priorityA - priorityB;
    if (a.length !== b.length) return a.length - b.length;
    return (typeA.weight || 0) - (typeB.weight || 0);
  });
}

interface ShuangjianHandProfile {
  strength: number;
  powerCount: number;
  bigCardCount: number;
  validWholeHand: boolean;
}

function getRemainCount(roomInfo: any, userId: string): number {
  return ((roomInfo.roomUsers?.[userId]?.user_card || []) as number[]).length;
}

function buildHandProfile(cards: number[], impl: ShuangjianMode): ShuangjianHandProfile {
  const grouped = groupCardsByRank(cards);
  const kings = ([] as number[]).concat(grouped[53] || [], grouped[54] || []);
  let powerCount = kings.length >= 2 ? 1 : 0;
  let bigCardCount = 0;
  let pairCount = 0;
  let tripleCount = 0;

  for (const rank of Object.keys(grouped).map(Number)) {
    const count = grouped[rank].length;
    if (rankPower(rank) >= 14) bigCardCount += count;
    if (rank !== 53 && rank !== 54 && count >= 2) pairCount += 1;
    if (rank !== 53 && rank !== 54 && count >= 3) tripleCount += 1;
    if (rank !== 53 && rank !== 54 && count >= 4) powerCount += 1;
  }

  const validWholeHand = cards.length > 0 && impl.judgeCardType(cards).valid;
  const strength = powerCount * 18 + bigCardCount * 4 + tripleCount * 5 + pairCount * 2
    + (validWholeHand ? 16 : 0) - cards.length * 0.4;
  return { strength, powerCount, bigCardCount, validWholeHand };
}

function isShortHand(count: number, limit: number): boolean {
  return count > 0 && count < limit;
}

function getRecentPlayedType(roomInfo: any, userId: string, impl: ShuangjianMode): SjCardType | null {
  const records = ((roomInfo.play_card_record || []) as any[]).slice().reverse();
  for (const record of records) {
    if (record?.userId !== userId || !Array.isArray(record.playCard) || record.playCard.length <= 0) continue;
    const playType = impl.judgeCardType(record.playCard);
    if (playType.valid && !isPowerPlay(playType)) return playType.extra?.type || null;
  }
  return null;
}

function filterBySjType(candidates: number[][], impl: ShuangjianMode, type: SjCardType): number[][] {
  return candidates.filter(cards => impl.judgeCardType(cards).extra?.type === type);
}

function sortByRunnerValue(cards: number[][], impl: ShuangjianMode): number[][] {
  return cards.sort((a, b) => {
    const typeA = impl.judgeCardType(a);
    const typeB = impl.judgeCardType(b);
    const powerDiff = Number(isPowerPlay(typeA)) - Number(isPowerPlay(typeB));
    if (powerDiff !== 0) return powerDiff;
    if (a.length !== b.length) return b.length - a.length;
    const weightDiff = getAiPlayWeight(typeA) - getAiPlayWeight(typeB);
    if (weightDiff !== 0) return weightDiff;
    return (typeA.weight || 0) - (typeB.weight || 0);
  });
}

function canUsePowerPlay(playType: any, handCards: number[], playCards: number[], targetType: any, opponentDanger: boolean): boolean {
  if (!isPowerPlay(playType)) return true;
  if (isPlayOut(handCards, playCards)) return true;
  if (isPowerPlay(targetType)) return true;
  if (!opponentDanger) return false;
  const extra = playType?.extra || {};
  if (extra.type === SjCardType.BOMB) return (extra.headCount || 4) <= 5;
  return false;
}

function collectFiveTenKCandidates(grouped: { [rank: number]: number[] }): number[][] {
  const fives = (grouped[5] || []).slice();
  const tens = (grouped[10] || []).slice();
  const kings = (grouped[13] || []).slice();
  const count = Math.min(fives.length, tens.length, kings.length);
  const candidates: number[][] = [];
  for (let i = 1; i <= count; i++) {
    if (i === 2) continue;
    candidates.push(fives.slice(0, i).concat(tens.slice(0, i), kings.slice(0, i)));
  }
  return candidates;
}

function isRankInShuangjianStraight(rank: number, grouped: { [rank: number]: number[] }, minGroups: number, cardsPerRank: number): boolean {
  if (rank === 2 || rank === 53 || rank === 54) return false;
  const orderedRanks = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
  let run: number[] = [];
  for (const itemRank of orderedRanks) {
    if (grouped[itemRank] && grouped[itemRank].length >= cardsPerRank) {
      run.push(itemRank);
    } else {
      run = [];
    }
    if (run.length >= minGroups && run.indexOf(rank) >= 0) return true;
  }
  return false;
}

function isSingleBreakingShuangjianCombination(handCards: number[], playCards: number[]): boolean {
  if (!playCards || playCards.length !== 1 || handCards.length <= 1) return false;
  const grouped = groupCardsByRank(handCards);
  const rank = rankValue(playCards[0]);
  if ((grouped[rank] || []).length >= 2) return true;
  const kings = ([] as number[]).concat(grouped[53] || [], grouped[54] || []);
  if ((rank === 53 || rank === 54) && kings.length >= 2) return true;
  if ((rank === 5 || rank === 10 || rank === 13) && (grouped[5] || []).length > 0 && (grouped[10] || []).length > 0 && (grouped[13] || []).length > 0) return true;
  return isRankInShuangjianStraight(rank, grouped, 7, 1) || isRankInShuangjianStraight(rank, grouped, 3, 2);
}

function getTeamIds(roomInfo: any, userId: string): string[] {
  const landlordCamp = (roomInfo.landlord_camp || []) as string[];
  const farmerCamp = (roomInfo.farmer_camp || []) as string[];
  if (landlordCamp.indexOf(userId) >= 0) return landlordCamp;
  if (farmerCamp.indexOf(userId) >= 0) return farmerCamp;
  return [userId];
}

function getOpposingIds(roomInfo: any, userId: string): string[] {
  const teamIds = getTeamIds(roomInfo, userId);
  return getAliveUserIds(roomInfo).filter(id => teamIds.indexOf(id) < 0);
}

function getCardsOfUser(roomInfo: any, userId: string): number[] {
  return ((roomInfo.roomUsers?.[userId]?.user_card || []) as number[]).slice();
}

function getTeamCards(roomInfo: any, userIds: string[]): number[] {
  return userIds.flatMap(id => getCardsOfUser(roomInfo, id));
}

function countPowerCandidates(cards: number[], impl: ShuangjianMode): number {
  const grouped = groupCardsByRank(cards);
  let count = 0;
  for (const rank of Object.keys(grouped).map(Number)) {
    if (rank !== 53 && rank !== 54 && grouped[rank].length >= 4) {
      count += grouped[rank].length - 3;
    }
  }
  const kings = ([] as number[]).concat(grouped[53] || [], grouped[54] || []);
  if (kings.length >= 2) count += Math.min(kings.length, 4) - 1;
  count += collectFiveTenKCandidates(grouped).filter(cardsGroup => isPowerPlay(impl.judgeCardType(cardsGroup))).length;
  return count;
}

function getSignalTypeBonus(playType: any, teammateRecentType: SjCardType | null): number {
  if (!teammateRecentType || playType?.extra?.type !== teammateRecentType) return 0;
  return 22;
}

function getCardPressureValue(playType: any): number {
  const type = playType?.extra?.type;
  if (type === SjCardType.SINGLE) return 2;
  if (type === SjCardType.PAIR) return 4;
  if (type === SjCardType.THREE_WITH_TWO) return 9;
  if (type === SjCardType.STRAIGHT || type === SjCardType.DOUBLE_STRAIGHT) return 11;
  if (type === SjCardType.PLANE) return 16;
  return getAiPlayWeight(playType) / 4;
}

abstract class BaseShuangjianAiStrategy implements ShuangjianAiStrategy {
  public abstract readonly level: RobotLevel;

  public abstract choosePlayCards(context: RobotPlayDecisionContext): number[];

  protected getUserCamp(roomInfo: any, userId: string): string[] {
    const landlordCamp = (roomInfo.landlord_camp || []) as string[];
    const farmerCamp = (roomInfo.farmer_camp || []) as string[];
    if (landlordCamp.indexOf(userId) >= 0) return landlordCamp;
    if (farmerCamp.indexOf(userId) >= 0) return farmerCamp;
    return [];
  }

  protected isTeammate(roomInfo: any, userId: string, targetUserId: string): boolean {
    if (!userId || !targetUserId || userId === targetUserId) return false;
    return this.getUserCamp(roomInfo, userId).indexOf(targetUserId) >= 0;
  }

  protected collectCandidates(impl: ShuangjianMode, handCards: number[]): number[][] {
    const grouped = groupCardsByRank(handCards);
    const rankList = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => rankPower(a) - rankPower(b));
    const candidates: number[][] = [];

    for (const rank of rankList) {
      candidates.push([grouped[rank][0]]);
      if (rank !== 53 && rank !== 54 && grouped[rank].length >= 2) {
        candidates.push(grouped[rank].slice(0, 2));
      }
      if (rank !== 53 && rank !== 54 && grouped[rank].length >= 3) {
        const triple = grouped[rank].slice(0, 3);
        const kickers = getSmallestCardsExcept(handCards, triple, 2);
        if (kickers.length === 2) candidates.push(triple.concat(kickers));
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
      const run: number[] = [];
      for (let i = start; i < orderedTripleRanks.length; i++) {
        const rank = orderedTripleRanks[i];
        if (i > start && rankPower(rank) - rankPower(orderedTripleRanks[i - 1]) !== 1) break;
        run.push(rank);
        if (run.length >= 2) {
          const planeHeads = run.flatMap(itemRank => grouped[itemRank].slice(0, 3));
          candidates.push(planeHeads);
          const kickers = getSmallestCardsExcept(handCards, planeHeads, Math.min(run.length * 2, handCards.length - planeHeads.length));
          if (kickers.length > 0) candidates.push(planeHeads.concat(kickers));
        }
      }
    }

    const kings = ([] as number[]).concat(grouped[53] || [], grouped[54] || []);
    if (kings.length >= 2) {
      for (let kingCount = 2; kingCount <= Math.min(kings.length, 4); kingCount++) {
        candidates.push(kings.slice(0, kingCount));
      }
    }

    const unique = new Set<string>();
    const validCandidates = candidates.filter(cards => {
      const playType = impl.judgeCardType(cards);
      if (!playType.valid) return false;
      const key = cards.slice().sort((a, b) => a - b).join(',');
      if (unique.has(key)) return false;
      unique.add(key);
      return true;
    });
    const protectedCandidates = validCandidates.filter(cards => !isSingleBreakingShuangjianCombination(handCards, cards));
    return protectedCandidates.length > 0 ? protectedCandidates : validCandidates;
  }
}

export class SimpleShuangjianAiStrategy extends BaseShuangjianAiStrategy {
  public readonly level: RobotLevel = RobotLevel.Simple;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const impl = roomInfo.gameModeImpl as ShuangjianMode;
    const candidates = this.collectCandidates(impl, handCards);
    if (candidates.length <= 0) return [];

    const grouped = groupCardsByRank(handCards);
    const teammateId = this.getTeammateId(roomInfo, userId);
    const teammateRemain = teammateId ? ((roomInfo.roomUsers?.[teammateId]?.user_card || []) as number[]).length : 0;
    const opponents = this.getOpponentIds(roomInfo, userId);
    const hasOpponentOneCard = opponents.some(id => ((roomInfo.roomUsers?.[id]?.user_card || []) as number[]).length === 1);
    const opponentOnePlayAway = this.isOpponentOnePlayAway(roomInfo, userId, impl);

    if (handCards.length === 1) {
      return [[handCards[0]]].sort((a, b) => rankPower(rankValue(b[0])) - rankPower(rankValue(a[0])))[0];
    }

    if (isFreePlay) {
      const teammateFreePlay = !!lastRecord?.userId && this.isTeammate(roomInfo, userId, lastRecord.userId);
      const freeChoice = teammateFreePlay
        ? this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard)
        : this.chooseOpeningPlay(grouped, candidates, impl, teammateRemain, hasOpponentOneCard);
      return freeChoice;
    }

    const targetType = impl.judgeCardType(lastRecord?.playCard || []);
    if (!targetType.valid) return [];

    const beatCandidates = candidates.filter(cards => {
      const playType = impl.judgeCardType(cards);
      if (!playType.valid || impl.compareCards(targetType, playType) <= 0) return false;
      if (isPowerPlay(playType) && !isPlayOut(handCards, cards) && !isPowerPlay(targetType) && !opponentOnePlayAway) return false;
      return true;
    });
    if (beatCandidates.length <= 0) return [];

    const targetUserId = lastRecord?.userId || '';
    const relation = getSeatRelation(roomInfo, userId, targetUserId);
    const targetIsTeammate = this.isTeammate(roomInfo, userId, targetUserId);
    if (targetIsTeammate) {
      const playOutCandidates = beatCandidates.filter(cards => isPlayOut(handCards, cards));
      if (playOutCandidates.length <= 0) return [];
      return sortBySmallestLegalPlay(playOutCandidates, impl)[0];
    }

    const targetSjType = targetType.extra?.type;
    if (targetSjType === SjCardType.SINGLE) {
      if (teammateRemain === 1 || hasOpponentOneCard) return [];
      const beatSingles = this.onlySingles(beatCandidates, impl);
      if (relation === 'downstream') {
        const downstreamSingles = getRankRangeCandidates(beatSingles, 8, 13, impl, targetType);
        return sortSinglesByPower(downstreamSingles, true)[0] || sortSinglesByPower(beatSingles)[0] || [];
      }
      if (relation === 'upstream') {
        const upstreamSingles = getRankRangeCandidates(beatSingles, 14, 15, impl, targetType);
        return sortSinglesByPower(upstreamSingles)[0] || sortSinglesByPower(beatSingles)[0] || [];
      }
      return sortSinglesByPower(beatSingles)[0] || [];
    }

    if (targetSjType === SjCardType.PAIR) {
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
      if (getAiPlayWeight(typeA) !== getAiPlayWeight(typeB)) return getAiPlayWeight(typeA) - getAiPlayWeight(typeB);
      if ((typeA.weight || 0) !== (typeB.weight || 0)) return (typeA.weight || 0) - (typeB.weight || 0);
      return a.length - b.length;
    });
    return choices[0] || [];
  }

  protected getTeammateId(roomInfo: any, userId: string): string {
    return this.getUserCamp(roomInfo, userId).find(id => id !== userId) || '';
  }

  protected getOpponentIds(roomInfo: any, userId: string): string[] {
    const camp = this.getUserCamp(roomInfo, userId);
    const aliveUserIds = getAliveUserIds(roomInfo);
    if (camp.length <= 0) return aliveUserIds.filter(id => id !== userId);
    return aliveUserIds.filter(id => camp.indexOf(id) < 0);
  }

  protected isOpponentOnePlayAway(roomInfo: any, userId: string, impl: ShuangjianMode): boolean {
    return this.getOpponentIds(roomInfo, userId).some(id => {
      const cards = (roomInfo.roomUsers?.[id]?.user_card || []) as number[];
      return cards.length > 0 && impl.judgeCardType(cards).valid;
    });
  }

  protected onlySingles(candidates: number[][], impl: ShuangjianMode): number[][] {
    return candidates.filter(cards => impl.judgeCardType(cards).extra?.type === SjCardType.SINGLE);
  }

  protected onlyPairs(candidates: number[][], impl: ShuangjianMode): number[][] {
    return candidates.filter(cards => impl.judgeCardType(cards).extra?.type === SjCardType.PAIR);
  }

  protected chooseOpeningPlay(
    grouped: { [rank: number]: number[] },
    candidates: number[][],
    impl: ShuangjianMode,
    teammateRemain: number,
    hasOpponentOneCard: boolean,
  ): number[] {
    if (teammateRemain !== 1 && !hasOpponentOneCard) {
      const singles = this.onlySingles(candidates, impl);
      for (const rank of [3, 4, 5, 6, 7]) {
        const single = singles.find(cards => rankValue(cards[0]) === rank);
        if (single) return single;
      }
    }

    if (teammateRemain === 2 || teammateRemain !== 1) {
      const pairs = this.onlyPairs(candidates, impl);
      for (const rank of [3, 4, 5, 6, 7]) {
        const pair = pairs.find(cards => rankValue(cards[0]) === rank);
        if (pair) return pair;
      }
    }

    return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
  }

  protected chooseSmallestPlainPlay(
    candidates: number[][],
    impl: ShuangjianMode,
    teammateRemain: number,
    hasOpponentOneCard: boolean,
  ): number[] {
    const choices = candidates.filter(cards => {
      const playType = impl.judgeCardType(cards);
      if (isPowerPlay(playType)) return false;
      if (playType.extra?.type === SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard)) return false;
      return [SjCardType.SINGLE, SjCardType.PAIR, SjCardType.THREE_WITH_TWO, SjCardType.STRAIGHT].indexOf(playType.extra?.type) >= 0;
    });
    if (choices.length > 0) return sortBySmallestLegalPlay(choices, impl)[0];

    const nonPower = candidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
    if (nonPower.length > 0) return sortBySmallestLegalPlay(nonPower, impl)[0];
    return [];
  }
}

export class MediumShuangjianAiStrategy extends SimpleShuangjianAiStrategy {
  public readonly level = RobotLevel.Medium;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const impl = roomInfo.gameModeImpl as ShuangjianMode;
    const candidates = this.collectCandidates(impl, handCards);
    if (candidates.length <= 0) return [];

    const teammateId = this.getTeammateId(roomInfo, userId);
    const teammateCards = teammateId ? ((roomInfo.roomUsers?.[teammateId]?.user_card || []) as number[]) : [];
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
        if (feedPlay.length > 0) return feedPlay;
      }

      const preferredType = teammateId ? getRecentPlayedType(roomInfo, teammateId, impl) : null;
      if (preferredType) {
        const sameTypeCards = filterBySjType(candidates, impl, preferredType)
          .filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
        if (sameTypeCards.length > 0) return sortBySmallestLegalPlay(sameTypeCards, impl)[0];
      }

      if (isRunner) {
        const runnerPlay = this.chooseRunnerFreePlay(candidates, impl, handCards, hasDangerOpponent);
        if (runnerPlay.length > 0) return runnerPlay;
      }

      return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
    }

    const targetType = impl.judgeCardType(lastRecord?.playCard || []);
    if (!targetType.valid) return [];

    const targetUserId = lastRecord?.userId || '';
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
    if (beatCandidates.length <= 0) return [];

    if (teammateNeedsAllSupport && !targetDanger) {
      const conservative = beatCandidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards))
        && impl.judgeCardType(cards).extra?.type !== SjCardType.SINGLE);
      if (conservative.length > 0) return sortBySmallestLegalPlay(conservative, impl)[0];
    }

    const targetSjType = targetType.extra?.type;
    if (targetSjType === SjCardType.SINGLE) {
      if (teammateRemain === 1 || hasOpponentOneCard) return [];
      const singles = this.onlySingles(beatCandidates, impl);
      if (targetDanger) return sortSinglesByPower(singles)[0] || [];
      if (relation === 'downstream') {
        return sortSinglesByPower(getRankRangeCandidates(singles, 8, 13, impl, targetType), true)[0] || sortSinglesByPower(singles)[0] || [];
      }
      if (relation === 'upstream') {
        return sortSinglesByPower(getRankRangeCandidates(singles, 14, 15, impl, targetType))[0] || sortSinglesByPower(singles)[0] || [];
      }
      return sortSinglesByPower(singles)[0] || [];
    }

    if (targetSjType === SjCardType.PAIR) {
      const pairs = this.onlyPairs(beatCandidates, impl);
      if (targetDanger) return sortPairsByPower(pairs)[0] || [];
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

  private chooseFeedTeammatePlay(
    roomInfo: any,
    userId: string,
    teammateId: string,
    candidates: number[][],
    impl: ShuangjianMode,
    teammateRemain: number,
    hasOpponentOneCard: boolean,
  ): number[] {
    const preferredType = teammateId ? getRecentPlayedType(roomInfo, teammateId, impl) : null;
    if (preferredType) {
      const sameTypeCards = filterBySjType(candidates, impl, preferredType)
        .filter(cards => !isPowerPlay(impl.judgeCardType(cards)))
        .filter(cards => !(impl.judgeCardType(cards).extra?.type === SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard)));
      if (sameTypeCards.length > 0) return sortBySmallestLegalPlay(sameTypeCards, impl)[0];
    }

    if (teammateRemain === 2) {
      const pairs = this.onlyPairs(candidates, impl).filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
      if (pairs.length > 0) return sortPairsByPower(pairs)[0];
    }

    return this.chooseSmallestPlainPlay(candidates, impl, teammateRemain, hasOpponentOneCard);
  }

  private chooseRunnerFreePlay(candidates: number[][], impl: ShuangjianMode, handCards: number[], allowControlPower: boolean): number[] {
    const choices = candidates.filter(cards => {
      const playType = impl.judgeCardType(cards);
      return canUsePowerPlay(playType, handCards, cards, { extra: { type: SjCardType.INVALID } }, allowControlPower);
    });
    return choices.length > 0 ? sortByRunnerValue(choices, impl)[0] : [];
  }

  private chooseBestPressPlay(candidates: number[][], impl: ShuangjianMode, targetDanger: boolean): number[] {
    const plainCandidates = candidates.filter(cards => !isPowerPlay(impl.judgeCardType(cards)));
    const choices = plainCandidates.length > 0 || !targetDanger ? plainCandidates : candidates;
    if (choices.length <= 0) return [];
    return (targetDanger ? sortByRunnerValue(choices, impl) : sortBySmallestLegalPlay(choices, impl))[0] || [];
  }
}

interface HellDecisionContext {
  roomInfo: any;
  userId: string;
  handCards: number[];
  teammateId: string;
  teammateCards: number[];
  opponents: string[];
  isFreePlay: boolean;
  targetType: any;
  targetUserId: string;
  targetIsTeammate: boolean;
  targetDanger: boolean;
  teammateRecentType: SjCardType | null;
  myProfile: ShuangjianHandProfile;
  teammateProfile: ShuangjianHandProfile;
  teamWinRate: number;
  opponentWinRate: number;
}

export class HellShuangjianAiStrategy extends SimpleShuangjianAiStrategy {
  public readonly level: RobotLevel = RobotLevel.Hell;

  public choosePlayCards(context: RobotPlayDecisionContext): number[] {
    const { roomInfo, userId, handCards, lastRecord, isFreePlay } = context;
    const impl = roomInfo.gameModeImpl as ShuangjianMode;
    const candidates = this.collectCandidates(impl, handCards);
    if (candidates.length <= 0) return [];

    const teammateId = this.getTeammateId(roomInfo, userId);
    const teammateCards = teammateId ? getCardsOfUser(roomInfo, teammateId) : [];
    const opponents = this.getOpponentIds(roomInfo, userId);
    const targetType = isFreePlay ? null : impl.judgeCardType(lastRecord?.playCard || []);
    if (!isFreePlay && !targetType?.valid) return [];

    const targetUserId = lastRecord?.userId || '';
    const targetDanger = opponents.some(id => isShortHand(getRemainCount(roomInfo, id), 5));
    const decisionContext: HellDecisionContext = {
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
    if (legalCandidates.length <= 0) return [];

    const scored = legalCandidates.map(cards => ({
      cards,
      score: this.scoreCandidate(cards, impl, decisionContext),
    })).sort((a, b) => b.score - a.score);

    return scored[0]?.cards || [];
  }

  private isHellLegalCandidate(cards: number[], impl: ShuangjianMode, context: HellDecisionContext): boolean {
    const playType = impl.judgeCardType(cards);
    if (!playType.valid) return false;

    if (!context.isFreePlay) {
      if (impl.compareCards(context.targetType, playType) <= 0) return false;
      if (context.targetIsTeammate && !isPlayOut(context.handCards, cards)) return false;
    }

    const teammateRemain = context.teammateCards.length;
    const hasOpponentOneCard = context.opponents.some(id => getRemainCount(context.roomInfo, id) === 1);
    if (playType.extra?.type === SjCardType.SINGLE && (teammateRemain === 1 || hasOpponentOneCard) && !isPlayOut(context.handCards, cards)) {
      return false;
    }

    return canUsePowerPlay(playType, context.handCards, cards, context.targetType || { extra: { type: SjCardType.INVALID } }, context.targetDanger)
      || this.isEndgameKill(context, cards, impl);
  }

  private scoreCandidate(cards: number[], impl: ShuangjianMode, context: HellDecisionContext): number {
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

    if (isPlayOut(context.handCards, cards)) score += 260;
    if (remainingMine <= 3) score += (4 - remainingMine) * 35;
    if (remainingMine <= 15) score += this.scoreEndgameRoute(cards, impl, context);

    if (teammateRemain > 0 && teammateRemain <= 3) {
      score += this.scorePartnerFinishSupport(playType, context, cards);
    } else if (teammateRemain > 0 && teammateRemain < 8) {
      score += getSignalTypeBonus(playType, context.teammateRecentType) + 25;
    }

    if (!context.isFreePlay) {
      score += this.scorePressingValue(playType, context, cards);
    } else {
      score += this.scoreOpeningControl(playType, context, cards);
    }

    score += this.scoreBombEconomy(playType, context, cards);
    score += this.scoreOpponentThreatAfterPlay(cards, impl, context);
    return score;
  }

  private estimateDoubleRunRate(roomInfo: any, userId: string, impl: ShuangjianMode, forMyTeam: boolean): number {
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

  private scorePressingValue(playType: any, context: HellDecisionContext, cards: number[]): number {
    let score = 0;
    const targetRemain = getRemainCount(context.roomInfo, context.targetUserId);
    const relation = getSeatRelation(context.roomInfo, context.userId, context.targetUserId);
    if (context.targetDanger) score += 75;
    if (isShortHand(targetRemain, 5)) score += (5 - targetRemain) * 28;
    if (relation === 'upstream') score += 18;
    if (relation === 'downstream' && !context.targetDanger) score += 8;
    if (isPowerPlay(playType) && context.targetDanger) score += 35;
    if (playType.extra?.type === SjCardType.SINGLE && context.opponents.some(id => getRemainCount(context.roomInfo, id) === 1)) score -= 200;
    if (context.targetIsTeammate && !isPlayOut(context.handCards, cards)) score -= 500;
    return score;
  }

  private scoreOpeningControl(playType: any, context: HellDecisionContext, cards: number[]): number {
    let score = 0;
    const teammateRemain = context.teammateCards.length;
    if (teammateRemain > 0 && teammateRemain < 8) score += 36;
    if (playType.extra?.type === context.teammateRecentType) score += 24;
    if (context.myProfile.strength >= context.teammateProfile.strength) score += cards.length >= 5 ? 32 : 8;
    else score += getPlainTypePriority(playType) <= 2 ? 18 : 4;
    if (isPowerPlay(playType) && context.opponentWinRate < 0.6) score -= 70;
    return score;
  }

  private scorePartnerFinishSupport(playType: any, context: HellDecisionContext, cards: number[]): number {
    const teammateRemain = context.teammateCards.length;
    let score = 100 - teammateRemain * 15;
    if (teammateRemain === 1 && playType.extra?.type === SjCardType.SINGLE) score -= 260;
    if (teammateRemain === 2 && playType.extra?.type === SjCardType.PAIR) score += 80;
    if (playType.extra?.type === context.teammateRecentType) score += 60;
    if (isPowerPlay(playType)) score += context.targetDanger ? 45 : -40;
    return score;
  }

  private scoreBombEconomy(playType: any, context: HellDecisionContext, cards: number[]): number {
    if (!isPowerPlay(playType)) return 0;
    if (isPlayOut(context.handCards, cards)) return 180;
    const extra = playType.extra || {};
    if (extra.type === SjCardType.BOMB) {
      const headCount = extra.headCount || 4;
      if (context.targetDanger && headCount <= 5) return 55;
      if (context.targetDanger && headCount >= 6) return 15;
      return headCount >= 6 ? -90 : -45;
    }
    if (extra.type === SjCardType.KING_BOMB) return context.targetDanger ? 40 : -120;
    if (extra.type === SjCardType.FIVE_TEN_K) return context.targetDanger ? 25 : -35;
    return -20;
  }

  private scoreOpponentThreatAfterPlay(cards: number[], impl: ShuangjianMode, context: HellDecisionContext): number {
    const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
    const remainProfile = buildHandProfile(remaining, impl);
    const opponentMinRemain = Math.min(...context.opponents.map(id => getRemainCount(context.roomInfo, id)).filter(count => count > 0));
    let score = remainProfile.validWholeHand ? 70 : 0;
    score += remainProfile.powerCount * 8;
    if (opponentMinRemain <= 3) score += context.targetDanger ? 40 : -20;
    if (remaining.length <= 0) score += 300;
    return score;
  }

  private scoreEndgameRoute(cards: number[], impl: ShuangjianMode, context: HellDecisionContext): number {
    const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
    if (remaining.length === 0) return 240;
    const remainingCandidates = this.collectCandidates(impl, remaining);
    const canFinishNext = remainingCandidates.some(candidate => candidate.length === remaining.length && impl.judgeCardType(candidate).valid);
    let score = canFinishNext ? 120 : 0;
    if (context.teammateCards.length <= 3 && context.teammateCards.length > 0) score += 80;
    if (context.opponents.some(id => getRemainCount(context.roomInfo, id) <= 3 && getRemainCount(context.roomInfo, id) > 0)) score += 65;
    return score;
  }

  private isEndgameKill(context: HellDecisionContext, cards: number[], impl: ShuangjianMode): boolean {
    const teamRemain = context.handCards.length + context.teammateCards.length;
    if (teamRemain > 15) return false;
    if (isPlayOut(context.handCards, cards)) return true;
    const remaining = context.handCards.filter(card => cards.indexOf(card) < 0);
    return remaining.length <= 6 && this.collectCandidates(impl, remaining)
      .some(candidate => candidate.length === remaining.length && impl.judgeCardType(candidate).valid);
  }
}

const simpleShuangjianAi = new SimpleShuangjianAiStrategy();
const mediumShuangjianAi = new MediumShuangjianAiStrategy();
const hellShuangjianAi = new HellShuangjianAiStrategy();

export function getShuangjianAiStrategy(level: any): ShuangjianAiStrategy {
  switch (normalizeRobotLevel(level)) {
    case RobotLevel.Medium:
      return mediumShuangjianAi;
    case RobotLevel.Hell:
      return hellShuangjianAi;
    case RobotLevel.Simple:
    default:
      return simpleShuangjianAi;
  }
}
