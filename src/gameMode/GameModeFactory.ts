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
import { IGameMode, GameMode } from './IGameMode';

class GameModeFactory {
    private cache: Map<number, IGameMode> = new Map();

    /**
     * Create or fetch a cached mode instance.
     * Lazily require the concrete file so circular imports never matter.
     */
    create(gameMode: number): IGameMode {
        const key = gameMode ?? GameMode.DOUDIZHU;
        if (this.cache.has(key)) {
            return this.cache.get(key)!;
        }

        let inst: IGameMode;
        switch (key) {
            case GameMode.SHUANGJIAN: {
                const { ShuangjianMode } = require('./shuangjian/ShuangjianMode');
                inst = new ShuangjianMode();
                break;
            }
            case GameMode.DOUDIZHU:
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

export const gameModeFactory = new GameModeFactory();
export { GameMode } from './IGameMode';
