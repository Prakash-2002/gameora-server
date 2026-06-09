export type TicTacToeMark = 'X' | 'O' | null;

export type TicTacToePhase = 'waiting' | 'playing' | 'game_over';

export interface TicTacToeState {
  gamePhase: TicTacToePhase;
  activePlayer: number; // 0 (X) or 1 (O)
  board: TicTacToeMark[];
  winner: number | null; // 0: Player 0 wins, 1: Player 1 wins, 2: Draw match, null: in progress
  message: string;
}

export const WINNING_COMBINATIONS = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8], // Rows
  [0, 3, 6], [1, 4, 7], [2, 5, 8], // Columns
  [0, 4, 8], [2, 4, 6]             // Diagonals
];
