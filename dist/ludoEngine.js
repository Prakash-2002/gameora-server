"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.decideLudoMove = exports.getMovableTokens = exports.getInitialLudoState = void 0;
exports.ludoReducer = ludoReducer;
const ludoTypes_js_1 = require("./ludoTypes.js");
const getInitialLudoState = () => {
    const initialTokens = [];
    for (let p = 0; p < 4; p++) {
        const playerTokens = [];
        for (let t = 0; t < 4; t++) {
            playerTokens.push({
                id: t,
                playerIndex: p,
                color: ludoTypes_js_1.LUDO_COLORS[p],
                pathPosition: -1, // inside base
            });
        }
        initialTokens.push(playerTokens);
    }
    return {
        gamePhase: 'waiting',
        activePlayer: 0, // Red starts
        diceValue: 0,
        tokens: initialTokens,
        winner: null,
        consecutiveSixes: 0,
        hasRolled: false,
        movableTokenIds: [],
        message: 'Ludo Lobby joined. Host click Start to begin.',
    };
};
exports.getInitialLudoState = getInitialLudoState;
const getMovableTokens = (tokens, diceValue) => {
    if (diceValue <= 0 || diceValue > 6)
        return [];
    const movable = [];
    tokens.forEach(token => {
        // If token is in base, it needs a 6 to come out
        if (token.pathPosition === -1) {
            if (diceValue === 6) {
                movable.push(token.id);
            }
        }
        else {
            // If token is on path, it cannot overshoot 56 (home triangle)
            if (token.pathPosition + diceValue <= 56) {
                movable.push(token.id);
            }
        }
    });
    return movable;
};
exports.getMovableTokens = getMovableTokens;
function ludoReducer(state, action, playerNames) {
    const getPlayerName = (idx) => playerNames[idx] || `Player ${idx}`;
    switch (action.type) {
        case 'START_LUDO': {
            const resetState = (0, exports.getInitialLudoState)();
            return {
                ...resetState,
                gamePhase: 'rolling',
                activePlayer: 0,
                message: `Match started! ${getPlayerName(0)} (Red) rolls first.`,
            };
        }
        case 'ROLL_DICE': {
            const { playerIndex } = action;
            if (state.gamePhase !== 'rolling' || state.activePlayer !== playerIndex || state.hasRolled) {
                return state;
            }
            // Roll dice (1-6)
            const rollValue = Math.floor(Math.random() * 6) + 1;
            let nextConsecutiveSixes = state.consecutiveSixes;
            let nextPlayer = state.activePlayer;
            let nextPhase = 'moving';
            let msg = '';
            if (rollValue === 6) {
                nextConsecutiveSixes += 1;
                if (nextConsecutiveSixes === 3) {
                    // Three 6s in a row resets turn
                    nextPlayer = (state.activePlayer + 1) % 4;
                    nextConsecutiveSixes = 0;
                    nextPhase = 'rolling';
                    msg = `${getPlayerName(playerIndex)} rolled three 6s in a row! Turn skipped. ${getPlayerName(nextPlayer)}'s turn to roll.`;
                    return {
                        ...state,
                        diceValue: rollValue,
                        activePlayer: nextPlayer,
                        consecutiveSixes: 0,
                        hasRolled: false,
                        gamePhase: nextPhase,
                        movableTokenIds: [],
                        message: msg,
                    };
                }
            }
            else {
                nextConsecutiveSixes = 0;
            }
            // Calculate moves
            const playerTokens = state.tokens[playerIndex];
            const movable = (0, exports.getMovableTokens)(playerTokens, rollValue);
            if (movable.length === 0) {
                // No moves possible, turn passes immediately
                nextPlayer = (state.activePlayer + 1) % 4;
                nextPhase = 'rolling';
                nextConsecutiveSixes = 0; // Reset sixes if turn rotates
                msg = `${getPlayerName(playerIndex)} rolled ${rollValue} but has no moves. Turn passes to ${getPlayerName(nextPlayer)}.`;
                return {
                    ...state,
                    diceValue: rollValue,
                    activePlayer: nextPlayer,
                    consecutiveSixes: 0,
                    hasRolled: false,
                    gamePhase: nextPhase,
                    movableTokenIds: [],
                    message: msg,
                };
            }
            // Player must choose a token to move
            msg = `${getPlayerName(playerIndex)} rolled ${rollValue}! Select a token to move.`;
            return {
                ...state,
                diceValue: rollValue,
                consecutiveSixes: nextConsecutiveSixes,
                hasRolled: true,
                gamePhase: 'moving',
                movableTokenIds: movable,
                message: msg,
            };
        }
        case 'MOVE_TOKEN': {
            const { playerIndex, tokenId } = action;
            if (state.gamePhase !== 'moving' || state.activePlayer !== playerIndex || !state.movableTokenIds.includes(tokenId)) {
                return state;
            }
            const rollValue = state.diceValue;
            const playerTokens = [...state.tokens[playerIndex]];
            const token = playerTokens[tokenId];
            // Calculate new position
            let newPos = token.pathPosition === -1 ? 0 : token.pathPosition + rollValue;
            // Update token position
            playerTokens[tokenId] = {
                ...token,
                pathPosition: newPos,
            };
            // Create new tokens array clone
            const newTokens = state.tokens.map((pTokens, idx) => {
                if (idx === playerIndex)
                    return playerTokens;
                return pTokens;
            });
            let gotKill = false;
            let reachedGoal = false;
            let killMsg = '';
            // Check collision/killing
            if (newPos >= 0 && newPos <= 50) {
                const globalIndex = (0, ludoTypes_js_1.getGlobalTileIndex)(playerIndex, newPos);
                const isSafeTile = ludoTypes_js_1.LUDO_SAFE_TILES.includes(globalIndex);
                if (!isSafeTile && globalIndex !== -1) {
                    // Check for opponent tokens
                    for (let p = 0; p < 4; p++) {
                        if (p === playerIndex)
                            continue;
                        const opponentTokens = [...newTokens[p]];
                        let opponentUpdated = false;
                        for (let t = 0; t < 4; t++) {
                            const ot = opponentTokens[t];
                            if (ot.pathPosition >= 0 && ot.pathPosition <= 50) {
                                const opponentGlobal = (0, ludoTypes_js_1.getGlobalTileIndex)(p, ot.pathPosition);
                                if (opponentGlobal === globalIndex) {
                                    // Captured! Send back to base
                                    opponentTokens[t] = {
                                        ...ot,
                                        pathPosition: -1,
                                    };
                                    gotKill = true;
                                    opponentUpdated = true;
                                    killMsg = ` and captured ${getPlayerName(p)}'s token!`;
                                }
                            }
                        }
                        if (opponentUpdated) {
                            newTokens[p] = opponentTokens;
                        }
                    }
                }
            }
            // Check reached home
            if (newPos === 56) {
                reachedGoal = true;
            }
            // Check Win Condition: all 4 tokens finished (pathPosition === 56)
            const allFinished = playerTokens.every(t => t.pathPosition === 56);
            if (allFinished) {
                return {
                    ...state,
                    tokens: newTokens,
                    gamePhase: 'game_over',
                    winner: playerIndex,
                    activePlayer: -1,
                    message: `🏆 MATCH OVER! ${getPlayerName(playerIndex)} is the Ludo Champion!`,
                };
            }
            // Determine next turn:
            // Player rolls again if: they rolled a 6, captured an opponent, or reached goal
            const getsBonus = (rollValue === 6 && state.consecutiveSixes > 0) || gotKill || reachedGoal;
            let nextPlayer = state.activePlayer;
            let nextConsecutiveSixes = state.consecutiveSixes;
            let turnMsg = '';
            if (getsBonus) {
                nextPlayer = state.activePlayer;
                // Keep consecutive sixes if they rolled a 6; otherwise reset if they got bonus from capture/goal
                if (!gotKill && !reachedGoal && rollValue === 6) {
                    nextConsecutiveSixes = state.consecutiveSixes;
                }
                else {
                    nextConsecutiveSixes = 0; // reset sixes for capture/goal bonus turns
                }
                turnMsg = `${getPlayerName(state.activePlayer)} gets a bonus roll!`;
            }
            else {
                nextPlayer = (state.activePlayer + 1) % 4;
                nextConsecutiveSixes = 0;
                turnMsg = `Next turn for ${getPlayerName(nextPlayer)}.`;
            }
            const moveLogMsg = `${getPlayerName(playerIndex)} moved token ${tokenId + 1}${killMsg}.${reachedGoal ? ' Token reached Home!' : ''} ${turnMsg}`;
            return {
                ...state,
                tokens: newTokens,
                activePlayer: nextPlayer,
                consecutiveSixes: nextConsecutiveSixes,
                diceValue: 0,
                hasRolled: false,
                gamePhase: 'rolling',
                movableTokenIds: [],
                message: moveLogMsg,
            };
        }
        case 'RESET_LUDO': {
            return (0, exports.getInitialLudoState)();
        }
        default:
            return state;
    }
}
const decideLudoMove = (playerIndex, state) => {
    const movableTokenIds = state.movableTokenIds;
    if (movableTokenIds.length === 0)
        return -1;
    if (movableTokenIds.length === 1)
        return movableTokenIds[0];
    const rollValue = state.diceValue;
    const playerTokens = state.tokens[playerIndex];
    // Heuristic 1: Can we kill/capture an opponent?
    for (const tid of movableTokenIds) {
        const token = playerTokens[tid];
        const newPos = token.pathPosition === -1 ? 0 : token.pathPosition + rollValue;
        if (newPos >= 0 && newPos <= 50) {
            const globalIndex = (0, ludoTypes_js_1.getGlobalTileIndex)(playerIndex, newPos);
            if (globalIndex !== -1 && !ludoTypes_js_1.LUDO_SAFE_TILES.includes(globalIndex)) {
                for (let p = 0; p < 4; p++) {
                    if (p === playerIndex)
                        continue;
                    for (const ot of state.tokens[p]) {
                        if (ot.pathPosition >= 0 && ot.pathPosition <= 50) {
                            if ((0, ludoTypes_js_1.getGlobalTileIndex)(p, ot.pathPosition) === globalIndex) {
                                return tid; // Capture opponent!
                            }
                        }
                    }
                }
            }
        }
    }
    // Heuristic 2: Can we reach the goal (home triangle)?
    for (const tid of movableTokenIds) {
        const token = playerTokens[tid];
        const newPos = token.pathPosition === -1 ? 0 : token.pathPosition + rollValue;
        if (newPos === 56) {
            return tid;
        }
    }
    // Heuristic 3: Can we release a token from base?
    if (rollValue === 6) {
        for (const tid of movableTokenIds) {
            const token = playerTokens[tid];
            if (token.pathPosition === -1) {
                return tid;
            }
        }
    }
    // Heuristic 4: Can we escape a threat?
    for (const tid of movableTokenIds) {
        const token = playerTokens[tid];
        if (token.pathPosition >= 0 && token.pathPosition <= 50) {
            const currentGlobal = (0, ludoTypes_js_1.getGlobalTileIndex)(playerIndex, token.pathPosition);
            let underThreat = false;
            for (let p = 0; p < 4; p++) {
                if (p === playerIndex)
                    continue;
                for (const ot of state.tokens[p]) {
                    if (ot.pathPosition >= 0 && ot.pathPosition <= 50) {
                        const oppGlobal = (0, ludoTypes_js_1.getGlobalTileIndex)(p, ot.pathPosition);
                        const dist = (currentGlobal - oppGlobal + 52) % 52;
                        if (dist > 0 && dist <= 6) {
                            underThreat = true;
                            break;
                        }
                    }
                }
                if (underThreat)
                    break;
            }
            if (underThreat) {
                const newPos = token.pathPosition + rollValue;
                const newGlobal = (0, ludoTypes_js_1.getGlobalTileIndex)(playerIndex, newPos);
                if (ludoTypes_js_1.LUDO_SAFE_TILES.includes(newGlobal) || newPos > 50) {
                    return tid; // Safe escape!
                }
            }
        }
    }
    // Heuristic 5: Move the token furthest along the path
    let bestTid = movableTokenIds[0];
    let maxPos = -2;
    for (const tid of movableTokenIds) {
        const token = playerTokens[tid];
        if (token.pathPosition > maxPos) {
            maxPos = token.pathPosition;
            bestTid = tid;
        }
    }
    return bestTid;
};
exports.decideLudoMove = decideLudoMove;
