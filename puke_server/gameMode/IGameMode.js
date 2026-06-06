"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.IGameMode = exports.GameMode = void 0;
// Game mode enum
var GameMode;
(function (GameMode) {
    GameMode[GameMode["DOUDIZHU"] = 0] = "DOUDIZHU";
    GameMode[GameMode["SHUANGJIAN"] = 1] = "SHUANGJIAN";
})(GameMode || (exports.GameMode = GameMode = {}));
class IGameMode {
}
exports.IGameMode = IGameMode;
//# sourceMappingURL=IGameMode.js.map