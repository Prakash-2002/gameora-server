import { TicTacToeState, TicTacToeMark, WINNING_COMBINATIONS } from './tictactoeTypes.js';

export type TicTacToeAction =
  | { type: 'START_TICTACTOE' }
  | { type: 'MAKE_MOVE'; playerIndex: number; cellIndex: number }
  | { type: 'RESET_TICTACTOE' };

export const getInitialTicTacToeState = (): TicTacToeState => {
  return {
    gamePhase: 'waiting',
    activePlayer: 0,
    board: Array(9).fill(null),
    winner: null,
    message: 'Tic Tac Toe Lobby joined. Host click Start to begin.',
  };
};

export const checkWinner = (board: TicTacToeMark[]): number | null => {
  for (const combo of WINNING_COMBINATIONS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a] === 'X' ? 0 : 1;
    }
  }

  const isDraw = board.every(cell => cell !== null);
  if (isDraw) {
    return 2; // 2 represents Draw
  }

  return null; // Game in progress
};

export function tictactoeReducer(
  state: TicTacToeState,
  action: TicTacToeAction,
  playerNames: string[]
): TicTacToeState {
  const getPlayerName = (idx: number) => playerNames[idx] || `Player ${idx + 1}`;

  switch (action.type) {
    case 'START_TICTACTOE': {
      return {
        gamePhase: 'playing',
        activePlayer: 0,
        board: Array(9).fill(null),
        winner: null,
        message: `${getPlayerName(0)} (X) starts the match!`,
      };
    }

    case 'MAKE_MOVE': {
      const { playerIndex, cellIndex } = action;
      if (
        state.gamePhase !== 'playing' ||
        state.activePlayer !== playerIndex ||
        state.board[cellIndex] !== null ||
        cellIndex < 0 ||
        cellIndex > 8
      ) {
        return state;
      }

      const newBoard = [...state.board];
      newBoard[cellIndex] = playerIndex === 0 ? 'X' : 'O';

      const winnerResult = checkWinner(newBoard);
      
      if (winnerResult !== null) {
        let msg = '';
        if (winnerResult === 2) {
          msg = `It's a Draw! Well played.`;
        } else {
          msg = `🏆 ${getPlayerName(winnerResult)} (${winnerResult === 0 ? 'X' : 'O'}) wins the match!`;
        }
        return {
          ...state,
          board: newBoard,
          gamePhase: 'game_over',
          winner: winnerResult,
          activePlayer: -1,
          message: msg,
        };
      }

      const nextPlayer = (playerIndex + 1) % 2;
      return {
        ...state,
        board: newBoard,
        activePlayer: nextPlayer,
        message: `It is ${getPlayerName(nextPlayer)}'s (${nextPlayer === 0 ? 'X' : 'O'}) turn.`,
      };
    }

    case 'RESET_TICTACTOE': {
      return getInitialTicTacToeState();
    }

    default:
      return state;
  }
}

export const decideTicTacToeMove = (
  playerIndex: number,
  state: TicTacToeState
): number => {
  const myMark: TicTacToeMark = playerIndex === 0 ? 'X' : 'O';
  const oppMark: TicTacToeMark = playerIndex === 0 ? 'O' : 'X';
  const board = state.board;

  const findWinningMove = (mark: TicTacToeMark): number => {
    for (let i = 0; i < 9; i++) {
      if (board[i] === null) {
        const testBoard = [...board];
        testBoard[i] = mark;
        for (const combo of WINNING_COMBINATIONS) {
          const [a, b, c] = combo;
          if (testBoard[a] && testBoard[a] === testBoard[b] && testBoard[a] === testBoard[c]) {
            return i;
          }
        }
      }
    }
    return -1;
  };

  // 1. Win if possible
  const winMove = findWinningMove(myMark);
  if (winMove !== -1) return winMove;

  // 2. Block if opponent is about to win
  const blockMove = findWinningMove(oppMark);
  if (blockMove !== -1) return blockMove;

  // 3. Take center
  if (board[4] === null) return 4;

  // 4. Take empty corner
  const corners = [0, 2, 6, 8];
  const emptyCorners = corners.filter(c => board[c] === null);
  if (emptyCorners.length > 0) {
    const randIdx = Math.floor(Math.random() * emptyCorners.length);
    return emptyCorners[randIdx];
  }

  // 5. Take any empty cell
  const emptyCells = [];
  for (let i = 0; i < 9; i++) {
    if (board[i] === null) emptyCells.push(i);
  }
  if (emptyCells.length > 0) {
    const randIdx = Math.floor(Math.random() * emptyCells.length);
    return emptyCells[randIdx];
  }

  return -1;
};
