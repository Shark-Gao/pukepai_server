"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.webSocketShuangjianRouter = void 0;
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * webSocketShuangjianRouter
 *
 * Houses every websocket entry point that is unique to the Shuangjian mode,
 * such as the banker's "bao / no-bao" declaration. Doudizhu-only routes are
 * untouched in webSocketDealCardsRouter / webSocketPlayCardRouter so we
 * never risk breaking the existing flow.
 */
const decors_1 = require("../../utils/decors");
const room_1 = require("../../utils/room");
const webSocket_1 = require("./webSocket");
const IGameMode_1 = require("../../gameMode/IGameMode");
class webSocketShuangjianRouter {
    /**
     * Banker chooses whether to "package" (1-vs-3). Only valid in Shuangjian.
     * params: { roomId, isBaopai: boolean }
     */
    async selectBaopai({ ws, token, userInfo, params }) {
        var _a;
        const roomInfo = room_1.RoomObj[params.roomId];
        if (!roomInfo || ((_a = roomInfo.game_mode) !== null && _a !== void 0 ? _a : IGameMode_1.GameMode.DOUDIZHU) !== IGameMode_1.GameMode.SHUANGJIAN) {
            (0, webSocket_1.wsSend)(ws, { type: 'selectBaopai', code: 400, message: '非双剑房间' });
            return;
        }
        // Only the banker may answer the prompt.
        if (userInfo.user_id !== roomInfo.landlord_id) {
            (0, webSocket_1.wsSend)(ws, { type: 'selectBaopai', code: 400, message: '只有庄家可以选择包牌' });
            return;
        }
        // Stop the countdown before applying the result.
        clearInterval(roomInfo.count_down_timer);
        const impl = roomInfo.gameModeImpl;
        impl.applyBaopaiResult(roomInfo, !!params.isBaopai);
    }
}
exports.webSocketShuangjianRouter = webSocketShuangjianRouter;
__decorate([
    (0, decors_1.authSocketToken)({ verifyRoomId: true })
], webSocketShuangjianRouter.prototype, "selectBaopai", null);
//# sourceMappingURL=webSocketShuangjianRouter.js.map