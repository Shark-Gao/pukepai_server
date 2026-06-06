/*
 * @author: sharkgao
 * @LastEditors: sharkgao
 */
export enum RobotLevel {
  Simple = 0,
  Medium = 1,
  Hell = 2,
}

export interface PlayCardRecord {
  userId: string;
  playCard: number[];
  gameOver?: boolean;
  gameOverData?: any[];
}

export interface RobotPlayDecisionContext {
  roomInfo: any;
  userId: string;
  handCards: number[];
  lastRecord?: PlayCardRecord | null;
  isFreePlay: boolean;
}

export interface DoudizhuAiStrategy {
  readonly level: RobotLevel;
  shouldSelectLandlord(cards: number[], roomInfo?: any, userId?: string): boolean;
  choosePlayCards(context: RobotPlayDecisionContext): number[];
}

export interface ShuangjianAiStrategy {
  readonly level: RobotLevel;
  choosePlayCards(context: RobotPlayDecisionContext): number[];
}

export function normalizeRobotLevel(level: any): RobotLevel {
  const value = Number(level);
  if (value === RobotLevel.Medium) return RobotLevel.Medium;
  if (value === RobotLevel.Hell) return RobotLevel.Hell;
  return RobotLevel.Simple;
}
