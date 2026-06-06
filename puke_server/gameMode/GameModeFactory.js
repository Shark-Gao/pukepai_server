"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameMode = exports.gameModeFactory = void 0;
/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
/**
 * GameModeFactory - Single source of truth for instantiating IGameMode.
 *
 * The factory caches one singleton per GameMode value because every concrete
 * mode is stateless (room state is passed in via parameters). Specific room
 * options (such as SpecialRules for Shuangjian) are kept on the Room itself
 * rather than the mode instance.
 */
const IGameMode_1 = require("./IGameMode");
class GameModeFactory {
    constructor() {
        this.cache = new Map();
    }
    /**
     * Create or fetch a cached mode instance.
     * Lazily require the concrete file so circular imports never matter.
     */
    create(gameMode) {
        const key = gameMode !== null && gameMode !== void 0 ? gameMode : IGameMode_1.GameMode.DOUDIZHU;
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }
        let inst;
        switch (key) {
            case IGameMode_1.GameMode.SHUANGJIAN: {
                const { ShuangjianMode } = require('./shuangjian/ShuangjianMode');
                inst = new ShuangjianMode();
                break;
            }
            case IGameMode_1.GameMode.DOUDIZHU:
            default: {
                const { DoudizhuMode } = require('./doudizhu/DoudizhuMode');
                inst = new DoudizhuMode();
                break;
            }
        }
        this.cache.set(key, inst);
        return inst;
    }
}
exports.gameModeFactory = new GameModeFactory();
var IGameMode_2 = require("./IGameMode");
Object.defineProperty(exports, "GameMode", { enumerable: true, get: function () { return IGameMode_2.GameMode; } });
//# sourceMappingURL=GameModeFactory.js.map