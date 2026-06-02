export type Suit = 'spades' | 'hearts' | 'diamonds' | 'clubs';

export type Rank = 'J' | '9' | 'A' | '10' | 'K' | 'Q' | '8' | '7';

export interface Card {
  id: string; // Unique identifier, e.g. "J_spades"
  suit: Suit;
  rank: Rank;
  points: number; // J=3, 9=2, A=1, 10=1, K/Q/8/7=0
  rankValue: number; // J=7, 9=6, A=5, 10=4, K=3, Q=2, 8=1, 7=0 (for trick-taking evaluation)
  isFaceDown?: boolean; // For obfuscation to client
}

export type GamePhase =
  | 'dealing_first'     // Dealt 4 cards each
  | 'bidding'           // Players bid (14 to 28 or Pass)
  | 'trump_selection'   // Bid winner chooses trump suit (hidden)
  | 'double_challenge'  // Players can double/redouble or select single play
  | 'dealing_second'    // Dealt remaining 4 cards each
  | 'playing'           // Trick playing phase (8 tricks total)
  | 'round_end';        // Scoring & winner display

export interface Play {
  playerIndex: number;
  card: Card;
}

export interface Trick {
  plays: Play[]; // Cards played in the trick (up to 4)
  leadSuit: Suit | null; // Suit of the first card played in this trick
  winnerIndex: number | null; // Who won this trick
}

export interface GameState {
  gamePhase: GamePhase;
  dealer: number; // 0: User/Player0, 1: Player1, 2: Player2, 3: Player3
  activePlayer: number; // Index of the player whose turn it is to act (0-3)
  playerHands: Card[][]; // Cards held by players [Player0, Player1, Player2, Player3]
  
  // Bidding Phase
  currentBid: number; // High bid (ranges from 14 to 28, or 0 if no bids yet)
  bidWinner: number | null; // Player index (0-3) of current highest bidder
  bidPasses: boolean[]; // [P0, P1, P2, P3] has passed the bidding
  lastBidder: number | null; // Player who made the last bid

  // Double & Redouble & Single Play
  doubleState: 'none' | 'double' | 'redouble';
  isSinglePlay: boolean;
  singlePlayerIndex: number | null;

  // Trump Suit Details
  trumpSuitSecret: Suit | null; // Secret trump suit chosen by the bid winner
  isTrumpRevealed: boolean; // Has the trump suit been exposed?
  trumpRevealer: number | null; // Player index who asked to expose the trump
  trumpRevealTrickIndex: number | null; // Which trick index it was revealed (0-7)

  // Tricks Details
  currentTrick: Trick;
  tricksPlayed: Trick[]; // Completed tricks history for the current round

  // Scores
  team1RoundPoints: number; // Card points won this round by Team 1 (P0 + P2)
  team2RoundPoints: number; // Card points won this round by Team 2 (P1 + P3)
  team1GameScore: number; // Cumulative game wins/losses (target +/- 6)
  team2GameScore: number;

  message: string; // Informational status message for UI
}

// Server room structures
export interface Player {
  socketId: string;
  name: string;
  isReady: boolean;
  isHost: boolean;
  isBot: boolean;
  playerIndex: number; // 0-3
}

export interface Room {
  id: string;
  players: Player[];
  gameState: GameState | null;
  botsCount: number;
}
