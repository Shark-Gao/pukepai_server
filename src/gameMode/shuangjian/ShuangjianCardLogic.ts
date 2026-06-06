/**
 * ShuangjianCardLogic - Pure card-type/identification logic for the
 * "Fengcheng Twin-Sword" mode.
 *
 * This file is intentionally decoupled from the existing Doudizhu CardLogic
 * because Shuangjian uses a 108-card double deck with several rule
 * differences:
 *   - 三带二 (3+2) where the "二" can be ANY two cards (not necessarily a pair)
 *   - 飞机's last hand may have a short tail
 *   - 顺子 needs 7+ cards (not 5+)
 *   - 连对 needs 3+ groups
 *   - 510K (a 5+10+K composition); same-suit > mixed-suit
 *   - 炸弹 ≥ 4 (rather than exactly 4)
 *   - 王炸 ≥ 2 jokers; 3-king and 4-king variants
 *
 * Comparison ordering (small → big):
 *   510K-mixed < 510K-suit < 4-head < 2-king < 5-head < 6-head < 3-king
 *   < 3×510K < 7-head < 8-head < 4-king < ≥4×510K
 */
import { toRealCard } from '../../gameMode/shuangjian/ShuangjianMode';

/** Shuangjian card-type codes. */
export enum SjCardType {
    INVALID = 0,
    SINGLE = 1,           // 单张
    PAIR = 2,             // 对子
    THREE_WITH_TWO = 3,   // 三带二（飞机最后一手可不带够）
    PLANE = 4,            // 飞机（连续 ≥2 个三带二）
    STRAIGHT = 5,         // 顺子（≥7 张）
    DOUBLE_STRAIGHT = 6,  // 连对（≥3 组）
    FIVE_TEN_K = 7,       // 510K
    BOMB = 8,             // 炸弹（≥4 个相同点数）
    KING_BOMB = 9,        // 王炸（≥2 个王）
}

export interface SjJudgeResult {
    valid: boolean;
    type: SjCardType;
    /** Number of "head groups" (used for awards & comparison). */
    headCount: number;     // 4-head, 5-head ... 8-head; 0 if N/A
    /** Number of jokers, when applicable (2/3/4). */
    kingCount: number;
    /** Number of 510K combos, when applicable. */
    fiveTenKCount: number;
    /** True only for same-suit 510K. */
    fiveTenKSuited: boolean;
    /**
     * The "main" rank used to compare two same-typed plays.
     * For SINGLE/PAIR/THREE_WITH_TWO/PLANE/STRAIGHT/DOUBLE_STRAIGHT/BOMB/KING_BOMB.
     * For 510K we use 0 (only count + suited matters).
     */
    mainRank: number;
    /** Original cards (sorted desc). */
    cards: number[];
}

/** Shuangjian rank ordering, big→small (3 is smallest, joker biggest). */
const SJ_RANK_ORDER: number[] = [54, 53, 2, 1, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3];

/** Get the rank index (0=biggest, 14=smallest). 53/54 are kings. */
function rankIdx(realCard: number): number {
    if (realCard === 53 || realCard === 54) return SJ_RANK_ORDER.indexOf(realCard);
    const v = (realCard - 1) % 13 + 1;
    return SJ_RANK_ORDER.indexOf(v);
}

/** Get rank value (1..13 plus 53/54 for jokers). */
function rankValue(realCard: number): number {
    if (realCard === 53 || realCard === 54) return realCard;
    return (realCard - 1) % 13 + 1;
}

/** Suit: 0 diamond / 1 club / 2 heart / 3 spade / 4 joker. */
function suit(realCard: number): number {
    if (realCard === 53 || realCard === 54) return 4;
    return Math.ceil(realCard / 13) - 1;
}

/** Count occurrences of each rank. */
function countByRank(cards: number[]): { [k: number]: number } {
    const map: { [k: number]: number } = {};
    for (const c of cards) {
        const r = rankValue(toRealCard(c));
        map[r] = (map[r] || 0) + 1;
    }
    return map;
}

const INVALID: SjJudgeResult = {
    valid: false, type: SjCardType.INVALID,
    headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
    mainRank: 0, cards: [],
};

/**
 * Identify a single 510K combo (one 5, one 10 and one K). Returns whether the
 * combo is valid and (if so) whether it is same-suit.
 */
function detect510K(cards: number[]): { valid: boolean; suited: boolean } {
    if (cards.length !== 3) return { valid: false, suited: false };
    const ranks = cards.map(c => rankValue(toRealCard(c))).sort((a, b) => a - b);
    // 5,10,13(K)
    if (ranks[0] !== 5 || ranks[1] !== 10 || ranks[2] !== 13) return { valid: false, suited: false };
    const suits = cards.map(c => suit(toRealCard(c)));
    const suited = suits.every(s => s === suits[0]);
    return { valid: true, suited };
}

/**
 * Try to split `cards` into N non-overlapping 510K combos (multiple-510K play).
 * Returns -1 on failure, otherwise (suited count, mixed count) packed as
 * { count, allSuited }.
 */
function detectMulti510K(cards: number[]): { count: number; allSuited: boolean } | null {
    if (cards.length === 0 || cards.length % 3 !== 0) return null;
    // Count 5s, 10s, Ks; they must each equal cards.length / 3.
    const counts = countByRank(cards);
    const need = cards.length / 3;
    if (need === 2) return null;
    if ((counts[5] || 0) !== need) return null;
    if ((counts[10] || 0) !== need) return null;
    if ((counts[13] || 0) !== need) return null;
    // We do NOT enforce a perfect suit pairing; "suited" status here marks
    // whether *every* card in the play shares one suit family per combo.
    // Greedy match by suit per rank:
    const fives = cards.filter(c => rankValue(toRealCard(c)) === 5).map(c => suit(toRealCard(c)));
    const tens = cards.filter(c => rankValue(toRealCard(c)) === 10).map(c => suit(toRealCard(c)));
    const kings = cards.filter(c => rankValue(toRealCard(c)) === 13).map(c => suit(toRealCard(c)));
    let suitedAll = true;
    fives.sort(); tens.sort(); kings.sort();
    for (let i = 0; i < need; i++) {
        if (!(fives[i] === tens[i] && tens[i] === kings[i])) {
            suitedAll = false;
            break;
        }
    }
    return { count: need, allSuited: suitedAll };
}

/** Detect ≥4 same-rank cards (BOMB) or ≥2 king cards (KING_BOMB). */
function detectBombOrKingBomb(cards: number[]): SjJudgeResult | null {
    // King bomb: every card is a joker
    if (cards.length >= 2 && cards.every(c => {
        const r = rankValue(toRealCard(c));
        return r === 53 || r === 54;
    })) {
        const kingCount = cards.length;
        return {
            valid: true, type: SjCardType.KING_BOMB,
            headCount: 0, kingCount, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: 0, cards: cards.slice(),
        };
    }

    if (cards.length < 4) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map);
    if (ranks.length === 1 && map[Number(ranks[0])] >= 4) {
        const r = Number(ranks[0]);
        return {
            valid: true, type: SjCardType.BOMB,
            headCount: cards.length, // 4-head / 5-head ... 8-head
            kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: r === 1 ? 14 : (r === 2 ? 15 : r), // A>K, 2>A
            cards: cards.slice(),
        };
    }
    return null;
}

/** Detect a 顺子 (≥7 single ranks, consecutive, no 2/joker). */
function detectStraight(cards: number[]): SjJudgeResult | null {
    if (cards.length < 7) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map).map(Number);
    if (!ranks.every(r => map[r] === 1)) return null;
    if (ranks.some(r => r === 2 || r === 53 || r === 54)) return null;
    // Consecutive ascending (3..A)
    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    const sorted = ranks.slice().sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));
    for (let i = 1; i < sorted.length; i++) {
        if (orderedAsc.indexOf(sorted[i]) - orderedAsc.indexOf(sorted[i - 1]) !== 1) return null;
    }
    return {
        valid: true, type: SjCardType.STRAIGHT,
        headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
        mainRank: orderedAsc.indexOf(sorted[0]) + 3, // smallest rank as anchor
        cards: cards.slice(),
    };
}

/** Detect 连对 (≥3 consecutive pairs, no 2/joker). */
function detectDoubleStraight(cards: number[]): SjJudgeResult | null {
    if (cards.length < 6 || cards.length % 2 !== 0) return null;
    const map = countByRank(cards);
    const ranks = Object.keys(map).map(Number);
    if (!ranks.every(r => map[r] === 2)) return null;
    if (ranks.some(r => r === 2 || r === 53 || r === 54)) return null;
    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1];
    const sorted = ranks.slice().sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));
    if (sorted.length < 3) return null;
    for (let i = 1; i < sorted.length; i++) {
        if (orderedAsc.indexOf(sorted[i]) - orderedAsc.indexOf(sorted[i - 1]) !== 1) return null;
    }
    return {
        valid: true, type: SjCardType.DOUBLE_STRAIGHT,
        headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
        mainRank: orderedAsc.indexOf(sorted[0]) + 3,
        cards: cards.slice(),
    };
}

/**
 * Detect 三带二 (3+2) where the trailing "二" can be ANY two cards.
 * Detect 飞机 (≥2 connected 3-of-a-kind, with optional kickers; last hand
 * may be short — we accept 3*N + k where 0 ≤ k ≤ 2*N).
 */
function detectThreeWithTwoOrPlane(cards: number[]): SjJudgeResult | null {
    if (cards.length < 5) return null;
    const map = countByRank(cards);
    const tripleRanks = Object.keys(map).map(Number).filter(r => map[r] >= 3 && r !== 53 && r !== 54);
    if (tripleRanks.length === 0) return null;

    const orderedAsc = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2];
    tripleRanks.sort((a, b) => orderedAsc.indexOf(a) - orderedAsc.indexOf(b));

    // Try the longest run of consecutive triples first (greedy).
    let bestRun: number[] = [];
    for (let s = 0; s < tripleRanks.length; s++) {
        const run = [tripleRanks[s]];
        for (let i = s + 1; i < tripleRanks.length; i++) {
            if (orderedAsc.indexOf(tripleRanks[i]) - orderedAsc.indexOf(run[run.length - 1]) === 1
                && tripleRanks[i] !== 2) {
                run.push(tripleRanks[i]);
            } else break;
        }
        if (run.length > bestRun.length) bestRun = run;
    }

    // 三带二 (single triple + 2 trailing cards of any kind)
    if (bestRun.length === 1 && cards.length === 5) {
        return {
            valid: true, type: SjCardType.THREE_WITH_TWO,
            headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: bestRun[0] === 1 ? 14 : (bestRun[0] === 2 ? 15 : bestRun[0]),
            cards: cards.slice(),
        };
    }

    // Plane: bestRun.length ≥ 2, tail length 0..2*N is acceptable.
    if (bestRun.length >= 2) {
        const tripleSize = bestRun.length * 3;
        const tailLen = cards.length - tripleSize;
        if (tailLen >= 0 && tailLen <= 2 * bestRun.length) {
            return {
                valid: true, type: SjCardType.PLANE,
                headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
                mainRank: bestRun[0] === 1 ? 14 : (bestRun[0] === 2 ? 15 : bestRun[0]),
                cards: cards.slice(),
            };
        }
    }

    return null;
}

/**
 * Identify a play under Shuangjian rules.
 *
 * Order of detection matters: we test "rare/heavy" types first (king-bomb,
 * 510K combos, bomb) so an ambiguous hand like 4 kings is treated as the
 * stronger combo.
 */
export function judgeCardTypeShuangjian(cards: number[]): SjJudgeResult {
    if (!cards || cards.length === 0) return INVALID;

    // 1) King bomb
    const kb = detectBombOrKingBomb(cards);
    if (kb && kb.type === SjCardType.KING_BOMB) return kb;

    // 2) 510K (single or multiple)
    if (cards.length === 3) {
        const r = detect510K(cards);
        if (r.valid) {
            return {
                valid: true, type: SjCardType.FIVE_TEN_K,
                headCount: 0, kingCount: 0,
                fiveTenKCount: 1, fiveTenKSuited: r.suited,
                mainRank: 0, cards: cards.slice(),
            };
        }
    } else if (cards.length >= 6 && cards.length % 3 === 0) {
        const r = detectMulti510K(cards);
        if (r) {
            return {
                valid: true, type: SjCardType.FIVE_TEN_K,
                headCount: 0, kingCount: 0,
                fiveTenKCount: r.count, fiveTenKSuited: r.allSuited,
                mainRank: 0, cards: cards.slice(),
            };
        }
    }

    // 3) Bomb (≥4 same rank)
    if (kb && kb.type === SjCardType.BOMB) return kb;

    // 4) Single / Pair / 3+2 / Plane
    if (cards.length === 1) {
        const r = rankValue(toRealCard(cards[0]));
        return {
            valid: true, type: SjCardType.SINGLE,
            headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
            mainRank: r === 1 ? 14 : (r === 2 ? 15 : (r === 53 ? 16 : (r === 54 ? 17 : r))),
            cards: cards.slice(),
        };
    }
    if (cards.length === 2) {
        const r0 = rankValue(toRealCard(cards[0]));
        const r1 = rankValue(toRealCard(cards[1]));
        if (r0 === r1 && r0 !== 53 && r0 !== 54) {
            return {
                valid: true, type: SjCardType.PAIR,
                headCount: 0, kingCount: 0, fiveTenKCount: 0, fiveTenKSuited: false,
                mainRank: r0 === 1 ? 14 : (r0 === 2 ? 15 : r0),
                cards: cards.slice(),
            };
        }
        return INVALID;
    }
    const planeRes = detectThreeWithTwoOrPlane(cards);
    if (planeRes) return planeRes;

    // 5) Straight / DoubleStraight
    const sr = detectStraight(cards);
    if (sr) return sr;
    const ds = detectDoubleStraight(cards);
    if (ds) return ds;

    return INVALID;
}

/**
 * Compute a global "weight" used for cross-type comparison.
 *
 *   510K-mixed  =  10
 *   510K-suit   =  20
 *   4-head      =  30
 *   2-king      =  40
 *   5-head      =  50
 *   6-head      =  60
 *   3-king      =  70
 *   3×510K      =  80
 *   7-head      =  90
 *   8-head      = 100
 *   4-king      = 110
 *   ≥4×510K     = 120
 *
 * Plain plays (single, pair, plane, straight, ...) all share weight 1; they
 * only beat each other when mainRank matches. Bombs (head≥4), king bombs and
 * 510K combos can override any plain play.
 */
function categoryWeight(r: SjJudgeResult): number {
    if (r.type === SjCardType.FIVE_TEN_K) {
        if (r.fiveTenKCount >= 4) return 120;
        if (r.fiveTenKCount === 3) return 80;
        // single 510K
        return r.fiveTenKSuited ? 20 : 10;
    }
    if (r.type === SjCardType.BOMB) {
        switch (r.headCount) {
            case 4: return 30;
            case 5: return 50;
            case 6: return 60;
            case 7: return 90;
            case 8: return 100;
            default: return 30 + r.headCount;
        }
    }
    if (r.type === SjCardType.KING_BOMB) {
        if (r.kingCount >= 4) return 110;
        if (r.kingCount === 3) return 70;
        return 40; // 2-king
    }
    return 1; // plain plays
}

/**
 * Compare two valid Shuangjian plays. Returns >0 if `current` beats
 * `previous`, =0 if they are equal/equivalent, <0 otherwise.
 */
export function compareShuangjian(previous: SjJudgeResult, current: SjJudgeResult): number {
    if (!previous.valid || !current.valid) return -1;
    const wp = categoryWeight(previous);
    const wc = categoryWeight(current);
    if (wc !== wp) return wc - wp;
    // Same category: must be the same plain type to follow on.
    if (previous.type !== current.type) return -1;
    // For plain plays, also require equal length.
    if (previous.cards.length !== current.cards.length) return -1;
    return current.mainRank - previous.mainRank;
}

/**
 * Suggest a follow-on play that beats `targetCards` using cards from `myCards`.
 * Returns [] when no valid response is possible.
 *
 * The algorithm enumerates "candidate plays" of the same type/length first,
 * then escalates to bombs / king-bombs / multi-510K. Designed for the hint
 * button & robotPlay, NOT for exhaustive AI.
 */
export function cardHintShuangjian(targetCards: number[], myCards: number[]): number[] {
    const targetJ = targetCards.length === 0 ? null : judgeCardTypeShuangjian(targetCards);

    // Helper: collect cards of my hand grouped by rank.
    const byRank: { [r: number]: number[] } = {};
    for (const c of myCards) {
        const r = rankValue(toRealCard(c));
        if (!byRank[r]) byRank[r] = [];
        byRank[r].push(c);
    }

    // === Free play (no previous card to beat) ===
    if (!targetJ) {
        // Prefer playing the smallest single.
        const orderedSmallToBig = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];
        for (const r of orderedSmallToBig) {
            if (byRank[r] && byRank[r].length > 0) {
                return [byRank[r][0]];
            }
        }
        return [];
    }

    // === Following a previous play ===
    // 1) Try same-type same-length larger play.
    if (targetJ.type === SjCardType.SINGLE) {
        // pick smallest single greater than mainRank
        const orderedSmallToBig = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2, 53, 54];
        for (const r of orderedSmallToBig) {
            const myRank = r === 1 ? 14 : (r === 2 ? 15 : (r === 53 ? 16 : (r === 54 ? 17 : r)));
            if (myRank > targetJ.mainRank && byRank[r] && byRank[r].length > 0) {
                return [byRank[r][0]];
            }
        }
    } else if (targetJ.type === SjCardType.PAIR) {
        const orderedSmallToBig = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2];
        for (const r of orderedSmallToBig) {
            const myRank = r === 1 ? 14 : (r === 2 ? 15 : r);
            if (myRank > targetJ.mainRank && byRank[r] && byRank[r].length >= 2) {
                return byRank[r].slice(0, 2);
            }
        }
    }

    // 2) Otherwise try a bomb that beats the previous play.
    const bombRanks = Object.keys(byRank).map(Number).filter(r => byRank[r].length >= 4 && r !== 53 && r !== 54);
    if (bombRanks.length > 0) {
        // Try bombs from small to large and return the smallest one that can beat the target.
        bombRanks.sort((a, b) => {
            const ra = a === 1 ? 14 : (a === 2 ? 15 : a);
            const rb = b === 1 ? 14 : (b === 2 ? 15 : b);
            return ra - rb;
        });
        for (const r of bombRanks) {
            const candidate = byRank[r].slice(0, 4);
            const cj = judgeCardTypeShuangjian(candidate);
            if (compareShuangjian(targetJ, cj) > 0) return candidate;
        }
    }

    // 3) King bomb fallback.
    const kings = (byRank[53] || []).concat(byRank[54] || []);
    if (kings.length >= 2) {
        const cj = judgeCardTypeShuangjian(kings);
        if (compareShuangjian(targetJ, cj) > 0) return kings;
    }

    return [];
}
