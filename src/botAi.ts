import { Card, Suit, Trick, Play } from './types.js';

const getPartnerIndex = (playerIndex: number): number => {
  return (playerIndex + 2) % 4;
};

const isPartner = (playerIndex: number, botIndex: number): boolean => {
  return getPartnerIndex(botIndex) === playerIndex;
};

export const decideBid = (
  hand: Card[],
  currentBid: number,
  botIndex: number,
  bidWinner: number | null
): number | 'pass' => {
  // Assessment of first 4 cards
  let evaluationScore = 0;
  const suitCounts: Record<Suit, number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };

  for (const card of hand) {
    suitCounts[card.suit]++;
    if (card.rank === 'J') evaluationScore += 3.5;
    else if (card.rank === '9') evaluationScore += 2.5;
    else if (card.rank === 'A') evaluationScore += 1.5;
    else if (card.rank === '10') evaluationScore += 1.0;
  }

  for (const suit of Object.keys(suitCounts) as Suit[]) {
    const count = suitCounts[suit];
    if (count >= 3) evaluationScore += 2.0;
    else if (count === 2) evaluationScore += 0.5;
  }

  let maxComfortableBid = 0;
  if (evaluationScore >= 8) {
    maxComfortableBid = 20;
  } else if (evaluationScore >= 6.5) {
    maxComfortableBid = 18;
  } else if (evaluationScore >= 5) {
    maxComfortableBid = 16;
  } else if (evaluationScore >= 3.5) {
    maxComfortableBid = 14;
  }

  const minBidToMake = currentBid === 0 ? 14 : currentBid + 1;

  if (bidWinner !== null && isPartner(bidWinner, botIndex)) {
    if (evaluationScore < 8.5) {
      return 'pass';
    }
  }

  if (minBidToMake <= maxComfortableBid && minBidToMake <= 28) {
    return minBidToMake;
  }

  return 'pass';
};

export const decideTrumpSuit = (hand: Card[]): Suit => {
  const suitScores: Record<Suit, number> = { spades: 0, hearts: 0, diamonds: 0, clubs: 0 };

  for (const card of hand) {
    let cardScore = 1;
    if (card.rank === 'J') cardScore = 5;
    else if (card.rank === '9') cardScore = 4;
    else if (card.rank === 'A') cardScore = 3;
    else if (card.rank === '10') cardScore = 2;

    suitScores[card.suit] += cardScore;
  }

  let bestSuit: Suit = 'spades';
  let maxScore = -1;

  for (const suit of Object.keys(suitScores) as Suit[]) {
    if (suitScores[suit] > maxScore) {
      maxScore = suitScores[suit];
      bestSuit = suit;
    }
  }

  return bestSuit;
};

export const decidePlayCard = (
  hand: Card[],
  currentTrick: Trick,
  isTrumpRevealed: boolean,
  trumpSuitSecret: Suit | null,
  botIndex: number
): { card: Card; requestReveal: boolean } => {
  const { plays, leadSuit } = currentTrick;

  if (plays.length === 0 || !leadSuit) {
    let bestCard = hand[0];
    for (const card of hand) {
      if (card.rankValue > bestCard.rankValue) {
        bestCard = card;
      }
    }
    return { card: bestCard, requestReveal: false };
  }

  const followSuitCards = hand.filter(c => c.suit === leadSuit);
  let winningPlay: Play | null = null;
  let winningCardIsTrump = false;

  const isPlayTrumpCard = (card: Card): boolean => {
    return isTrumpRevealed && trumpSuitSecret !== null && card.suit === trumpSuitSecret;
  };

  for (let i = 0; i < plays.length; i++) {
    const play = plays[i];
    if (i === 0) {
      winningPlay = play;
      winningCardIsTrump = isPlayTrumpCard(play.card);
      continue;
    }

    const currentIsTrump = isPlayTrumpCard(play.card);
    if (currentIsTrump) {
      if (!winningCardIsTrump) {
        winningPlay = play;
        winningCardIsTrump = true;
      } else if (play.card.rankValue > winningPlay!.card.rankValue) {
        winningPlay = play;
      }
    } else if (!winningCardIsTrump) {
      if (play.card.suit === leadSuit && play.card.rankValue > winningPlay!.card.rankValue) {
        winningPlay = play;
      }
    }
  }

  const partnerIsWinning = winningPlay !== null && isPartner(winningPlay.playerIndex, botIndex);

  if (followSuitCards.length > 0) {
    if (partnerIsWinning) {
      let lowestCard = followSuitCards[0];
      for (const card of followSuitCards) {
        if (card.rankValue < lowestCard.rankValue) {
          lowestCard = card;
        }
      }
      return { card: lowestCard, requestReveal: false };
    } else {
      if (!winningCardIsTrump && winningPlay !== null) {
        const winningRankVal = winningPlay.card.rankValue;
        const winningCards = followSuitCards.filter(c => c.rankValue > winningRankVal);
        if (winningCards.length > 0) {
          let lowestWinner = winningCards[0];
          for (const card of winningCards) {
            if (card.rankValue < lowestWinner.rankValue) {
              lowestWinner = card;
            }
          }
          return { card: lowestWinner, requestReveal: false };
        }
      }

      let lowestCard = followSuitCards[0];
      for (const card of followSuitCards) {
        if (card.rankValue < lowestCard.rankValue) {
          lowestCard = card;
        }
      }
      return { card: lowestCard, requestReveal: false };
    }
  }

  if (!isTrumpRevealed) {
    return { card: hand[0], requestReveal: true };
  }

  const trumpCards = trumpSuitSecret ? hand.filter(c => c.suit === trumpSuitSecret) : [];

  if (trumpCards.length > 0) {
    if (partnerIsWinning) {
      const nonTrumpCards = hand.filter(c => c.suit !== trumpSuitSecret);
      if (nonTrumpCards.length > 0) {
        let lowestNonTrump = nonTrumpCards[0];
        for (const card of nonTrumpCards) {
          if (card.rankValue < lowestNonTrump.rankValue) {
            lowestNonTrump = card;
          }
        }
        return { card: lowestNonTrump, requestReveal: false };
      }
    } else {
      if (winningCardIsTrump && winningPlay !== null) {
        const winningTrumpVal = winningPlay.card.rankValue;
        const higherTrumps = trumpCards.filter(c => c.rankValue > winningTrumpVal);
        if (higherTrumps.length > 0) {
          let lowestWinTrump = higherTrumps[0];
          for (const card of higherTrumps) {
            if (card.rankValue < lowestWinTrump.rankValue) {
              lowestWinTrump = card;
            }
          }
          return { card: lowestWinTrump, requestReveal: false };
        }
      } else {
        let lowestTrump = trumpCards[0];
        for (const card of trumpCards) {
          if (card.rankValue < lowestTrump.rankValue) {
            lowestTrump = card;
          }
        }
        return { card: lowestTrump, requestReveal: false };
      }
    }

    const nonTrumpCards = hand.filter(c => c.suit !== trumpSuitSecret);
    if (nonTrumpCards.length > 0) {
      let lowestNonTrump = nonTrumpCards[0];
      for (const card of nonTrumpCards) {
        if (card.rankValue < lowestNonTrump.rankValue) {
          lowestNonTrump = card;
        }
      }
      return { card: lowestNonTrump, requestReveal: false };
    } else {
      let lowestTrump = trumpCards[0];
      for (const card of trumpCards) {
        if (card.rankValue < lowestTrump.rankValue) {
          lowestTrump = card;
        }
      }
      return { card: lowestTrump, requestReveal: false };
    }
  }

  let lowestCard = hand[0];
  for (const card of hand) {
    if (card.rankValue < lowestCard.rankValue) {
      lowestCard = card;
    }
  }
  return { card: lowestCard, requestReveal: false };
};
