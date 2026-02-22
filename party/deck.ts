import type { Card } from "./types";

let cardIdCounter = 0;

function makeCard(type: Card["type"], value: number, label: string): Card {
  return { id: `card-${cardIdCounter++}`, type, value, label };
}

export function createDeck(): Card[] {
  cardIdCounter = 0;
  const cards: Card[] = [];

  // Number cards: each number N has N copies (except 0 and 1 which have 1 each)
  // 0: 1 card, 1: 1 card, 2: 2 cards, 3: 3 cards, ... 12: 12 cards = 79 cards
  for (let n = 0; n <= 12; n++) {
    const count = n === 0 ? 1 : n;
    for (let i = 0; i < count; i++) {
      cards.push(makeCard("number", n, `${n}`));
    }
  }

  // Action cards: 3 each
  for (let i = 0; i < 3; i++) {
    cards.push(makeCard("freeze", 0, "Freeze!"));
    cards.push(makeCard("flip_three", 0, "Flip 3!"));
    cards.push(makeCard("second_chance", 0, "2nd Chance"));
  }

  // Modifier cards: +2, +4, +6, +8, +8, +10 (6 cards)
  cards.push(makeCard("modifier", 2, "+2"));
  cards.push(makeCard("modifier", 4, "+4"));
  cards.push(makeCard("modifier", 6, "+6"));
  cards.push(makeCard("modifier", 8, "+8"));
  cards.push(makeCard("modifier", 8, "+8"));
  cards.push(makeCard("modifier", 10, "+10"));

  // Multiplier: x2 (1 card)
  cards.push(makeCard("multiplier", 2, "x2"));

  return cards;
}

export function shuffleDeck(deck: Card[]): Card[] {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
