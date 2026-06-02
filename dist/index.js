"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const gameEngine_js_1 = require("./gameEngine.js");
const botAi_js_1 = require("./botAi.js");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
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
// Helper to generate unique 4-character Room ID
function generateRoomId() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
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
            const sanitized = (0, gameEngine_js_1.sanitizeStateForPlayer)(room.gameState, p.playerIndex);
            io.to(p.socketId).emit('game-update', {
                state: sanitized,
                playerIndex: p.playerIndex,
                players: room.players.map(pl => ({ name: pl.name, isBot: pl.isBot, playerIndex: pl.playerIndex })),
            });
        }
    });
}
// Helper to process game actions centrally
function processAction(roomId, action) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState)
        return;
    const playerNames = room.players.map(p => p.name);
    // Save current active player to check if it changes
    const prevActive = room.gameState.activePlayer;
    // Apply action using reducer
    room.gameState = (0, gameEngine_js_1.gameReducer)(room.gameState, action, playerNames);
    // Broadcast sanitized update
    broadcastGameUpdate(roomId);
    // Trigger bot turn if active player is a bot and turn changed or phase changed
    triggerBotActionIfActive(roomId);
}
// Trigger automatic bot actions if it is a bot's turn
function triggerBotActionIfActive(roomId) {
    const room = rooms.get(roomId);
    if (!room || !room.gameState)
        return;
    const s = room.gameState;
    const activeIdx = s.activePlayer;
    if (activeIdx < 0 || activeIdx >= 4)
        return;
    const activePlayerObj = room.players[activeIdx];
    if (!activePlayerObj || !activePlayerObj.isBot)
        return;
    // Schedule bot move with a short delay to feel human-like
    setTimeout(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || !currentRoom.gameState || currentRoom.gameState.activePlayer !== activeIdx)
            return;
        const stateRef = currentRoom.gameState;
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
    }, 1000);
}
io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    // Create Room
    socket.on('create-room', ({ name }) => {
        const roomId = generateRoomId();
        const newPlayer = {
            socketId: socket.id,
            name: name || `Player_${socket.id.slice(0, 4)}`,
            isReady: true,
            isHost: true,
            isBot: false,
            playerIndex: 0,
        };
        const room = {
            id: roomId,
            players: [newPlayer],
            gameState: null,
            botsCount: 0,
        };
        rooms.set(roomId, room);
        socket.join(roomId);
        socket.emit('room-created', { roomId, playerIndex: 0 });
        broadcastRoomUpdate(roomId);
        console.log(`Room created: ${roomId} by player ${newPlayer.name}`);
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
        if (room.players.length >= 4) {
            socket.emit('error-msg', { message: 'Room is full.' });
            return;
        }
        const playerIndex = room.players.length;
        const newPlayer = {
            socketId: socket.id,
            name: name || `Player_${socket.id.slice(0, 4)}`,
            isReady: false,
            isHost: false,
            isBot: false,
            playerIndex,
        };
        room.players.push(newPlayer);
        socket.join(cleanRoomId);
        socket.emit('room-joined', { roomId: cleanRoomId, playerIndex });
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
        for (let i = initialCount; i < 4; i++) {
            filledPlayers.push({
                socketId: `bot_${i}`,
                name: `Bot ${i}`,
                isReady: true,
                isHost: false,
                isBot: true,
                playerIndex: i,
            });
        }
        room.players = filledPlayers;
        room.botsCount = 4 - initialCount;
        // Initialize game state on server
        room.gameState = (0, gameEngine_js_1.getInitialState)();
        // Run the start action
        room.gameState = (0, gameEngine_js_1.gameReducer)(room.gameState, { type: 'START_GAME' }, room.players.map(p => p.name));
        // Inform clients that the game has started
        io.to(roomId).emit('game-started');
        // Broadcast customized game states
        broadcastGameUpdate(roomId);
        // Trigger bot action if a bot turns out to be first (though dealer 3 rotates to active 0, which might be a bot)
        triggerBotActionIfActive(roomId);
    });
    // Action Bidding
    socket.on('place-bid', ({ roomId, bid }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'PLACE_BID', playerIndex: sender.playerIndex, bid });
    });
    // Action Select Trump
    socket.on('select-trump', ({ roomId, suit }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'SELECT_TRUMP', suit });
    });
    // Action Double Decision
    socket.on('choose-double', ({ roomId, decision }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'DOUBLE_DECISION', playerIndex: sender.playerIndex, decision });
    });
    // Action Play Solo/Single Mode
    socket.on('choose-single-play', ({ roomId, playSingle }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.bidWinner !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'SINGLE_PLAY_DECISION', playerIndex: sender.playerIndex, playSingle });
    });
    // Action Play Card
    socket.on('play-card', ({ roomId, card }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'PLAY_CARD', playerIndex: sender.playerIndex, card });
    });
    // Action Request Reveal Trump
    socket.on('reveal-trump', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        if (!sender || room.gameState.activePlayer !== sender.playerIndex)
            return;
        processAction(roomId, { type: 'REVEAL_TRUMP', playerIndex: sender.playerIndex });
    });
    // Action Next Round Rotation
    socket.on('next-round', ({ roomId }) => {
        const room = rooms.get(roomId);
        if (!room || !room.gameState)
            return;
        const sender = room.players.find(p => p.socketId === socket.id);
        // Any real player can request next round in round_end
        if (!sender || room.gameState.gamePhase !== 'round_end')
            return;
        processAction(roomId, { type: 'NEXT_ROUND' });
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
                // Game has not started: simply remove the player
                room.players.splice(playerIdx, 1);
                console.log(`Removed ${player.name} from room lobby ${roomId}`);
                if (room.players.length === 0) {
                    rooms.delete(roomId);
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
                // Game is in progress: replace disconnected human with a bot
                console.log(`Player ${player.name} left mid-game in room ${roomId}. Replacing with Bot.`);
                player.isBot = true;
                player.name = `${player.name} (Bot)`;
                player.socketId = `bot_${player.playerIndex}`;
                // Verify if all players are bots now
                const allBots = room.players.every(p => p.isBot);
                if (allBots) {
                    rooms.delete(roomId);
                    console.log(`Deleted room ${roomId} as all players are bots.`);
                }
                else {
                    // Notify other players
                    broadcastRoomUpdate(roomId);
                    broadcastGameUpdate(roomId);
                    // Trigger bot turn if it was their turn
                    if (room.gameState.activePlayer === player.playerIndex) {
                        triggerBotActionIfActive(roomId);
                    }
                }
            }
        });
    });
});
httpServer.listen(PORT, () => {
    console.log(`Gameora multiplayer server running on http://localhost:${PORT}`);
});
