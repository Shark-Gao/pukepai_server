/**
 * ShuangjianAward - Award & settlement calculator for the Fengcheng
 * Twin-Sword mode.
 *
 * Award rules (per spec)
 * ----------------------
 *   4-head (4 same-suit) ............ 1 award
 *   5-head (4+1) .................... 2 awards
 *   5-head (3+2) .................... 1 award
 *   6-head (4+2) .................... 3 awards
 *   6-head (3+3) .................... 2 awards
 *   7-head .......................... 4 awards
 *   8-head .......................... 6 awards
 *   2 different jokers .............. 1 award
 *   2 identical jokers .............. 2 awards
 *   3 jokers ........................ 3 awards
 *   4 jokers ........................ 6 awards
 *   1×510K .......................... 0 awards
 *   3×510K .......................... 3 awards
 *   4×510K .......................... 6 awards
 *   5×510K .......................... 7 awards
 *   6×510K .......................... 8 awards
 *   7×510K .......................... 9 awards
 *   8×510K .......................... 10 awards
 *
 * Settlement rules (per spec)
 * ---------------------------
 *   包牌 (1-vs-3 win) .................. base × 6
 *   双关 (allies finish 1+2 or 1+3) ... base × 2
 *   单关 (allies finish 1+ later) ..... base × 1
 *   平局 ............................... base × 0 (or +1 if drawAsOne)
 *
 *   Special rules:
 *     drawAsOne       — draw counts 1; head +1, tail -1; mid two -1 each
 *     doubleScore     — final score × 2
 *     fiveAwardChallenge — for n awards (n≥5): each opponent pays n×(n-3),
 *                          total pot becomes (seat-1)×n×(n-3)
 */
import { toRealCard } from './ShuangjianMode';

export interface AwardDetail {
    /** Mapping of "headSize" -> count, e.g. { 4:1, 5:2 }. */
    heads: { [size: number]: number };
    /** Number of jokers held (0..4). */
    kingCount: number;
    /** Whether the 2-king pair is identical (same big king or same small king). */
    twoKingIdentical: boolean;
    /** Number of 510K combos held (a player can have multiple). */
    fiveTenKCount: number;
    /** Total awards earned. */
    totalAwards: number;
}

const HEAD_AWARDS_DEFAULT: { [size: number]: number } = {
    4: 1,  // 4-head: 4 of a same suit -> 1 award
    7: 4,  // 7-head -> 4 awards
    8: 6,  // 8-head -> 6 awards
};
const FIVE_TEN_K_AWARDS: { [count: number]: number } = {
    1: 0, 2: 0,
    3: 3, 4: 6, 5: 7, 6: 8, 7: 9, 8: 10,
};

/**
 * Count how many "n-head" groups appear in the hand. A "head" is n cards
 * of the same rank. For 5-head and 6-head we further split into 4+1/3+2 and
 * 4+2/3+3 sub-categories which influence the award count.
 *
 * Returns a flat heads count, plus a sub-category award boost map keyed by
 * head size: 5 → 2 (when 4+1) or 1 (when 3+2); 6 → 3 (4+2) or 2 (3+3).
 */
function detectHeads(cards: number[]): { heads: { [size: number]: number }, awards: number } {
    // Group by [rank, suit] for a same-suit-aware 4-head check.
    const bySuitRank: { [key: string]: number } = {};
    const byRank: { [r: number]: number } = {};
    for (const c of cards) {
        const real = toRealCard(c);
        if (real === 53 || real === 54) continue;
        const rank = (real - 1) % 13 + 1;
        const su = Math.ceil(real / 13) - 1;
        const key = `${rank}_${su}`;
        bySuitRank[key] = (bySuitRank[key] || 0) + 1;
        byRank[rank] = (byRank[rank] || 0) + 1;
    }

    const heads: { [size: number]: number } = {};
    let awards = 0;

    // 7-head & 8-head and 5/6-head (rank-based, both decks counted)
    for (const r of Object.keys(byRank).map(Number)) {
        const cnt = byRank[r];
        if (cnt >= 4) {
            // We treat 5+ as the "n-head" group; 4-head requires same suit so
            // we revisit it below.
            if (cnt === 5) {
                // detect 4+1 vs 3+2 by checking if there's another rank with ≥2
                // (4+1: one rank has 5 cards, no 3+2 split possible here)
                heads[5] = (heads[5] || 0) + 1;
                awards += 2; // 5-head as 4+1 default (2 awards)
            } else if (cnt === 6) {
                heads[6] = (heads[6] || 0) + 1;
                awards += 3;
            } else if (cnt === 7) {
                heads[7] = (heads[7] || 0) + 1;
                awards += HEAD_AWARDS_DEFAULT[7];
            } else if (cnt === 8) {
                heads[8] = (heads[8] || 0) + 1;
                awards += HEAD_AWARDS_DEFAULT[8];
            }
        }
    }

    // 4-head: 4 cards of same rank AND same suit. With double deck, both
    // decks each contribute 1 of each [rank,suit], so a 4-head requires two
    // identical [rank,suit] cards FROM EACH deck — impossible. Therefore
    // 4-head is interpreted as "all four suits of one rank present in the
    // same deck instance"; we approximate by counting any rank with exactly
    // 4 cards spanning all 4 suits.
    for (const r of Object.keys(byRank).map(Number)) {
        const cnt = byRank[r];
        if (cnt === 4) {
            const suits = [0, 1, 2, 3].every(su => (bySuitRank[`${r}_${su}`] || 0) >= 1);
            if (suits) {
                heads[4] = (heads[4] || 0) + 1;
                awards += 1;
            }
        }
    }

    // 3+2 / 3+3 mixed bonuses (5-head as 3+2 → 1 award, 6-head as 3+3 → 2)
    // These are detected when no single rank reaches 5/6 directly but two
    // separate ranks combine to 3+2 / 3+3. We iterate triples and pair them
    // with extra pairs.
    const triples: number[] = Object.keys(byRank).map(Number).filter(r => byRank[r] === 3);
    const pairs: number[] = Object.keys(byRank).map(Number).filter(r => byRank[r] >= 2 && byRank[r] !== 3);
    if (triples.length >= 2) {
        // 3+3 pairs
        const groups = Math.floor(triples.length / 2);
        heads[6] = (heads[6] || 0) + groups; // marked as 6-head (3+3 variant)
        awards += groups * 2;
    } else if (triples.length === 1 && pairs.length >= 1) {
        heads[5] = (heads[5] || 0) + 1; // 5-head (3+2 variant)
        awards += 1;
    }

    return { heads, awards };
}

/** Detect 510K combos held by a player (raw cards in hand). */
function detect510KCount(cards: number[]): number {
    const fives: number[] = [];
    const tens: number[] = [];
    const kings: number[] = [];
    for (const c of cards) {
        const real = toRealCard(c);
        if (real === 53 || real === 54) continue;
        const rank = (real - 1) % 13 + 1;
        if (rank === 5) fives.push(c);
        else if (rank === 10) tens.push(c);
        else if (rank === 13) kings.push(c);
    }
    return Math.min(fives.length, tens.length, kings.length);
}

/** Compute per-player award detail. */
export function calcAwardsForUser(cards: number[]): AwardDetail {
    const headRes = detectHeads(cards);
    const five10K = detect510KCount(cards);

    let kingCount = 0;
    let smallKing = 0, bigKing = 0;
    for (const c of cards) {
        const real = toRealCard(c);
        if (real === 53) { kingCount++; smallKing++; }
        else if (real === 54) { kingCount++; bigKing++; }
    }
    let kingAwards = 0;
    let twoKingIdentical = false;
    if (kingCount === 2) {
        twoKingIdentical = (smallKing === 2 || bigKing === 2);
        kingAwards = twoKingIdentical ? 2 : 1;
    } else if (kingCount === 3) {
        kingAwards = 3;
    } else if (kingCount === 4) {
        kingAwards = 6;
    }

    const five10KAwards = FIVE_TEN_K_AWARDS[five10K] ?? 0;

    const totalAwards = headRes.awards + kingAwards + five10KAwards;
    return {
        heads: headRes.heads,
        kingCount,
        twoKingIdentical,
        fiveTenKCount: five10K,
        totalAwards,
    };
}

/** Determine the round outcome category. */
export type VictoryStatus = 'baopai-win' | 'baopai-lose' | 'double' | 'single' | 'draw';

export interface SettlementInput {
    isBaopai: boolean;
    drawAsOne: boolean;
    doubleScore: boolean;
    fiveAwardChallenge: boolean;
    /** Players ranked head-first. */
    rankList: { userId: string; awards: number }[];
    landlordCamp: string[];   // banker's allies
    farmerCamp: string[];     // opponents
    bankerId: string;
    baseScore: number;        // 房间基注（room_base）
}

export interface SettlementUserResult {
    userId: string;
    rank: number;
    camp: 'landlord' | 'farmer';
    awards: number;
    /** Final score (positive=win, negative=lose). */
    getScore: number;
}

/**
 * Compute everyone's final score for a finished round.
 *
 * Scoring outline:
 *   1) Determine the victory category (baopai/double/single/draw).
 *   2) Compute a base multiplier × baseScore.
 *   3) Apply doubleScore (×2) and drawAsOne overrides if active.
 *   4) Apply five-award-challenge contribution from each opponent.
 *   5) Distribute scores across landlord & farmer camps.
 */
export function calcShuangjianSettlement(input: SettlementInput): {
    victoryStatus: VictoryStatus;
    results: SettlementUserResult[];
} {
    const { isBaopai, drawAsOne, doubleScore, fiveAwardChallenge,
        rankList, landlordCamp, farmerCamp, bankerId, baseScore } = input;

    // Map userId -> rank
    const rankMap: { [uid: string]: number } = {};
    rankList.forEach((r, i) => rankMap[r.userId] = i + 1);

    // Determine victory status
    let victoryStatus: VictoryStatus;
    let multiplier = 0;
    if (isBaopai) {
        // Banker (1-vs-3): banker wins iff they finish 1st (rank 1).
        const bankerRank = rankMap[bankerId] || 99;
        if (bankerRank === 1) { victoryStatus = 'baopai-win'; multiplier = 6; }
        else { victoryStatus = 'baopai-lose'; multiplier = 6; } // pay banker
    } else {
        // 2-vs-2: depends on landlord camp's two members' ranks.
        const lcRanks = landlordCamp.map(uid => rankMap[uid]).filter(Boolean).sort((a, b) => a - b);
        if (lcRanks[0] === 1 && lcRanks[1] === 2) {
            // Landlord camp finishes 1st & 2nd: 双关
            victoryStatus = 'double';
            multiplier = 2;
        } else if (lcRanks[0] === 1 && lcRanks[1] && lcRanks[1] > 2) {
            victoryStatus = 'single';
            multiplier = 1;
        } else if (lcRanks[0] === 1 && lcRanks[1] === 3) {
            // 单关 (allies finish 1+3)
            victoryStatus = 'single';
            multiplier = 1;
        } else {
            // 平局 / loss
            victoryStatus = 'draw';
            multiplier = drawAsOne ? 1 : 0;
        }
    }

    // Compute base reward magnitude.
    let unit = baseScore * multiplier;
    if (doubleScore) unit *= 2;

    // Five-award challenge: each opponent must pay n×(n-3) when winner has
    // ≥5 awards. Total pot = (seat-1) × n×(n-3), each loser pays n×(n-3).
    const fiveAwardExtra: { [uid: string]: number } = {};
    if (fiveAwardChallenge) {
        for (const r of rankList) {
            if (r.awards >= 5) {
                const pay = r.awards * (r.awards - 3);
                fiveAwardExtra[r.userId] = pay;
            }
        }
    }

    // Distribute. Return positive for winners, negative for losers.
    const results: SettlementUserResult[] = [];
    const allUsers = rankList.map(r => r.userId);
    const totalSeats = allUsers.length;

    for (const uid of allUsers) {
        const inLandlord = landlordCamp.indexOf(uid) >= 0;
        const camp: 'landlord' | 'farmer' = inLandlord ? 'landlord' : 'farmer';
        let getScore = 0;

        if (victoryStatus === 'baopai-win') {
            getScore = uid === bankerId ? unit * (totalSeats - 1) : -unit;
        } else if (victoryStatus === 'baopai-lose') {
            getScore = uid === bankerId ? -unit * (totalSeats - 1) : unit;
        } else if (victoryStatus === 'double' || victoryStatus === 'single') {
            getScore = inLandlord ? unit : -unit;
        } else { // draw
            if (drawAsOne) {
                // Head +1, tail -1, middle two -1 each
                const rk = rankMap[uid] || 99;
                if (rk === 1) getScore = baseScore;
                else if (rk === totalSeats) getScore = -baseScore;
                else getScore = -baseScore;
            } else {
                getScore = 0;
            }
        }

        // Five-award contribution
        const myAwards = (rankList.find(r => r.userId === uid)?.awards) || 0;
        if (fiveAwardChallenge && myAwards >= 5) {
            getScore += (totalSeats - 1) * fiveAwardExtra[uid];
        } else if (fiveAwardChallenge) {
            // pay all the winners with high awards
            for (const winnerUid in fiveAwardExtra) {
                if (winnerUid !== uid) getScore -= fiveAwardExtra[winnerUid];
            }
        }

        results.push({
            userId: uid,
            rank: rankMap[uid] || 99,
            camp,
            awards: myAwards,
            getScore,
        });
    }

    return { victoryStatus, results };
}
