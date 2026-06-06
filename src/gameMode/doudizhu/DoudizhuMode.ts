/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * DoudizhuMode - Adapter for the existing Doudizhu (Landlord) flow.
 *
 * Rather than re-writing the well-tested router code, this class delegates
 * to the existing webSocketDealCardsRouter / webSocketPlayCardRouter and
 * the static CardLogic helpers. This keeps the abstraction (IGameMode)
 * stable while preserving 100% feature parity with the original Doudizhu
 * implementation.
 */
import { IGameMode, CardTypeResult, SettlementResult } from '../IGameMode';
import CardLogic from '../../cardLogic/cardLogic';
import cardHint from '../../cardLogic/cardHint';

export class DoudizhuMode extends IGameMode {
    // ----- Capability -----
    getMaxPlayerCount(): number { return 3; }
    getMinPlayerCount(): number { return 3; }

    // ----- Lifecycle -----
    /**
     * Deal cards. Delegates to the existing router so that the long-running
     * grab-landlord / double / play sequence keeps working unchanged.
     */
    dealCards(roomInfo: any): void {
        // Lazy require to avoid circular imports between Router & GameMode.
        const { webSocketDealCardsRouter } = require('../../router/websocket/webSocketDealCardsRouter');
        webSocketDealCardsRouter.dealCards({ params: { roomId: roomInfo.room_id } });
    }

    /** Doudizhu landlord is decided through the bidding flow inside the router. */
    selectLandlord(roomInfo: any): void {
        // No-op: handled implicitly during the dealCards → grabLandlord chain.
    }

    onAfterLandlordDecided(_roomInfo: any): void { /* no-op */ }

    // ----- Card logic -----
    judgeCardType(cards: number[]): CardTypeResult {
        const t = CardLogic.judgeCardType(cards);
        if (!t) {
            return { valid: false, cardType: -1, weight: 0 };
        }
        // Use the CardTypeValue.value (1=normal, 2=boom, 3=king-boom) as weight.
        return { valid: true, cardType: 0, weight: (t as any).value, extra: t };
    }

    compareCards(_a: CardTypeResult, _b: CardTypeResult): number {
        // For Doudizhu the existing logic already handles compare via raw cards.
        // The router calls CardLogic.compareWithCard directly; this method is
        // therefore kept as a no-op stub for interface completeness.
        return 0;
    }

    getCardHint(targetCards: number[], myCards: number[]): number[] {
        return cardHint.cardHint(targetCards, myCards);
    }

    // ----- Play hooks -----
    onPlayCard(_roomInfo: any, _userId: string, _cards: number[]): void { /* handled in router */ }

    isGameOver(roomInfo: any): boolean {
        // Doudizhu ends when any player runs out of cards.
        return Object.keys(roomInfo.roomUsers || {}).some(uid => {
            const u = roomInfo.roomUsers[uid];
            return u.user_card && u.user_card.length === 0;
        });
    }

    calcSettlement(_roomInfo: any): SettlementResult[] {
        // Existing gameOver flow inside webSocketPlayCardRouter handles settlement.
        return [];
    }

    async saveRecordMysql(_roomInfo: any, _settlement: SettlementResult[]): Promise<void> {
        // Existing webSocketPlayCardRouter.saveRecordMysql is kept as the
        // single-source-of-truth for Doudizhu records.
    }
}
