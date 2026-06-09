export type SudokuPhase = 'waiting' | 'playing' | 'game_over';

export interface SudokuState {
  gamePhase: SudokuPhase;
  activePlayer: number; // 0 or 1
  board: number[]; // 81 elements: 0 for empty, 1-9 for filled cells
  solution: number[]; // 81 elements representing the full solution
  initialBoard: boolean[]; // 81 elements: true if cell is a starting clue
  placedBy: (number | null)[]; // 81 elements: player index who correctly filled it
  scores: number[]; // [player0Score, player1Score]
  mistakes: number[]; // [player0Mistakes, player1Mistakes] (max 3)
  winner: number | null; // 0: Player 0 wins, 1: Player 1 wins, 2: Draw
  message: string;
}

export type SudokuAction =
  | { type: 'START_SUDOKU' }
  | { type: 'MAKE_MOVE'; playerIndex: number; cellIndex: number; digit: number }
  | { type: 'RESET_SUDOKU' };
