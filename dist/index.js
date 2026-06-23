"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const livekit_server_sdk_1 = require("livekit-server-sdk");
const gameEngine_js_1 = require("./gameEngine.js");
const botAi_js_1 = require("./botAi.js");
const ludoEngine_js_1 = require("./ludoEngine.js");
const tictactoeEngine_js_1 = require("./tictactoeEngine.js");
const sudokuEngine_js_1 = require("./sudokuEngine.js");
const chessEngine_js_1 = require("./chessEngine.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Health check endpoint for Render/browser verification
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: 'Gameora Matchmaking Server is running!' });
});
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
// LiveKit Token generation endpoint
app.get('/livekit/token', async (req, res) => {
    const { room, identity } = req.query;
    if (!room || !identity) {
        return res.status(400).json({ error: 'room and identity query params are required' });
    }
    try {
        const at = new livekit_server_sdk_1.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: String(identity),
            ttl: '2h',
        });
        at.addGrant({
            roomJoin: true,
            room: String(room),
            canPublish: true,
            canSubscribe: true,
        });
        const token = await at.toJwt();
        res.json({ token });
    }
    catch (e) {
        console.error('Error generating LiveKit token:', e);
        res.status(500).json({ error: 'Internal server error generating token' });
    }
});
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
    },
});
const PORT = process.env.PORT || 3000;
// Store rooms in-memory
const rooms = new Map();
// Turn Timer Management
const turnTimers = new Map();
const lobbyDisconnectTimers = new Map();
const TURN_TIMEOUT_MS = 18000; // 18 seconds (gives 3s grace buffer over client's 15s timer)
function handleLudoTurnTimeout(roomId, playerIndex) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'ludo')
        return;
    const s = room.gameState;
    if (s.activePlayer !== playerIndex)
        return;
    console.log(`[Ludo Timer] Player ${room.players[playerIndex].name} (index ${playerIndex}) timed out in room ${roomId}. Forcing auto-play.`);
    if (s.gamePhase === 'rolling') {
        processLudoAction(roomId, { type: 'ROLL_DICE', playerIndex });
    }
    else if (s.gamePhase === 'moving') {
        const bestTokenId = (0, ludoEngine_js_1.decideLudoMove)(playerIndex, s);
        if (bestTokenId !== -1) {
            processLudoAction(roomId, { type: 'MOVE_TOKEN', playerIndex, tokenId: bestTokenId });
        }
    }
}
function handleTicTacToeTurnTimeout(roomId, playerIndex) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'tictactoe')
        return;
    const s = room.gameState;
    if (s.activePlayer !== playerIndex)
        return;
    console.log(`[TicTacToe Timer] Player ${room.players[playerIndex].name} (index ${playerIndex}) timed out in room ${roomId}. Forcing auto-play.`);
    if (s.gamePhase === 'playing') {
        const cellIndex = (0, tictactoeEngine_js_1.decideTicTacToeMove)(playerIndex, s);
        if (cellIndex !== -1) {
            processTicTacToeAction(roomId, { type: 'MAKE_MOVE', playerIndex, cellIndex });
        }
    }
}
function handleSudokuTurnTimeout(roomId, playerIndex) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'sudoku')
        return;
    const s = room.gameState;
    if (s.activePlayer !== playerIndex)
        return;
    console.log(`[Sudoku Timer] Player ${room.players[playerIndex].name} (index ${playerIndex}) timed out in room ${roomId}. Forcing auto-play.`);
    if (s.gamePhase === 'playing') {
        const bestMove = (0, sudokuEngine_js_1.decideSudokuMove)(playerIndex, s);
        if (bestMove) {
            processSudokuAction(roomId, { type: 'MAKE_MOVE', playerIndex, cellIndex: bestMove.cellIndex, digit: bestMove.digit });
        }
    }
}
function handleChessTurnTimeout(roomId, playerIndex) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'chess')
        return;
    const s = room.gameState;
    if (s.activePlayer !== playerIndex)
        return;
    console.log(`[Chess Timer] Player ${room.players[playerIndex].name} (index ${playerIndex}) timed out in room ${roomId}. Forcing auto-play.`);
    if (s.gamePhase === 'playing') {
        const move = (0, chessEngine_js_1.decideChessMove)(playerIndex, s);
        if (move) {
            processChessAction(roomId, { type: 'MAKE_MOVE', playerIndex, from: move.from, to: move.to, promotion: move.promotion });
        }
    }
}
function resetTurnTimer(roomId) {
    if (turnTimers.has(roomId)) {
        clearTimeout(turnTimers.get(roomId));
        turnTimers.delete(roomId);
    }
    const room = rooms.get(roomId);
    if (!room || !room.gameState)
        return;
    if (room.gameType === 'ludo') {
        const s = room.gameState;
        if (s.gamePhase !== 'rolling' && s.gamePhase !== 'moving')
            return;
        const activeIdx = s.activePlayer;
        if (activeIdx < 0 || activeIdx >= 4)
            return;
        const activePlayerObj = room.players[activeIdx];
        if (activePlayerObj && activePlayerObj.isBot)
            return;
        const timeoutId = setTimeout(() => {
            handleLudoTurnTimeout(roomId, activeIdx);
        }, TURN_TIMEOUT_MS);
        turnTimers.set(roomId, timeoutId);
        return;
    }
    if (room.gameType === 'tictactoe') {
        const s = room.gameState;
        if (s.gamePhase !== 'playing')
            return;
        const activeIdx = s.activePlayer;
        if (activeIdx < 0 || activeIdx >= 2)
            return;
        const activePlayerObj = room.players[activeIdx];
        if (activePlayerObj && activePlayerObj.isBot)
            return;
        const timeoutId = setTimeout(() => {
            handleTicTacToeTurnTimeout(roomId, activeIdx);
        }, TURN_TIMEOUT_MS);
        turnTimers.set(roomId, timeoutId);
        return;
    }
    if (room.gameType === 'sudoku') {
        const s = room.gameState;
        if (s.gamePhase !== 'playing')
            return;
        const activeIdx = s.activePlayer;
        if (activeIdx < 0 || activeIdx >= 2)
            return;
        const activePlayerObj = room.players[activeIdx];
        if (activePlayerObj && activePlayerObj.isBot)
            return;
        const timeoutId = setTimeout(() => {
            handleSudokuTurnTimeout(roomId, activeIdx);
        }, TURN_TIMEOUT_MS);
        turnTimers.set(roomId, timeoutId);
        return;
    }
    if (room.gameType === 'chess') {
        const s = room.gameState;
        if (s.gamePhase !== 'playing')
            return;
        const activeIdx = s.activePlayer;
        if (activeIdx < 0 || activeIdx >= 2)
            return;
        const activePlayerObj = room.players[activeIdx];
        if (activePlayerObj && activePlayerObj.isBot)
            return;
        const timeoutId = setTimeout(() => {
            handleChessTurnTimeout(roomId, activeIdx);
        }, TURN_TIMEOUT_MS);
        turnTimers.set(roomId, timeoutId);
        return;
    }
    const s = room.gameState;
    if (s.gamePhase !== 'bidding' &&
        s.gamePhase !== 'trump_selection' &&
        s.gamePhase !== 'double_challenge' &&
        s.gamePhase !== 'playing') {
        return;
    }
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 4)
        return;
    const activePlayerObj = room.players[activeIdx];
    // If active player is a bot, it will act automatically, so no timer needed
    if (activePlayerObj && activePlayerObj.isBot) {
        return;
    }
    const timeoutId = setTimeout(() => {
        handleTurnTimeout(roomId, activeIdx);
    }, TURN_TIMEOUT_MS);
    turnTimers.set(roomId, timeoutId);
}
function handleTurnTimeout(roomId, playerIndex) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType === 'ludo')
        return;
    const s = room.gameState;
    if (s.activePlayer !== playerIndex)
        return;
    console.log(`[Timer] Player ${room.players[playerIndex].name} (index ${playerIndex}) timed out in room ${roomId}. Forcing auto-play.`);
    const botHand = s.playerHands[playerIndex];
    if (s.gamePhase === 'bidding') {
        // Force Pass
        processAction(roomId, { type: 'PLACE_BID', playerIndex, bid: 'pass' });
    }
    else if (s.gamePhase === 'trump_selection') {
        // Force select first suit or spades
        const suit = botHand.length > 0 ? botHand[0].suit : 'spades';
        processAction(roomId, { type: 'SELECT_TRUMP', suit });
    }
    else if (s.gamePhase === 'double_challenge') {
        const isWinner = s.bidWinner === playerIndex;
        if (isWinner) {
            processAction(roomId, { type: 'SINGLE_PLAY_DECISION', playerIndex, playSingle: false });
            processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex, decision: 'pass' });
        }
        else {
            processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex, decision: 'pass' });
        }
    }
    else if (s.gamePhase === 'playing') {
        const { card, requestReveal } = (0, botAi_js_1.decidePlayCard)(botHand, s.currentTrick, s.isTrumpRevealed, s.trumpSuitSecret, playerIndex);
        if (requestReveal && !s.isTrumpRevealed) {
            processAction(roomId, { type: 'REVEAL_TRUMP', playerIndex });
        }
        else {
            processAction(roomId, { type: 'PLAY_CARD', playerIndex, card });
        }
    }
}
// Helper to generate unique 4-digit Room ID (only numbers)
function generateRoomId() {
    const chars = '0123456789';
    let result = '';
    for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Ensure uniqueness
    if (rooms.has(result))
        return generateRoomId();
    return result;
}
// Helper to broadcast room lobby details
function broadcastRoomUpdate(roomId) {
    const room = rooms.get(roomId);
    if (!room)
        return;
    io.to(roomId).emit('room-update', {
        roomId: room.id,
        gameType: room.gameType || 'game_28',
        players: room.players.map(p => ({
            name: p.name,
            isReady: p.isReady,
            isHost: p.isHost,
            isBot: p.isBot,
            playerIndex: p.playerIndex,
        })),
    });
}
// Helper to broadcast customized game state updates to each player socket
function broadcastGameUpdate(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState)
        return;
    room.players.forEach(p => {
        if (!p.isBot && p.socketId) {
            let stateToEmit;
            if (room.gameType === 'ludo' || room.gameType === 'tictactoe' || room.gameType === 'sudoku' || room.gameType === 'chess') {
                stateToEmit = room.gameState;
            }
            else {
                stateToEmit = (0, gameEngine_js_1.sanitizeStateForPlayer)(room.gameState, p.playerIndex);
            }
            io.to(p.socketId).emit('game-update', {
                state: stateToEmit,
                playerIndex: p.playerIndex,
                players: room.players.map(pl => ({ name: pl.name, isBot: pl.isBot, playerIndex: pl.playerIndex })),
            });
        }
    });
}
// Helper to process game actions centrally
function processAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType === 'ludo')
        return;
    const playerNames = room.players.map(p => p.name);
    // Apply action using reducer
    room.gameState = (0, gameEngine_js_1.gameReducer)(room.gameState, action, playerNames);
    // Broadcast sanitized update
    broadcastGameUpdate(roomId);
    // Reset the turn timer for the next turn
    resetTurnTimer(roomId);
    // Trigger bot turn if active player is a bot and turn changed or phase changed
    triggerBotActionIfActive(roomId);
}
// Trigger automatic bot actions if it is a bot's turn
function triggerBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType === 'ludo')
        return;
    const s = room.gameState;
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 4)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Determine delay dynamically:
    // If we just completed a trick and are transitioning, wait 2000ms so humans can see the trick cards.
    // Otherwise, play with a 1000ms (1 second) delay for natural game flow.
    const isTrickTransition = s.gamePhase === 'playing' && s.currentTrick.plays.length === 0 && s.tricksPlayed.length > 0;
    const delay = isTrickTransition ? 2000 : 1000;
    // Schedule bot move with a short delay to feel human-like
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameType === 'ludo')
            return;
        const stateRef = currentRoom.gameState;
        if (stateRef.activePlayer !== activeIdx)
            return;
        const botHand = stateRef.playerHands[activeIdx];
        if (stateRef.gamePhase === 'bidding') {
            const bid = (0, botAi_js_1.decideBid)(botHand, stateRef.currentBid, activeIdx, stateRef.bidWinner);
            processAction(roomId, { type: 'PLACE_BID', playerIndex: activeIdx, bid });
        }
        else if (stateRef.gamePhase === 'trump_selection') {
            const suit = (0, botAi_js_1.decideTrumpSuit)(botHand);
            processAction(roomId, { type: 'SELECT_TRUMP', suit });
        }
        else if (stateRef.gamePhase === 'double_challenge') {
            const isWinner = stateRef.bidWinner === activeIdx;
            if (isWinner) {
                // Choose partner play, not solo, then start
                processAction(roomId, { type: 'SINGLE_PLAY_DECISION', playerIndex: activeIdx, playSingle: false });
                processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex: activeIdx, decision: 'pass' });
            }
            else {
                processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex: activeIdx, decision: 'pass' });
            }
        }
        else if (stateRef.gamePhase === 'playing') {
            const { card, requestReveal } = (0, botAi_js_1.decidePlayCard)(botHand, stateRef.currentTrick, stateRef.isTrumpRevealed, stateRef.trumpSuitSecret, activeIdx);
            if (requestReveal && !stateRef.isTrumpRevealed) {
                processAction(roomId, { type: 'REVEAL_TRUMP', playerIndex: activeIdx });
            }
            else {
                processAction(roomId, { type: 'PLAY_CARD', playerIndex: activeIdx, card });
            }
        }
    }, delay);
}
// Helper to process Ludo game actions centrally
function processLudoAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'ludo')
        return;
    const playerNames = room.players.map(p => p.name);
    // Apply action using reducer
    room.gameState = (0, ludoEngine_js_1.ludoReducer)(room.gameState, action, playerNames);
    // Broadcast update
    broadcastGameUpdate(roomId);
    // Reset the turn timer for the next turn
    resetTurnTimer(roomId);
    // Check if player has no moves (auto-pass after delay)
    const s = room.gameState;
    if (s.gamePhase === 'moving' && s.movableTokenIds.length === 0) {
        const activeIdx = s.activePlayer;
        setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (!currentRoom || !currentRoom.gameState || currentRoom.gameType !== 'ludo')
                return;
            const currentS = currentRoom.gameState;
            if (currentS.activePlayer === activeIdx && currentS.gamePhase === 'moving' && currentS.movableTokenIds.length === 0) {
                processLudoAction(roomId, { type: 'PASS_TURN', playerIndex: activeIdx });
            }
        }, 1500); // 1.5s delay to let players see the roll
        return;
    }
    // Trigger bot turn if active player is a bot
    triggerLudoBotActionIfActive(roomId);
}
// Trigger automatic bot actions for Ludo
function triggerLudoBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'ludo')
        return;
    const s = room.gameState;
    if (s.gamePhase === 'game_over')
        return;
    if (s.gamePhase === 'moving' && s.movableTokenIds.length === 0)
        return; // Wait for auto-pass turn
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 4)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Bot action delay
    const delay = s.gamePhase === 'rolling' ? 800 : 800; // 800ms feels natural
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameType !== 'ludo')
            return;
        const stateRef = currentRoom.gameState;
        if (stateRef.activePlayer !== activeIdx)
            return;
        if (stateRef.gamePhase === 'rolling') {
            processLudoAction(roomId, { type: 'ROLL_DICE', playerIndex: activeIdx });
        }
        else if (stateRef.gamePhase === 'moving') {
            const bestTokenId = (0, ludoEngine_js_1.decideLudoMove)(activeIdx, stateRef);
            if (bestTokenId !== -1) {
                processLudoAction(roomId, { type: 'MOVE_TOKEN', playerIndex: activeIdx, tokenId: bestTokenId });
            }
        }
    }, delay);
}
// Helper to process Tic Tac Toe game actions centrally
function processTicTacToeAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'tictactoe')
        return;
    const playerNames = room.players.map(p => p.name);
    // Apply action using reducer
    room.gameState = (0, tictactoeEngine_js_1.tictactoeReducer)(room.gameState, action, playerNames);
    // Broadcast update
    broadcastGameUpdate(roomId);
    // Reset the turn timer for the next turn
    resetTurnTimer(roomId);
    // Trigger bot turn if active player is a bot
    triggerTicTacToeBotActionIfActive(roomId);
}
// Helper to process Sudoku game actions centrally
function processSudokuAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'sudoku')
        return;
    const playerNames = room.players.map(p => p.name);
    // Apply action using reducer
    room.gameState = (0, sudokuEngine_js_1.sudokuReducer)(room.gameState, action, playerNames);
    // Broadcast update
    broadcastGameUpdate(roomId);
    // Reset the turn timer for the next turn
    resetTurnTimer(roomId);
    // Trigger bot turn if active player is a bot
    triggerSudokuBotActionIfActive(roomId);
}
// Trigger automatic bot actions for Sudoku
function triggerSudokuBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'sudoku')
        return;
    const s = room.gameState;
    if (s.gamePhase === 'game_over')
        return;
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 2)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Bot action delay
    const delay = 1000;
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameType !== 'sudoku')
            return;
        const stateRef = currentRoom.gameState;
        if (stateRef.activePlayer !== activeIdx)
            return;
        if (stateRef.gamePhase === 'playing') {
            const bestMove = (0, sudokuEngine_js_1.decideSudokuMove)(activeIdx, stateRef);
            if (bestMove) {
                processSudokuAction(roomId, { type: 'MAKE_MOVE', playerIndex: activeIdx, cellIndex: bestMove.cellIndex, digit: bestMove.digit });
            }
        }
    }, delay);
}
// Trigger automatic bot actions for Tic Tac Toe
function triggerTicTacToeBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'tictactoe')
        return;
    const s = room.gameState;
    if (s.gamePhase === 'game_over')
        return;
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 2)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Bot action delay
    const delay = 600; // Snappy but human-like delay for Tic Tac Toe
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameType !== 'tictactoe')
            return;
        const stateRef = currentRoom.gameState;
        if (stateRef.activePlayer !== activeIdx)
            return;
        if (stateRef.gamePhase === 'playing') {
            const bestCellIndex = (0, tictactoeEngine_js_1.decideTicTacToeMove)(activeIdx, stateRef);
            if (bestCellIndex !== -1) {
                processTicTacToeAction(roomId, { type: 'MAKE_MOVE', playerIndex: activeIdx, cellIndex: bestCellIndex });
            }
        }
    }, delay);
}
// Helper to process Chess game actions centrally
function processChessAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'chess')
        return;
    const playerNames = room.players.map(p => p.name);
    // Apply action using reducer
    room.gameState = (0, chessEngine_js_1.chessReducer)(room.gameState, action, playerNames);
    // Broadcast update
    broadcastGameUpdate(roomId);
    // Reset turn timer
    resetTurnTimer(roomId);
    // Trigger bot action if it is bot's turn
    triggerChessBotActionIfActive(roomId);
}
// Trigger automatic bot actions for Chess
function triggerChessBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState || room.gameType !== 'chess')
        return;
    const s = room.gameState;
    if (s.gamePhase === 'game_over')
        return;
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 2)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Bot action delay (thinking time)
    const delay = Math.floor(Math.random() * 600) + 1200; // 1.2s - 1.8s delay
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameType !== 'chess')
            return;
        const stateRef = currentRoom.gameState;
        if (stateRef.activePlayer !== activeIdx)
            return;
        if (stateRef.gamePhase === 'playing') {
            const move = (0, chessEngine_js_1.decideChessMove)(activeIdx, stateRef);
            if (move) {
                processChessAction(roomId, { type: 'MAKE_MOVE', playerIndex: activeIdx, from: move.from, to: move.to, promotion: move.promotion });
            }
        }
    }, delay);
}
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Create Room
    socket.on('create-room', ({ name, gameType }) => {
        const roomId = generateRoomId();
        const sessionToken = Math.random().toString(36).substring(2, 15);
        const newPlayer = {
            socketId: socket.id,
            name: name || `Player_${socket.id.slice(0, 4)}`,
            isReady: true,
            isHost: true,
            isBot: false,
            playerIndex: 0,
            sessionToken,
        };
        const room = {
            id: roomId,
            players: [newPlayer],
            gameType: gameType || 'game_28',
            gameState: null,
            botsCount: 0,
        };
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room-created', { roomId, playerIndex: 0, sessionToken });
        broadcastRoomUpdate(roomId);
        console.log(`Room created: ${roomId} (${room.gameType}) by player ${newPlayer.name}`);
    });
    // Join Room
    socket.on('join-room', ({ roomId, name }) => {
        const cleanRoomId = roomId.trim().toUpperCase();
        const room = rooms.get(cleanRoomId);
        if (!room) {
            socket.emit('error-msg', { message: 'Room not found.' });
            return;
        }
        if (room.gameState) {
            socket.emit('error-msg', { message: 'Game in progress.' });
            return;
        }
        const maxPlayers = (room.gameType === 'tictactoe' || room.gameType === 'sudoku' || room.gameType === 'chess') ? 2 : 4;
        if (room.players.length >= maxPlayers) {
            socket.emit('error-msg', { message: 'Room is full.' });
            return;
        }
        const playerIndex = room.players.length;
        const sessionToken = Math.random().toString(36).substring(2, 15);
        const newPlayer = {
            socketId: socket.id,
            name: name || `Player_${socket.id.slice(0, 4)}`,
            isReady: false,
            isHost: false,
            isBot: false,
            playerIndex,
            sessionToken,
        };
        room.players.push(newPlayer);
        socket.join(cleanRoomId);
        socket.emit('room-joined', { roomId: cleanRoomId, playerIndex, sessionToken });
        broadcastRoomUpdate(cleanRoomId);
        console.log(`Player ${newPlayer.name} joined room ${cleanRoomId}`);
    });
    // Toggle Ready Status
    socket.on('toggle-ready', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        const player = room.players.find(p => p.socketId === socket.id);
        if (player && !player.isHost) {
            player.isReady = !player.isReady;
            broadcastRoomUpdate(roomId);
        }
    });
    // Start Game
    socket.on('start-game', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || !sender.isHost) {
            socket.emit('error-msg', { message: 'Only host can start the game.' });
            return;
        }
        // Auto-fill empty slots with bots
        const filledPlayers = [...room.players];
        const initialCount = filledPlayers.length;
        const maxPlayers = (room.gameType === 'tictactoe' || room.gameType === 'sudoku' || room.gameType === 'chess') ? 2 : 4;
        for (let i = initialCount; i < maxPlayers; i++) {
            filledPlayers.push({
                socketId: `bot_${i}`,
                name: `Player ${i}`,
                isReady: true,
                isHost: false,
                isBot: true,
                playerIndex: i,
            });
        }
        room.players = filledPlayers.slice(0, maxPlayers);
        room.botsCount = maxPlayers - Math.min(initialCount, maxPlayers);
        if (room.gameType === 'ludo') {
            room.gameState = (0, ludoEngine_js_1.getInitialLudoState)();
            room.gameState = (0, ludoEngine_js_1.ludoReducer)(room.gameState, { type: 'START_LUDO' }, room.players.map(p => p.name));
        }
        else if (room.gameType === 'tictactoe') {
            room.gameState = (0, tictactoeEngine_js_1.getInitialTicTacToeState)();
            room.gameState = (0, tictactoeEngine_js_1.tictactoeReducer)(room.gameState, { type: 'START_TICTACTOE' }, room.players.map(p => p.name));
        }
        else if (room.gameType === 'sudoku') {
            room.gameState = (0, sudokuEngine_js_1.getInitialSudokuState)();
            room.gameState = (0, sudokuEngine_js_1.sudokuReducer)(room.gameState, { type: 'START_SUDOKU' }, room.players.map(p => p.name));
        }
        else if (room.gameType === 'chess') {
            room.gameState = (0, chessEngine_js_1.getInitialChessState)();
            room.gameState = (0, chessEngine_js_1.chessReducer)(room.gameState, { type: 'START_CHESS' }, room.players.map(p => p.name));
        }
        else {
            // Initialize game state on server
            room.gameState = (0, gameEngine_js_1.getInitialState)();
            // Run the start action
            room.gameState = (0, gameEngine_js_1.gameReducer)(room.gameState, { type: 'START_GAME' }, room.players.map(p => p.name));
        }
        // Inform clients that the game has started
        io.to(roomId).emit('game-started');
        // Broadcast customized game states
        broadcastGameUpdate(roomId);
        // Start turn timer
        resetTurnTimer(roomId);
        // Trigger bot action if active
        if (room.gameType === 'ludo') {
            triggerLudoBotActionIfActive(roomId);
        }
        else if (room.gameType === 'tictactoe') {
            triggerTicTacToeBotActionIfActive(roomId);
        }
        else if (room.gameType === 'sudoku') {
            triggerSudokuBotActionIfActive(roomId);
        }
        else if (room.gameType === 'chess') {
            triggerChessBotActionIfActive(roomId);
        }
        else {
            triggerBotActionIfActive(roomId);
        }
    });
    // Action Bidding
    socket.on('place-bid', ({ roomId, bid }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'PLACE_BID', playerIndex: sender.playerIndex, bid });
    });
    // Action Select Trump
    socket.on('select-trump', ({ roomId, suit }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'SELECT_TRUMP', suit });
    });
    // Action Double Decision
    socket.on('choose-double', ({ roomId, decision }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex: sender.playerIndex, decision });
    });
    // Action Play Solo/Single Mode
    socket.on('choose-single-play', ({ roomId, playSingle }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.bidWinner !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'SINGLE_PLAY_DECISION', playerIndex: sender.playerIndex, playSingle });
    });
    // Action Play Card
    socket.on('play-card', ({ roomId, card }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'PLAY_CARD', playerIndex: sender.playerIndex, card });
    });
    // Action Request Reveal Trump
    socket.on('reveal-trump', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        if (!sender || gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'REVEAL_TRUMP', playerIndex: sender.playerIndex });
    });
    // Action Next Round Rotation
    socket.on('next-round', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType === 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        const gameState = room.gameState;
        // Any real player can request next round in round_end
        if (!sender || gameState.gamePhase !== 'round_end')
            return;
        processAction(roomId, { type: 'NEXT_ROUND' });
    });
    // Ludo Action: Roll Dice
    socket.on('ludo-roll-dice', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processLudoAction(roomId, { type: 'ROLL_DICE', playerIndex: sender.playerIndex });
    });
    // Ludo Action: Move Token
    socket.on('ludo-move-token', ({ roomId, tokenId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processLudoAction(roomId, { type: 'MOVE_TOKEN', playerIndex: sender.playerIndex, tokenId });
    });
    // Ludo Action: Reset Game
    socket.on('ludo-reset', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'ludo')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || !sender.isHost)
            return;
        processLudoAction(roomId, { type: 'RESET_LUDO' });
    });
    // Tic Tac Toe Action: Make Move
    socket.on('tictactoe-make-move', ({ roomId, cellIndex }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'tictactoe')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processTicTacToeAction(roomId, { type: 'MAKE_MOVE', playerIndex: sender.playerIndex, cellIndex });
    });
    // Tic Tac Toe Action: Reset Game
    socket.on('tictactoe-reset', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'tictactoe')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || !sender.isHost)
            return;
        processTicTacToeAction(roomId, { type: 'RESET_TICTACTOE' });
    });
    // Sudoku Action: Make Move
    socket.on('sudoku-make-move', ({ roomId, cellIndex, digit }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'sudoku')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processSudokuAction(roomId, { type: 'MAKE_MOVE', playerIndex: sender.playerIndex, cellIndex, digit });
    });
    // Sudoku Action: Reset Game
    socket.on('sudoku-reset', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'sudoku')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || !sender.isHost)
            return;
        processSudokuAction(roomId, { type: 'RESET_SUDOKU' });
    });
    // Chess Action: Make Move
    socket.on('chess-make-move', ({ roomId, from, to, promotion }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'chess')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processChessAction(roomId, { type: 'MAKE_MOVE', playerIndex: sender.playerIndex, from, to, promotion });
    });
    // Chess Action: Reset Game
    socket.on('chess-reset', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState || room.gameType !== 'chess')
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || !sender.isHost)
            return;
        processChessAction(roomId, { type: 'RESET_CHESS' });
    });
    // Leave Room
    socket.on('leave-room', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIdx === -1)
            return;
        const player = room.players[playerIdx];
        // Cancel lobby disconnect timer if active
        if (player.sessionToken && lobbyDisconnectTimers.has(player.sessionToken)) {
            clearTimeout(lobbyDisconnectTimers.get(player.sessionToken));
            lobbyDisconnectTimers.delete(player.sessionToken);
            console.log(`[Leave] Cancelled lobby disconnect timer for player ${player.name}`);
        }
        if (!room.gameState) {
            // Game has not started: remove immediately
            room.players.splice(playerIdx, 1);
            console.log(`Player ${player.name} left room lobby ${roomId} explicitly`);
            socket.leave(roomId);
            if (room.players.length === 0) {
                rooms.delete(roomId);
                if (turnTimers.has(roomId)) {
                    clearTimeout(turnTimers.get(roomId));
                    turnTimers.delete(roomId);
                }
                console.log(`Deleted empty room lobby ${roomId}`);
            }
            else {
                // If host left, assign new host
                if (player.isHost) {
                    room.players[0].isHost = true;
                    room.players[0].isReady = true;
                }
                // Re-index remaining players
                room.players.forEach((p, idx) => {
                    p.playerIndex = idx;
                });
                broadcastRoomUpdate(roomId);
            }
        }
        else {
            // Game is in progress: replace with bot (existing logic)
            console.log(`Player ${player.name} left room ${roomId} mid-game explicitly. Replacing with Bot.`);
            player.isBot = true;
            player.name = `${player.name} (Player)`;
            player.socketId = `bot_${player.playerIndex}`;
            socket.leave(roomId);
            // Verify if all players are bots now
            const allBots = room.players.every(p => p.isBot);
            if (allBots) {
                rooms.delete(roomId);
                if (turnTimers.has(roomId)) {
                    clearTimeout(turnTimers.get(roomId));
                    turnTimers.delete(roomId);
                }
                console.log(`Deleted room ${roomId} as all players are bots.`);
            }
            else {
                broadcastRoomUpdate(roomId);
                broadcastGameUpdate(roomId);
                // Clear turn timer since they are replaced with a bot (bots act immediately)
                resetTurnTimer(roomId);
                // Trigger bot turn if it was their turn
                const activePlayerIndex = room.gameType === 'ludo'
                    ? room.gameState.activePlayer
                    : room.gameType === 'tictactoe'
                        ? room.gameState.activePlayer
                        : room.gameType === 'sudoku'
                            ? room.gameState.activePlayer
                            : room.gameType === 'chess'
                                ? room.gameState.activePlayer
                                : room.gameState.activePlayer;
                if (activePlayerIndex === player.playerIndex) {
                    if (room.gameType === 'ludo') {
                        triggerLudoBotActionIfActive(roomId);
                    }
                    else if (room.gameType === 'tictactoe') {
                        triggerTicTacToeBotActionIfActive(roomId);
                    }
                    else if (room.gameType === 'sudoku') {
                        triggerSudokuBotActionIfActive(roomId);
                    }
                    else if (room.gameType === 'chess') {
                        triggerChessBotActionIfActive(roomId);
                    }
                    else {
                        triggerBotActionIfActive(roomId);
                    }
                }
            }
        }
    });
    // Reconnect Player to active session
    socket.on('reconnect-player', ({ roomId, sessionToken }) => {
        const room = rooms.get(roomId);
        if (!room) {
            socket.emit('reconnect-failed', { message: 'Room not found.' });
            return;
        }
        const player = room.players.find(p => p.sessionToken === sessionToken);
        if (!player) {
            socket.emit('reconnect-failed', { message: 'Session not found for this room.' });
            return;
        }
        // Cancel lobby disconnect timer if active
        if (lobbyDisconnectTimers.has(sessionToken)) {
            clearTimeout(lobbyDisconnectTimers.get(sessionToken));
            lobbyDisconnectTimers.delete(sessionToken);
            console.log(`[Reconnect] Cancelled lobby disconnect timer for player ${player.name}`);
        }
        // Reconnect player by updating socketId and making human again
        player.socketId = socket.id;
        player.isBot = false;
        if (player.name.endsWith(' (Bot)')) {
            player.name = player.name.slice(0, -6); // Remove bot indicator
        }
        socket.join(roomId);
        socket.emit('reconnect-success', {
            roomId,
            playerIndex: player.playerIndex,
            sessionToken,
            gameStarted: room.gameState !== null,
        });
        console.log(`[Reconnect] Player ${player.name} reconnected to room ${roomId} (seat ${player.playerIndex})`);
        // Broadcast room and game state updates
        broadcastRoomUpdate(roomId);
        if (room.gameState) {
            broadcastGameUpdate(roomId);
        }
    });
    // Handle Disconnection
    socket.on('disconnect', () => {
        console.log(`Socket disconnected: ${socket.id}`);
        rooms.forEach((room, roomId) => {
            const playerIdx = room.players.findIndex(p => p.socketId === socket.id);
            if (playerIdx === -1)
                return;
            const player = room.players[playerIdx];
            if (!room.gameState) {
                // Game has not started: do not remove the player immediately.
                // Wait for a grace period (e.g., 10 seconds) to allow reconnect.
                if (player.sessionToken) {
                    console.log(`Player ${player.name} disconnected from lobby ${roomId}. Starting 60s grace period.`);
                    const timer = setTimeout(() => {
                        lobbyDisconnectTimers.delete(player.sessionToken);
                        // Actually remove the player now
                        const currentRoom = rooms.get(roomId);
                        if (!currentRoom)
                            return;
                        const pIdx = currentRoom.players.findIndex(p => p.sessionToken === player.sessionToken);
                        if (pIdx === -1)
                            return;
                        currentRoom.players.splice(pIdx, 1);
                        console.log(`Removed ${player.name} from room lobby ${roomId} after grace period`);
                        if (currentRoom.players.length === 0) {
                            rooms.delete(roomId);
                            console.log(`Deleted empty room lobby ${roomId}`);
                        }
                        else {
                            // If host left, assign new host
                            if (player.isHost) {
                                currentRoom.players[0].isHost = true;
                                currentRoom.players[0].isReady = true;
                            }
                            // Re-index remaining players
                            currentRoom.players.forEach((p, idx) => {
                                p.playerIndex = idx;
                            });
                            broadcastRoomUpdate(roomId);
                        }
                    }, 60000); // 60 seconds grace period
                    lobbyDisconnectTimers.set(player.sessionToken, timer);
                }
                else {
                    // Fallback if no session token
                    room.players.splice(playerIdx, 1);
                    if (room.players.length === 0) {
                        rooms.delete(roomId);
                    }
                    else {
                        if (player.isHost) {
                            room.players[0].isHost = true;
                            room.players[0].isReady = true;
                        }
                        room.players.forEach((p, idx) => {
                            p.playerIndex = idx;
                        });
                        broadcastRoomUpdate(roomId);
                    }
                }
            }
            else {
                // Game is in progress: replace disconnected human with a bot
                console.log(`Player ${player.name} left mid-game in room ${roomId}. Replacing with Bot.`);
                player.isBot = true;
                player.name = `${player.name} (Player)`;
                player.socketId = `bot_${player.playerIndex}`;
                // Verify if all players are bots now
                const allBots = room.players.every(p => p.isBot);
                if (allBots) {
                    rooms.delete(roomId);
                    if (turnTimers.has(roomId)) {
                        clearTimeout(turnTimers.get(roomId));
                        turnTimers.delete(roomId);
                    }
                    console.log(`Deleted room ${roomId} as all players are bots.`);
                }
                else {
                    // Notify other players
                    broadcastRoomUpdate(roomId);
                    broadcastGameUpdate(roomId);
                    // Clear turn timer since they are replaced with a bot (bots act immediately)
                    resetTurnTimer(roomId);
                    // Trigger bot turn if it was their turn
                    const activePlayerIndex = room.gameType === 'ludo'
                        ? room.gameState.activePlayer
                        : room.gameType === 'tictactoe'
                            ? room.gameState.activePlayer
                            : room.gameType === 'sudoku'
                                ? room.gameState.activePlayer
                                : room.gameType === 'chess'
                                    ? room.gameState.activePlayer
                                    : room.gameState.activePlayer;
                    if (activePlayerIndex === player.playerIndex) {
                        if (room.gameType === 'ludo') {
                            triggerLudoBotActionIfActive(roomId);
                        }
                        else if (room.gameType === 'tictactoe') {
                            triggerTicTacToeBotActionIfActive(roomId);
                        }
                        else if (room.gameType === 'sudoku') {
                            triggerSudokuBotActionIfActive(roomId);
                        }
                        else if (room.gameType === 'chess') {
                            triggerChessBotActionIfActive(roomId);
                        }
                        else {
                            triggerBotActionIfActive(roomId);
                        }
                    }
                }
            }
        });
    });
});
httpServer.listen(PORT, () => {
    console.log(`Gameora multiplayer server running on http://localhost:${PORT}`);
});
