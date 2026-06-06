import { clientReturnRoomUsers } from '../../utils/tools';
import { authSocketToken } from '../../utils/decors';
import { RoomObj, GameStatus, CreateRoom, RoomType, userJoinRoom } from '../../utils/room';
import { wsSend } from './webSocket'
import User from '../user';
import { gameModeFactory, GameMode } from '../../gameMode/GameModeFactory';
import { SpecialRules } from '../../gameMode/IGameMode';

/**
 * Match queues are partitioned by both level and gameMode so that Doudizhu
 * (3 seats) and Shuangjian (4 seats) never share a queue.
 *
 * Key format: `${level}_${gameMode}`.
 */
export let matchUserList: { [key: string]: any[] } = {};

/** Build the queue key for a given (level, gameMode). */
function buildMatchKey(level: number | string, gameMode: number): string {
  return `${level}_${gameMode}`;
}

export const setMatchUserList = (level, arr) => {
  // Backwards compatible setter (Doudizhu default).
  matchUserList[buildMatchKey(level, GameMode.DOUDIZHU)] = arr;
}

// 匹配
export class webSocketMatchRouter {

  // 开启游戏匹配
  @authSocketToken()
  public async match({ ws, token, userInfo, params }: any) {
    // 判断用户元宝是否充足
    let { status, message } = await User.GoldIsAdequate({
      userId: userInfo.user_id,
      level: params.level
    })

    if (!status) {
      wsSend(ws, { type: "match", code: 400, message });
      return;
    }

    const gameMode: number = params.gameMode ?? GameMode.DOUDIZHU;
    const specialRules: SpecialRules = params.specialRules || {};
    const queueKey = buildMatchKey(params.level, gameMode);
    if (!matchUserList[queueKey]) matchUserList[queueKey] = [];

    // Required seat count for THIS match request.
    const modeImpl = gameModeFactory.create(gameMode);
    const requiredCount = modeImpl.getMaxPlayerCount();
    const robotCount = Math.min(Math.max(Number(params.robotCount) || 0, 0), Math.max(requiredCount - 1, 0));
    const robotLevel = params.robotLevel ?? 0;

    if (robotCount > 0) {
      const roomId = await CreateRoom({
        userInfo: { ...userInfo, ws },
        level: params.level,
        roomType: RoomType.MATCHING,
        gameMode,
        specialRules,
        robotCount,
        robotLevel,
      });
      console.log(`机器人匹配成功 mode=${gameMode} robots=${robotCount}`, userInfo.user_id);
      wsSend(ws, {
        type: 'match',
        code: 200,
        data: { roomId },
        message: '匹配成功',
      });
      return;
    }

    // 1) Try to join an existing matching room of the SAME mode/level with empty seats.
    const matchingRoom = Object.keys(RoomObj).filter(roomId => {
      const roomInfo = RoomObj[roomId];
      const sameMode = (roomInfo.game_mode ?? GameMode.DOUDIZHU) === gameMode;
      const sameLevel = roomInfo.level == params.level;
      return roomInfo.room_type === RoomType.MATCHING
        && roomInfo.gameStatus === GameStatus.NOSTART
        && sameMode && sameLevel
        && roomInfo.roomUserIdList.some(id => !id);
    });

    if (matchingRoom.length > 0) {
      const roomId = matchingRoom[0];
      const roomInfo = RoomObj[roomId];
      const { status: joinStatus, message: joinMsg } = userJoinRoom(userInfo, roomId);
      if (joinStatus) {
        wsSend(ws, { type: 'match', code: 200, data: { roomId }, message: '匹配成功' });
        // 通知房间内其他玩家
        Object.keys(roomInfo.roomUsers).filter(id => id != userInfo.user_id).forEach((userId) => {
          const roomUserInfo = roomInfo.roomUsers[userId];
          wsSend(roomUserInfo.ws, {
            type: "userJoinRoomUpdate",
            code: 200,
            data: {
              ...roomInfo,
              roomUsers: clientReturnRoomUsers(roomInfo.roomUsers, userId)
            },
            message: '加入房间成功'
          })
        });
      } else {
        wsSend(ws, { type: 'match', code: 400, message: joinMsg });
      }
      return;
    }

    // 2) Otherwise enqueue & try to form a fresh room.
    matchUserList[queueKey].push({ ...userInfo, ws });

    if (matchUserList[queueKey].length >= requiredCount) {
      const matchUser = matchUserList[queueKey].splice(0, requiredCount);
      const roomId = await CreateRoom({
        userInfo: matchUser[0],
        level: params.level,
        roomType: RoomType.MATCHING,
        gameMode,
        specialRules,
      });
      console.log(`匹配成功 mode=${gameMode} required=${requiredCount}`, matchUser.map(u => u.user_id));

      // The room owner is already in the room via CreateRoom; bring the rest in.
      for (let i = 0; i < matchUser.length; i++) {
        const u = matchUser[i];
        if (i > 0) {
          userJoinRoom(u, roomId);
        }
        wsSend(u.ws, {
          type: 'match',
          code: 200,
          data: { roomId },
          message: '匹配成功',
        });
      }
    } else {
      wsSend(ws, { type: 'match', code: 200, message: '匹配中' });
    }
  }

  // 退出匹配
  @authSocketToken()
  public cancelMatch({ ws, token, userInfo, params }: any) {
    const gameMode: number = params.gameMode ?? GameMode.DOUDIZHU;
    const queueKey = buildMatchKey(params.level, gameMode);

    if (matchUserList[queueKey]) {
      matchUserList[queueKey] = matchUserList[queueKey].filter((item) => userInfo.user_id !== item.user_id);
    }

    wsSend(ws, {
      type: 'cancelMatch',
      code: 200,
      message: '退出匹配成功',
    });
  }
}