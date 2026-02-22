// Flip 7 Game Types

export type CardType = "number" | "freeze" | "flip_three" | "second_chance" | "modifier" | "multiplier";

export interface Card {
  id: string;
  type: CardType;
  value: number; // number cards: 0-12, modifiers: +2/+4/+6/+8/+10, multiplier: 2
  label: string;
}

export interface Player {
  id: string;
  name: string;
  cards: Card[];
  score: number; // cumulative score across rounds
  roundScore: number;
  busted: boolean;
  stayed: boolean;
  hasSecondChance: boolean;
  connected: boolean;
}

export type GamePhase = "lobby" | "playing" | "round_end" | "game_over";

export interface GameState {
  phase: GamePhase;
  players: Player[];
  currentPlayerIndex: number;
  deck: Card[];
  discard: Card[];
  roundNumber: number;
  hostId: string;
  targetScore: number;
  lastAction: string | null;
  winner: string | null;
}

// Messages from client to server
export type ClientMessage =
  | { type: "join"; name: string }
  | { type: "start_game" }
  | { type: "hit" }
  | { type: "stay" }
  | { type: "use_flip_three" } // draw 3 cards for yourself (someone played Flip 3 on you)
  | { type: "use_freeze" } // freeze/stay yourself (someone played Freeze on you)
  | { type: "new_round" }
  | { type: "restart" };

// Messages from server to client
export type ServerMessage =
  | { type: "state"; state: GameState }
  | { type: "error"; message: string };
