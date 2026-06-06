/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * IGameMode - Abstract base class for game mode strategies
 *
 * Provides the unified interface for both Doudizhu (3-player landlord) and
 * Shuangjian (Fengcheng twin-sword, 4-player) game modes.
 *
 * Concrete implementations live under:
 *   - gameMode/doudizhu/DoudizhuMode.ts
 *   - gameMode/shuangjian/ShuangjianMode.ts
 *
 * Router layer should never branch on game_mode directly. Instead, every
 * room holds a `gameModeImpl` instance and calls the corresponding hook.
 */

// Game mode enum
export enum GameMode {
    DOUDIZHU = 0,    // 斗地主 (3 players)
    SHUANGJIAN = 1,  // 丰城双剑 (4 players)
}

// Special rules for Shuangjian
export interface SpecialRules {
    drawAsOne?: boolean;          // 平局算一分
    doubleScore?: boolean;        // 输赢分翻倍
    fiveAwardChallenge?: boolean; // 五奖冲关
}

// Result for card-type judgment
export interface CardTypeResult {
    valid: boolean;
    cardType: number;   // mode-specific enum
    weight: number;     // for compareCards
    extra?: any;        // additional info such as 510K count, head count, kings
}

// Settlement result (per-user score) returned by calcSettlement
export interface SettlementResult {
    userId: string;
    rank: number;          // 1=head, last=tail
    getScore: number;      // final score (positive=win, negative=lose)
    awards: any;           // mode-specific award detail
    camp?: 'landlord' | 'farmer' | string; // for Shuangjian
}

export abstract class IGameMode {
    // -------- Capability --------
    /** Maximum allowed players in this mode */
    abstract getMaxPlayerCount(): number;
    /** Minimum players required to start a game */
    abstract getMinPlayerCount(): number;

    // -------- Lifecycle hooks --------
    /** Deal cards to every seated player. */
    abstract dealCards(roomInfo: any): void;

    /** Decide landlord (or banker for Shuangjian). */
    abstract selectLandlord(roomInfo: any): void;

    /** Called right after landlord/banker has been decided. */
    abstract onAfterLandlordDecided(roomInfo: any): void;

    // -------- Card logic --------
    /** Identify whether a play is legal under this mode. */
    abstract judgeCardType(cards: number[], context?: any): CardTypeResult;

    /** Compare two valid plays. Returns >0 if a beats b. */
    abstract compareCards(a: CardTypeResult, b: CardTypeResult): number;

    /** Suggest a beating combo for hint button or hosted bot. */
    abstract getCardHint(targetCards: number[], myCards: number[]): number[];

    // -------- Play hooks --------
    /** Called whenever a user successfully plays cards. */
    abstract onPlayCard(roomInfo: any, userId: string, cards: number[]): void;

    /** Determines whether the round is over. */
    abstract isGameOver(roomInfo: any): boolean;

    /** Calculate awards & final settlement. */
    abstract calcSettlement(roomInfo: any): SettlementResult[];

    /** Persist play record into mysql. */
    abstract saveRecordMysql(roomInfo: any, settlement: SettlementResult[]): Promise<void>;
}
