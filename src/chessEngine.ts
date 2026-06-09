import { Chess } from 'chess.js';
import { ChessState, ChessPiece } from './chessTypes.js';

export type ChessAction =
  | { type: 'START_CHESS' }
  | { type: 'MAKE_MOVE'; playerIndex: number; from: string; to: string; promotion?: string }
  | { type: 'RESET_CHESS' };

export const getCapturedPieces = (board: (ChessPiece | null)[][]) => {
  const counts = {
    w: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 },
    b: { p: 8, r: 2, n: 2, b: 2, q: 1, k: 1 }
  };
  
  for (const row of board) {
    for (const piece of row) {
      if (piece) {
        counts[piece.color][piece.type]--;
      }
    }
  }

  const captured = {
    w: [] as string[],
    b: [] as string[]
  };

  for (const color of ['w', 'b'] as const) {
    for (const [type, count] of Object.entries(counts[color])) {
      for (let i = 0; i < count; i++) {
        captured[color].push(type);
      }
    }
  }

  return captured;
};

export const getInitialChessState = (): ChessState => {
  const chess = new Chess();
  const rawBoard = chess.board();
  const board = rawBoard.map((row, rIdx) =>
    row.map((cell, cIdx) => {
      if (!cell) return null;
      return {
        type: cell.type,
        color: cell.color,
        square: cell.square
      } as ChessPiece;
    })
  );

  return {
    gamePhase: 'waiting',
    activePlayer: 0,
    fen: chess.fen(),
    board: board,
    winner: null,
    message: 'Chess Lobby joined. Host click Start to begin.',
    isCheck: false,
    moveHistory: [],
    capturedPieces: { w: [], b: [] }
  };
};

export function chessReducer(
  state: ChessState,
  action: ChessAction,
  playerNames: string[]
): ChessState {
  const getPlayerName = (idx: number) => playerNames[idx] || `Player ${idx + 1}`;

  switch (action.type) {
    case 'START_CHESS': {
      const initial = getInitialChessState();
      return {
        ...initial,
        gamePhase: 'playing',
        message: `${getPlayerName(0)} (White) starts the match!`,
      };
    }

    case 'MAKE_MOVE': {
      const { playerIndex, from, to, promotion } = action;
      
      // Enforce turn check
      if (state.gamePhase !== 'playing' || state.activePlayer !== playerIndex) {
        return state;
      }

      // Check colors: White is player 0, Black is player 1
      const activeColor = playerIndex === 0 ? 'w' : 'b';
      
      try {
        const chess = new Chess(state.fen);
        
        // Ensure the piece belongs to active player
        const piece = chess.get(from as any);
        if (!piece || piece.color !== activeColor) {
          return state;
        }

        // Attempt move using chess.js
        const move = chess.move({
          from: from,
          to: to,
          promotion: promotion || 'q' // default to queen for auto-promotions
        });

        if (!move) {
          return state;
        }

        // Move successfully executed
        const newFen = chess.fen();
        const rawBoard = chess.board();
        const newBoard = rawBoard.map(row =>
          row.map(cell => {
            if (!cell) return null;
            return {
              type: cell.type,
              color: cell.color,
              square: cell.square
            } as ChessPiece;
          })
        );

        const captured = getCapturedPieces(newBoard);
        const isGameOver = chess.isGameOver();
        const isCheck = chess.inCheck();
        const history = state.moveHistory.concat(move.san);

        if (isGameOver) {
          let winnerResult: number | null = null;
          let msg = '';

          if (chess.isCheckmate()) {
            winnerResult = playerIndex; // Current player wins
            msg = `🏆 Checkmate! ${getPlayerName(winnerResult)} wins the match!`;
          } else if (chess.isDraw()) {
            winnerResult = 2; // Draw
            if (chess.isStalemate()) {
              msg = `Draw by Stalemate!`;
            } else if (chess.isThreefoldRepetition()) {
              msg = `Draw by Threefold Repetition!`;
            } else if (chess.isInsufficientMaterial()) {
              msg = `Draw by Insufficient Material!`;
            } else {
              msg = `Draw game!`;
            }
          }

          return {
            ...state,
            fen: newFen,
            board: newBoard,
            capturedPieces: captured,
            gamePhase: 'game_over',
            winner: winnerResult,
            activePlayer: -1,
            isCheck: false,
            moveHistory: history,
            message: msg
          };
        }

        // Match goes on: switch player
        const nextPlayer = (playerIndex + 1) % 2;
        const nextColorStr = nextPlayer === 0 ? 'White' : 'Black';
        const checkSuffix = isCheck ? ' - Check!' : '';
        
        return {
          ...state,
          fen: newFen,
          board: newBoard,
          capturedPieces: captured,
          activePlayer: nextPlayer,
          isCheck: isCheck,
          moveHistory: history,
          message: `${getPlayerName(nextPlayer)} (${nextColorStr})'s turn${checkSuffix}`
        };
      } catch (err) {
        console.error("Invalid chess move attempted:", err);
        return state;
      }
    }

    case 'RESET_CHESS': {
      return getInitialChessState();
    }

    default:
      return state;
  }
}

export const decideChessMove = (
  playerIndex: number,
  state: ChessState
): { from: string; to: string; promotion?: string } | null => {
  try {
    const chess = new Chess(state.fen);
    const moves = chess.moves({ verbose: true });
    
    if (moves.length === 0) return null;

    let bestMoves: any[] = [];
    let maxScore = -Infinity;

    for (const move of moves) {
      let score = 0;
      
      // Simulate move
      const temp = new Chess(chess.fen());
      temp.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
      
      if (temp.isCheckmate()) {
        score += 10000;
      } else if (temp.isDraw()) {
        score -= 50; 
      } else if (temp.inCheck()) {
        score += 50;
      }
      
      // Capture evaluations
      if (move.captured) {
        const valMap: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 0 };
        score += valMap[move.captured] || 0;
      }
      
      // Promotion evaluation
      if (move.promotion) {
        score += 800;
      }
      
      // Safety evaluation: is the landing square attacked by the opponent in next state?
      const opponentColor = temp.turn(); // Since we simulated move, temp.turn() is opponent
      if (temp.isAttacked(move.to as any, opponentColor)) {
        const valMap: Record<string, number> = { p: 100, n: 300, b: 300, r: 500, q: 900, k: 10000 };
        const pieceVal = valMap[move.piece] || 0;
        score -= pieceVal;
      }

      // Add a slight random factor to prevent playing identical games
      score += Math.random() * 5;

      if (score > maxScore) {
        maxScore = score;
        bestMoves = [move];
      } else if (score === maxScore) {
        bestMoves.push(move);
      }
    }

    if (bestMoves.length > 0) {
      const selected = bestMoves[Math.floor(Math.random() * bestMoves.length)];
      return {
        from: selected.from,
        to: selected.to,
        promotion: selected.promotion
      };
    }
  } catch (err) {
    console.error("Error deciding chess move:", err);
  }

  return null;
};
