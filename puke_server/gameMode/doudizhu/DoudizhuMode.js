"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DoudizhuMode = void 0;
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
const IGameMode_1 = require("../IGameMode");
const cardLogic_1 = require("../../cardLogic/cardLogic");
const cardHint_1 = require("../../cardLogic/cardHint");
class DoudizhuMode extends IGameMode_1.IGameMode {
    // ----- Capability -----
    getMaxPlayerCount() { return 3; }
    getMinPlayerCount() { return 3; }
    // ----- Lifecycle -----
    /**
     * Deal cards. Delegates to the existing router so that the long-running
     * grab-landlord / double / play sequence keeps working unchanged.
     */
    dealCards(roomInfo) {
        // Lazy require to avoid circular imports between Router & GameMode.
        const { webSocketDealCardsRouter } = require('../../router/websocket/webSocketDealCardsRouter');
        webSocketDealCardsRouter.dealCards({ params: { roomId: roomInfo.room_id } });
    }
    /** Doudizhu landlord is decided through the bidding flow inside the router. */
    selectLandlord(roomInfo) {
        // No-op: handled implicitly during the dealCards → grabLandlord chain.
    }
    onAfterLandlordDecided(_roomInfo) { }
    // ----- Card logic -----
    judgeCardType(cards) {
        const t = cardLogic_1.default.judgeCardType(cards);
        if (!t) {
            return { valid: false, cardType: -1, weight: 0 };
        }
        // Use the CardTypeValue.value (1=normal, 2=boom, 3=king-boom) as weight.
        return { valid: true, cardType: 0, weight: t.value, extra: t };
    }
    compareCards(_a, _b) {
        // For Doudizhu the existing logic already handles compare via raw cards.
        // The router calls CardLogic.compareWithCard directly; this method is
        // therefore kept as a no-op stub for interface completeness.
        return 0;
    }
    getCardHint(targetCards, myCards) {
        return cardHint_1.default.cardHint(targetCards, myCards);
    }
    // ----- Play hooks -----
    onPlayCard(_roomInfo, _userId, _cards) { }
    isGameOver(roomInfo) {
        // Doudizhu ends when any player runs out of cards.
        return Object.keys(roomInfo.roomUsers || {}).some(uid => {
            const u = roomInfo.roomUsers[uid];
            return u.user_card && u.user_card.length === 0;
        });
    }
    calcSettlement(_roomInfo) {
        // Existing gameOver flow inside webSocketPlayCardRouter handles settlement.
        return [];
    }
    async saveRecordMysql(_roomInfo, _settlement) {
        // Existing webSocketPlayCardRouter.saveRecordMysql is kept as the
        // single-source-of-truth for Doudizhu records.
    }
}
exports.DoudizhuMode = DoudizhuMode;
//# sourceMappingURL=DoudizhuMode.js.map