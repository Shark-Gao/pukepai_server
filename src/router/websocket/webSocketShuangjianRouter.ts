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
import { authSocketToken } from '../../utils/decors';
import { RoomObj } from '../../utils/room';
import { wsSend } from './webSocket';
import { ShuangjianMode } from '../../gameMode/shuangjian/ShuangjianMode';
import { GameMode } from '../../gameMode/IGameMode';

export class webSocketShuangjianRouter {
    /**
     * Banker chooses whether to "package" (1-vs-3). Only valid in Shuangjian.
     * params: { roomId, isBaopai: boolean }
     */
    @authSocketToken({ verifyRoomId: true })
    public async selectBaopai({ ws, token, userInfo, params }: any) {
        const roomInfo = RoomObj[params.roomId];
        if (!roomInfo || (roomInfo.game_mode ?? GameMode.DOUDIZHU) !== GameMode.SHUANGJIAN) {
            wsSend(ws, { type: 'selectBaopai', code: 400, message: '非双剑房间' });
            return;
        }
        // Only the banker may answer the prompt.
        if (userInfo.user_id !== roomInfo.landlord_id) {
            wsSend(ws, { type: 'selectBaopai', code: 400, message: '只有庄家可以选择包牌' });
            return;
        }
        // Stop the countdown before applying the result.
        clearInterval(roomInfo.count_down_timer);
        const impl = roomInfo.gameModeImpl as ShuangjianMode;
        impl.applyBaopaiResult(roomInfo, !!params.isBaopai);
    }
}
