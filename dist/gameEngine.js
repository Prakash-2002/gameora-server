"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBiddingComplete = exports.getInitialState = exports.evaluateTrickWinner = exports.calculateTrickPoints = exports.shuffleDeck = exports.createDeck = void 0;
exports.gameReducer = gameReducer;
exports.sanitizeStateForPlayer = sanitizeStateForPlayer;
const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
const RANKS = ['J', '9', 'A', '10', 'K', 'Q', '8', '7'];
const RANK_VALUES = {
    'J': 7,
    '9': 6,
    'A': 5,
    '10': 4,
    'K': 3,
    'Q': 2,
    '8': 1,
    '7': 0,
};
const CARD_POINTS = {
    'J': 3,
    '9': 2,
    'A': 1,
    '10': 1,
    'K': 0,
    'Q': 0,
    '8': 0,
    '7': 0,
};
const createDeck = () => {
    const deck = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({
                id: `${rank}_${suit}`,
                suit,
                rank,
                points: CARD_POINTS[rank],
                rankValue: RANK_VALUES[rank],
            });
        }
    }
    return deck;
};
exports.createDeck = createDeck;
const shuffleDeck = (deck) => {
    const newDeck = [...deck];
    for (let i = newDeck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [newDeck[i], newDeck[j]] = [newDeck[j], newDeck[i]];
    }
    return newDeck;
};
exports.shuffleDeck = shuffleDeck;
const calculateTrickPoints = (plays) => {
    return plays.reduce((sum, play) => sum + play.card.points, 0);
};
exports.calculateTrickPoints = calculateTrickPoints;
const evaluateTrickWinner = (trick, trumpSuit, isTrumpRevealedBeforeTrick, trumpRevealPlayIndex) => {
    const { plays, leadSuit } = trick;
    if (plays.length === 0)
        return 0;
    if (!leadSuit)
        return plays[0].playerIndex;
    let bestPlay = plays[0];
    let isTrumpWinning = false;
    const isPlayTrump = (play, index) => {
        if (!trumpSuit || play.card.suit !== trumpSuit)
            return false;
        if (isTrumpRevealedBeforeTrick)
            return true;
        if (trumpRevealPlayIndex !== null && index >= trumpRevealPlayIndex)
            return true;
        return false;
    };
    for (let i = 0; i < plays.length; i++) {
        const play = plays[i];
        const playIsTrump = isPlayTrump(play, i);
        if (i === 0) {
            bestPlay = play;
            isTrumpWinning = playIsTrump;
            continue;
        }
        if (playIsTrump) {
            if (!isTrumpWinning) {
                bestPlay = play;
                isTrumpWinning = true;
            }
            else {
                if (play.card.rankValue > bestPlay.card.rankValue) {
                    bestPlay = play;
                }
            }
        }
        else if (!isTrumpWinning) {
            if (play.card.suit === leadSuit) {
                if (play.card.rankValue > bestPlay.card.rankValue) {
                    bestPlay = play;
                }
            }
        }
    }
    return bestPlay.playerIndex;
};
exports.evaluateTrickWinner = evaluateTrickWinner;
const getInitialState = () => ({
    gamePhase: 'dealing_first',
    dealer: 3,
    activePlayer: 0,
    playerHands: [[], [], [], []],
    currentBid: 0,
    bidWinner: null,
    bidPasses: [false, false, false, false],
    lastBidder: null,
    doubleState: 'none',
    isSinglePlay: false,
    singlePlayerIndex: null,
    trumpSuitSecret: null,
    isTrumpRevealed: false,
    trumpRevealer: null,
    trumpRevealTrickIndex: null,
    currentTrick: { plays: [], leadSuit: null, winnerIndex: null },
    tricksPlayed: [],
    team1RoundPoints: 0,
    team2RoundPoints: 0,
    team1GameScore: 0,
    team2GameScore: 0,
    message: 'Lobby joined. Host click Start to deal cards.',
});
exports.getInitialState = getInitialState;
const checkBiddingComplete = (passes, currentBid, lastBidderIndex) => {
    const passCount = passes.filter(p => p).length;
    if (passCount === 3 && currentBid >= 14) {
        return { complete: true, forcedBidder: null };
    }
    if (passCount === 4 && currentBid === 0) {
        return { complete: true, forcedBidder: 3 }; // Dealer (assumed Index 3 here, will be override dynamically if dealer rotates)
    }
    return { complete: false, forcedBidder: null };
};
exports.checkBiddingComplete = checkBiddingComplete;
function gameReducer(state, action, playerNames) {
    const getPlayerName = (idx) => playerNames[idx] || `Player ${idx}`;
    switch (action.type) {
        case 'START_GAME': {
            const deck = (0, exports.shuffleDeck)((0, exports.createDeck)());
            const fullHands = [[], [], [], []];
            for (let i = 0; i < 8; i++) {
                for (let p = 0; p < 4; p++) {
                    fullHands[p].push(deck[i * 4 + p]);
                }
            }
            const nextActive = (state.dealer + 1) % 4;
            return {
                ...state,
                gamePhase: 'bidding',
                activePlayer: nextActive,
                playerHands: fullHands,
                currentBid: 0,
                bidWinner: null,
                bidPasses: [false, false, false, false],
                lastBidder: null,
                trumpSuitSecret: null,
                isTrumpRevealed: false,
                trumpRevealer: null,
                trumpRevealTrickIndex: null,
                currentTrick: { plays: [], leadSuit: null, winnerIndex: null },
                tricksPlayed: [],
                team1RoundPoints: 0,
                team2RoundPoints: 0,
                message: `Round started! ${getPlayerName(nextActive)} begins bidding.`,
            };
        }
        case 'PLACE_BID': {
            const { playerIndex, bid } = action;
            if (state.gamePhase !== 'bidding' || state.activePlayer !== playerIndex) {
                return state;
            }
            const newPasses = [...state.bidPasses];
            let newBid = state.currentBid;
            let newWinner = state.bidWinner;
            let msg = '';
            if (bid === 'pass') {
                newPasses[playerIndex] = true;
                msg = `${getPlayerName(playerIndex)} passed.`;
            }
            else {
                if (bid > state.currentBid) {
                    newBid = bid;
                    newWinner = playerIndex;
                    msg = `${getPlayerName(playerIndex)} bid ${bid}.`;
                }
                else {
                    return state;
                }
            }
            const check = (0, exports.checkBiddingComplete)(newPasses, newBid, newWinner);
            if (check.complete) {
                let finalWinner = newWinner;
                let finalBid = newBid;
                if (check.forcedBidder !== null) {
                    finalWinner = state.dealer;
                    finalBid = 14;
                    msg = `All passed. Dealer (${getPlayerName(state.dealer)}) is forced to bid 14.`;
                }
                return {
                    ...state,
                    currentBid: finalBid,
                    bidWinner: finalWinner,
                    bidPasses: newPasses,
                    gamePhase: 'trump_selection',
                    activePlayer: finalWinner,
                    message: `${msg} ${getPlayerName(finalWinner)} wins the bid at ${finalBid}. Select trump suit!`,
                };
            }
            let nextPlayer = (playerIndex + 1) % 4;
            while (newPasses[nextPlayer]) {
                nextPlayer = (nextPlayer + 1) % 4;
            }
            return {
                ...state,
                currentBid: newBid,
                bidWinner: newWinner,
                bidPasses: newPasses,
                activePlayer: nextPlayer,
                message: `${msg} ${getPlayerName(nextPlayer)}'s turn to bid.`,
            };
        }
        case 'SELECT_TRUMP': {
            const { suit } = action;
            if (state.gamePhase !== 'trump_selection' || state.activePlayer !== state.bidWinner) {
                return state;
            }
            const firstOpponent = (state.bidWinner + 1) % 4;
            return {
                ...state,
                trumpSuitSecret: suit,
                gamePhase: 'double_challenge',
                activePlayer: firstOpponent,
                message: `Trump suit chosen secretly. ${getPlayerName(firstOpponent)} can Double or Pass.`,
            };
        }
        case 'DOUBLE_DECISION': {
            const { playerIndex, decision } = action;
            if (state.gamePhase !== 'double_challenge')
                return state;
            let newDoubleState = state.doubleState;
            let nextActive = state.activePlayer;
            let nextPhase = 'double_challenge';
            let msg = '';
            const isDefender = (playerIndex === (state.bidWinner + 1) % 4) || (playerIndex === (state.bidWinner + 3) % 4);
            if (decision === 'double' && isDefender) {
                newDoubleState = 'double';
                nextActive = state.bidWinner;
                msg = `${getPlayerName(playerIndex)} Doubled the stakes! ${getPlayerName(state.bidWinner)} can choose to Redouble.`;
            }
            else if (decision === 'redouble' && playerIndex === state.bidWinner) {
                newDoubleState = 'redouble';
                nextPhase = 'playing';
                nextActive = (state.dealer + 1) % 4;
                if (state.isSinglePlay && nextActive === (state.singlePlayerIndex + 2) % 4) {
                    nextActive = (nextActive + 1) % 4;
                }
                msg = `${getPlayerName(playerIndex)} Redoubled! Stakes are now x4. Round begins!`;
            }
            else if (decision === 'pass') {
                if (state.doubleState === 'double') {
                    nextPhase = 'playing';
                    nextActive = (state.dealer + 1) % 4;
                    if (state.isSinglePlay && nextActive === (state.singlePlayerIndex + 2) % 4) {
                        nextActive = (nextActive + 1) % 4;
                    }
                    msg = `Bidding team chose to play Double (stakes x2). Round begins!`;
                }
                else {
                    const firstOpponent = (state.bidWinner + 1) % 4;
                    const secondOpponent = (state.bidWinner + 3) % 4;
                    if (playerIndex === firstOpponent && !state.bidPasses[secondOpponent]) {
                        nextActive = secondOpponent;
                        msg = `${getPlayerName(playerIndex)} passed double. ${getPlayerName(secondOpponent)} can Double or Pass.`;
                    }
                    else {
                        nextPhase = 'playing';
                        nextActive = (state.dealer + 1) % 4;
                        if (state.isSinglePlay && nextActive === (state.singlePlayerIndex + 2) % 4) {
                            nextActive = (nextActive + 1) % 4;
                        }
                        msg = `Opponents chose not to double. Round begins!`;
                    }
                }
            }
            return {
                ...state,
                doubleState: newDoubleState,
                gamePhase: nextPhase,
                activePlayer: nextActive,
                message: msg,
            };
        }
        case 'SINGLE_PLAY_DECISION': {
            const { playerIndex, playSingle } = action;
            if (state.gamePhase !== 'double_challenge' || playerIndex !== state.bidWinner) {
                return state;
            }
            let msg = '';
            if (playSingle) {
                msg = `${getPlayerName(playerIndex)} declared a Single Hand (Solo)! Partner is benched.`;
            }
            else {
                msg = `${getPlayerName(playerIndex)} chose to play with Partner.`;
            }
            return {
                ...state,
                isSinglePlay: playSingle,
                singlePlayerIndex: playSingle ? playerIndex : null,
                message: msg,
            };
        }
        case 'REVEAL_TRUMP': {
            if (state.gamePhase !== 'playing' || state.isTrumpRevealed) {
                return state;
            }
            const { playerIndex } = action;
            return {
                ...state,
                isTrumpRevealed: true,
                trumpRevealer: playerIndex,
                trumpRevealTrickIndex: state.tricksPlayed.length,
                message: `${getPlayerName(playerIndex)} requested to reveal Trump! Trump is ${state.trumpSuitSecret.toUpperCase()}.`,
            };
        }
        case 'PLAY_CARD': {
            const { playerIndex, card } = action;
            if (state.gamePhase !== 'playing' || state.activePlayer !== playerIndex) {
                return state;
            }
            const updatedHands = state.playerHands.map((hand, idx) => {
                if (idx === playerIndex) {
                    return hand.filter(c => c.id !== card.id);
                }
                return hand;
            });
            const newPlay = { playerIndex, card };
            const currentTrickPlays = [...state.currentTrick.plays, newPlay];
            const leadSuit = state.currentTrick.leadSuit || card.suit;
            const updatedTrick = {
                ...state.currentTrick,
                plays: currentTrickPlays,
                leadSuit,
            };
            const requiredPlays = state.isSinglePlay ? 3 : 4;
            if (currentTrickPlays.length === requiredPlays) {
                let trumpRevealPlayIndex = null;
                if (state.isTrumpRevealed && state.trumpRevealTrickIndex === state.tricksPlayed.length) {
                    trumpRevealPlayIndex = currentTrickPlays.findIndex(p => p.playerIndex === state.trumpRevealer);
                    if (trumpRevealPlayIndex === -1)
                        trumpRevealPlayIndex = 0;
                }
                const winnerIndex = (0, exports.evaluateTrickWinner)(updatedTrick, state.trumpSuitSecret, state.isTrumpRevealed && state.trumpRevealTrickIndex !== state.tricksPlayed.length, trumpRevealPlayIndex);
                updatedTrick.winnerIndex = winnerIndex;
                const trickPoints = (0, exports.calculateTrickPoints)(currentTrickPlays);
                const isTeam1Winner = winnerIndex === 0 || winnerIndex === 2;
                const newTeam1Points = isTeam1Winner ? state.team1RoundPoints + trickPoints : state.team1RoundPoints;
                const newTeam2Points = !isTeam1Winner ? state.team2RoundPoints + trickPoints : state.team2RoundPoints;
                const newTricksPlayed = [...state.tricksPlayed, updatedTrick];
                if (newTricksPlayed.length === 8) {
                    let multiplier = 1;
                    if (state.doubleState === 'double')
                        multiplier = 2;
                    else if (state.doubleState === 'redouble')
                        multiplier = 4;
                    const isWinnerTeam1 = state.bidWinner === 0 || state.bidWinner === 2;
                    let bidderPassedBid = false;
                    let roundResultMsg = '';
                    if (state.isSinglePlay) {
                        const bidderTricks = newTricksPlayed.filter(t => t.winnerIndex === state.singlePlayerIndex).length;
                        bidderPassedBid = bidderTricks === 8;
                        roundResultMsg = bidderPassedBid
                            ? `${getPlayerName(state.singlePlayerIndex)} won all 8 tricks in Solo play!`
                            : `${getPlayerName(state.singlePlayerIndex)} failed Solo play (won ${bidderTricks}/8 tricks).`;
                    }
                    else {
                        const bidderPoints = isWinnerTeam1 ? newTeam1Points : newTeam2Points;
                        bidderPassedBid = bidderPoints >= state.currentBid;
                        roundResultMsg = bidderPassedBid
                            ? `Team ${isWinnerTeam1 ? '1' : '2'} met the bid of ${state.currentBid} (Scored ${bidderPoints} pts).`
                            : `Team ${isWinnerTeam1 ? '1' : '2'} failed the bid of ${state.currentBid} (Scored ${bidderPoints} pts).`;
                    }
                    let scoreDelta = state.isSinglePlay ? 3 : 1;
                    scoreDelta *= multiplier;
                    let finalTeam1GameScore = state.team1GameScore;
                    let finalTeam2GameScore = state.team2GameScore;
                    if (bidderPassedBid) {
                        if (isWinnerTeam1) {
                            finalTeam1GameScore += scoreDelta;
                            roundResultMsg += ` Team 1 wins +${scoreDelta} pts!`;
                        }
                        else {
                            finalTeam2GameScore += scoreDelta;
                            roundResultMsg += ` Team 2 wins +${scoreDelta} pts!`;
                        }
                    }
                    else {
                        if (isWinnerTeam1) {
                            finalTeam1GameScore -= scoreDelta;
                            roundResultMsg += ` Team 1 loses -${scoreDelta} pts!`;
                        }
                        else {
                            finalTeam2GameScore -= scoreDelta;
                            roundResultMsg += ` Team 2 loses -${scoreDelta} pts!`;
                        }
                    }
                    return {
                        ...state,
                        playerHands: updatedHands,
                        currentTrick: { plays: [], leadSuit: null, winnerIndex: null },
                        tricksPlayed: newTricksPlayed,
                        team1RoundPoints: newTeam1Points,
                        team2RoundPoints: newTeam2Points,
                        team1GameScore: finalTeam1GameScore,
                        team2GameScore: finalTeam2GameScore,
                        gamePhase: 'round_end',
                        activePlayer: -1,
                        message: `Round Over! ${roundResultMsg}`,
                    };
                }
                return {
                    ...state,
                    playerHands: updatedHands,
                    currentTrick: { plays: [], leadSuit: null, winnerIndex: null },
                    tricksPlayed: newTricksPlayed,
                    team1RoundPoints: newTeam1Points,
                    team2RoundPoints: newTeam2Points,
                    activePlayer: winnerIndex,
                    message: `${getPlayerName(winnerIndex)} won the trick (+${trickPoints} pts) and leads next!`,
                };
            }
            let nextPlayer = (playerIndex + 1) % 4;
            if (state.isSinglePlay) {
                const partnerIndex = (state.singlePlayerIndex + 2) % 4;
                if (nextPlayer === partnerIndex) {
                    nextPlayer = (nextPlayer + 1) % 4;
                }
            }
            return {
                ...state,
                playerHands: updatedHands,
                currentTrick: updatedTrick,
                activePlayer: nextPlayer,
                message: `${getPlayerName(playerIndex)} played ${card.rank} of ${card.suit}.`,
            };
        }
        case 'NEXT_ROUND': {
            const nextDealer = (state.dealer + 1) % 4;
            const nextActive = (nextDealer + 1) % 4;
            return {
                ...state,
                gamePhase: 'dealing_first',
                dealer: nextDealer,
                activePlayer: nextActive,
                playerHands: [[], [], [], []],
                currentBid: 0,
                bidWinner: null,
                bidPasses: [false, false, false, false],
                lastBidder: null,
                trumpSuitSecret: null,
                isTrumpRevealed: false,
                trumpRevealer: null,
                trumpRevealTrickIndex: null,
                currentTrick: { plays: [], leadSuit: null, winnerIndex: null },
                tricksPlayed: [],
                team1RoundPoints: 0,
                team2RoundPoints: 0,
                message: `Dealer rotated to ${getPlayerName(nextDealer)}. Press Deal to start the new round!`,
            };
        }
        default:
            return state;
    }
}
function sanitizeStateForPlayer(state, playerIndex) {
    const isBiddingOrChallenging = state.gamePhase === 'bidding' ||
        state.gamePhase === 'trump_selection' ||
        state.gamePhase === 'double_challenge';
    const sanitizedHands = state.playerHands.map((hand, idx) => {
        if (idx === playerIndex) {
            if (isBiddingOrChallenging) {
                return hand.map((card, cardIdx) => {
                    if (cardIdx >= 4) {
                        return {
                            id: card.id,
                            suit: 'spades',
                            rank: '7',
                            points: 0,
                            rankValue: 0,
                            isFaceDown: true
                        };
                    }
                    return card;
                });
            }
            return hand;
        }
        return hand.map(card => ({
            id: card.id,
            suit: 'spades',
            rank: '7',
            points: 0,
            rankValue: 0,
            isFaceDown: true
        }));
    });
    return {
        ...state,
        playerHands: sanitizedHands,
        trumpSuitSecret: (state.isTrumpRevealed || state.bidWinner === playerIndex)
            ? state.trumpSuitSecret
            : null
    };
}
