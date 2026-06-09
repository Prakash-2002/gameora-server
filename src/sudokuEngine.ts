import { SudokuState, SudokuAction } from './sudokuTypes.js';

const BASE_SOLVED = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9
];

// Generates a fully valid Sudoku board and masking clues
export function generateSudokuBoard(cluesCount: number = 36): { board: number[]; solution: number[]; initialBoard: boolean[]; placedBy: (number | null)[] } {
  let solution = [...BASE_SOLVED];

  // 1. Swap digits randomly
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const shuffled = [...digits].sort(() => Math.random() - 0.5);
  solution = solution.map(val => shuffled[val - 1]);

  // Helper to swap rows
  const swapRows = (grid: number[], r1: number, r2: number) => {
    for (let c = 0; c < 9; c++) {
      const idx1 = r1 * 9 + c;
      const idx2 = r2 * 9 + c;
      const temp = grid[idx1];
      grid[idx1] = grid[idx2];
      grid[idx2] = temp;
    }
  };

  // Helper to swap columns
  const swapCols = (grid: number[], c1: number, c2: number) => {
    for (let r = 0; r < 9; r++) {
      const idx1 = r * 9 + c1;
      const idx2 = r * 9 + c2;
      const temp = grid[idx1];
      grid[idx1] = grid[idx2];
      grid[idx2] = temp;
    }
  };

  // 2. Permute rows within bands (0-2, 3-5, 6-8)
  for (let band = 0; band < 3; band++) {
    const offset = band * 3;
    const rows = [offset, offset + 1, offset + 2].sort(() => Math.random() - 0.5);
    swapRows(solution, offset, rows[0]);
    swapRows(solution, offset + 1, rows[1]);
    swapRows(solution, offset + 2, rows[2]);
  }

  // 3. Permute columns within stacks (0-2, 3-5, 6-8)
  for (let stack = 0; stack < 3; stack++) {
    const offset = stack * 3;
    const cols = [offset, offset + 1, offset + 2].sort(() => Math.random() - 0.5);
    swapCols(solution, offset, cols[0]);
    swapCols(solution, offset + 1, cols[1]);
    swapCols(solution, offset + 2, cols[2]);
  }

  // 4. Optional rotation
  const rotations = Math.floor(Math.random() * 4);
  for (let rot = 0; rot < rotations; rot++) {
    const temp = new Array(81).fill(0);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        temp[c * 9 + (8 - r)] = solution[r * 9 + c];
      }
    }
    solution = temp;
  }

  // 5. Apply clue masking
  const board = new Array(81).fill(0);
  const initialBoard = new Array(81).fill(false);

  // Keep a pool of indices and shuffle them
  const indices = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  
  // Fill board clues
  for (let i = 0; i < cluesCount; i++) {
    const idx = indices[i];
    board[idx] = solution[idx];
    initialBoard[idx] = true;
  }

  const placedBy = new Array(81).fill(null);
  return { board, solution, initialBoard, placedBy };
}

export function getInitialSudokuState(): SudokuState {
  const { board, solution, initialBoard, placedBy } = generateSudokuBoard(36); // 36 clues, 45 to solve
  return {
    gamePhase: 'waiting',
    activePlayer: 0,
    board,
    solution,
    initialBoard,
    placedBy,
    scores: [0, 0],
    mistakes: [0, 0],
    winner: null,
    message: 'Waiting for players...',
  };
}

export function sudokuReducer(state: SudokuState, action: SudokuAction, playerNames: string[] = ['Player 1', 'Player 2']): SudokuState {
  const newState = {
    ...state,
    board: [...state.board],
    placedBy: [...state.placedBy],
    scores: [...state.scores],
    mistakes: [...state.mistakes],
  };

  switch (action.type) {
    case 'START_SUDOKU': {
      const { board, solution, initialBoard, placedBy } = generateSudokuBoard(36);
      return {
        gamePhase: 'playing',
        activePlayer: 0,
        board,
        solution,
        initialBoard,
        placedBy,
        scores: [0, 0],
        mistakes: [0, 0],
        winner: null,
        message: `Sudoku Match Started! ${playerNames[0]}'s turn.`,
      };
    }

    case 'MAKE_MOVE': {
      if (newState.gamePhase !== 'playing') return state;
      const { playerIndex, cellIndex, digit } = action;

      // Validate turn
      if (playerIndex !== newState.activePlayer) return state;

      // Validate slot boundaries & empty check
      if (cellIndex < 0 || cellIndex >= 81 || newState.board[cellIndex] !== 0) return state;
      if (digit < 1 || digit > 9) return state;

      const isCorrect = digit === newState.solution[cellIndex];
      const name = playerNames[playerIndex] || `Player ${playerIndex + 1}`;

      if (isCorrect) {
        newState.board[cellIndex] = digit;
        newState.placedBy[cellIndex] = playerIndex;
        newState.scores[playerIndex] += 10;
        newState.message = `${name} placed ${digit} correctly! (+10 pts)`;
      } else {
        newState.mistakes[playerIndex] += 1;
        newState.scores[playerIndex] = Math.max(0, newState.scores[playerIndex] - 5);
        newState.message = `${name} placed ${digit} incorrectly! (-5 pts, strike ${newState.mistakes[playerIndex]}/3)`;
      }

      // Check game over conditions:
      // 1. Strikeout (mistakes reaches 3)
      if (newState.mistakes[playerIndex] >= 3) {
        const opposingPlayer = 1 - playerIndex;
        newState.gamePhase = 'game_over';
        newState.winner = opposingPlayer;
        const winnerName = playerNames[opposingPlayer] || `Player ${opposingPlayer + 1}`;
        newState.message = `${name} has reached 3 mistakes and is knocked out! ${winnerName} WINS!`;
        return newState;
      }

      // 2. Board solved (no empty cells left)
      const isBoardSolved = newState.board.every(cell => cell !== 0);
      if (isBoardSolved) {
        newState.gamePhase = 'game_over';
        
        const score0 = newState.scores[0];
        const score1 = newState.scores[1];

        if (score0 > score1) {
          newState.winner = 0;
        } else if (score1 > score0) {
          newState.winner = 1;
        } else {
          // Compare mistakes if scores are tied
          const mistakes0 = newState.mistakes[0];
          const mistakes1 = newState.mistakes[1];
          if (mistakes0 < mistakes1) {
            newState.winner = 0;
          } else if (mistakes1 < mistakes0) {
            newState.winner = 1;
          } else {
            newState.winner = 2; // Draw
          }
        }

        if (newState.winner === 2) {
          newState.message = 'Match Draw! Sudoku grid completely solved!';
        } else {
          const winnerName = playerNames[newState.winner!] || `Player ${newState.winner! + 1}`;
          newState.message = `Sudoku Solved! ${winnerName} wins the match!`;
        }
        return newState;
      }

      // If game goes on, pass the turn
      newState.activePlayer = 1 - newState.activePlayer;
      return newState;
    }

    case 'RESET_SUDOKU': {
      const { board, solution, initialBoard, placedBy } = generateSudokuBoard(36);
      return {
        gamePhase: 'playing',
        activePlayer: 0,
        board,
        solution,
        initialBoard,
        placedBy,
        scores: [0, 0],
        mistakes: [0, 0],
        winner: null,
        message: `Match Reset. ${playerNames[0]}'s turn.`,
      };
    }

    default:
      return state;
  }
}

// Bot solver heuristic decision logic
export function decideSudokuMove(activePlayer: number, state: SudokuState): { cellIndex: number; digit: number } | null {
  const emptyIndices: number[] = [];
  for (let i = 0; i < 81; i++) {
    if (state.board[i] === 0) {
      emptyIndices.push(i);
    }
  }

  if (emptyIndices.length === 0) return null;

  // Bot accuracy: 80% correct, 20% mistake
  const makeCorrect = Math.random() < 0.80;
  const targetCell = emptyIndices[Math.floor(Math.random() * emptyIndices.length)];
  const correctDigit = state.solution[targetCell];

  if (makeCorrect) {
    return { cellIndex: targetCell, digit: correctDigit };
  } else {
    // Generate a wrong digit (1-9 but not the correct one)
    const options = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter(d => d !== correctDigit);
    const wrongDigit = options[Math.floor(Math.random() * options.length)];
    return { cellIndex: targetCell, digit: wrongDigit };
  }
}
