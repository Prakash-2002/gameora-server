"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getGlobalTileIndex = exports.LUDO_SAFE_TILES = exports.LUDO_START_TILES = exports.LUDO_COLORS = void 0;
exports.LUDO_COLORS = ['red', 'green', 'yellow', 'blue'];
exports.LUDO_START_TILES = [0, 13, 26, 39];
exports.LUDO_SAFE_TILES = [0, 8, 13, 21, 26, 34, 39, 47];
const getGlobalTileIndex = (playerIndex, pathPosition) => {
    if (pathPosition < 0 || pathPosition > 50)
        return -1;
    return (pathPosition + playerIndex * 13) % 52;
};
exports.getGlobalTileIndex = getGlobalTileIndex;
