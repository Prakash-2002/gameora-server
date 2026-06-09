export type ChessPhase = 'waiting' | 'playing' | 'game_over';

export interface ChessPiece {
  type: 'p' | 'r' | 'n' | 'b' | 'q' | 'k';
  color: 'w' | 'b';
  square: string;
}

export interface ChessState {
  gamePhase: ChessPhase;
  activePlayer: number; // 0: White ('w'), 1: Black ('b')
  fen: string;
  board: (ChessPiece | null)[][];
  winner: number | null; // 0: White wins, 1: Black wins, 2: Draw, null: in progress
  message: string;
  isCheck: boolean;
  moveHistory: string[];
  capturedPieces: {
    w: string[]; // Captured White pieces
    b: string[]; // Captured Black pieces
  };
}
