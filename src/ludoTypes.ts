export type LudoColor = 'red' | 'green' | 'yellow' | 'blue';

export interface LudoToken {
  id: number; // 0 to 3
  playerIndex: number; // 0 to 3 (0: Red, 1: Green, 2: Yellow, 3: Blue)
  color: LudoColor;
  pathPosition: number; // -1: base, 0-50: common track, 51-55: home stretch, 56: finished
}

export type LudoPhase = 'waiting' | 'rolling' | 'moving' | 'game_over';

export interface LudoState {
  gamePhase: LudoPhase;
  activePlayer: number; // 0 to 3
  diceValue: number; // 1 to 6 (0 if not rolled yet)
  tokens: LudoToken[][]; // [Player0Tokens, Player1Tokens, Player2Tokens, Player3Tokens]
  winner: number | null;
  consecutiveSixes: number;
  hasRolled: boolean;
  movableTokenIds: number[]; // Array of token IDs (0-3) for the active player that can move
  message: string;
}

export const LUDO_COLORS: LudoColor[] = ['red', 'green', 'yellow', 'blue'];

export const LUDO_START_TILES = [0, 13, 26, 39];
export const LUDO_SAFE_TILES = [0, 8, 13, 21, 26, 34, 39, 47];

export const getGlobalTileIndex = (playerIndex: number, pathPosition: number): number => {
  if (pathPosition < 0 || pathPosition > 50) return -1;
  return (pathPosition + playerIndex * 13) % 52;
};
