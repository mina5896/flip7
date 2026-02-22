import type * as Party from "partykit/server";
import type { ClientMessage, GameState, Player, Card, ServerMessage } from "./types";
import { createDeck, shuffleDeck } from "./deck";

function createInitialState(hostId: string): GameState {
  return {
    phase: "lobby",
    players: [],
    currentPlayerIndex: 0,
    deck: [],
    discard: [],
    roundNumber: 0,
    hostId,
    targetScore: 200,
    lastAction: null,
    winner: null,
  };
}

function calculateRoundScore(player: Player): number {
  const numberCards = player.cards.filter((c) => c.type === "number");
  const modifiers = player.cards.filter((c) => c.type === "modifier");
  const hasMultiplier = player.cards.some((c) => c.type === "multiplier");

  let numberSum = numberCards.reduce((sum, c) => sum + c.value, 0);

  if (hasMultiplier) {
    numberSum *= 2;
  }

  const modifierSum = modifiers.reduce((sum, c) => sum + c.value, 0);

  // Flip 7 bonus: 15 points if you have 7 unique number cards
  const uniqueNumbers = new Set(numberCards.map((c) => c.value));
  const flip7Bonus = uniqueNumbers.size >= 7 ? 15 : 0;

  return numberSum + modifierSum + flip7Bonus;
}

function getUniqueNumberCount(player: Player): number {
  const numberCards = player.cards.filter((c) => c.type === "number");
  return new Set(numberCards.map((c) => c.value)).size;
}

function hasNumberDuplicate(player: Player, card: Card): boolean {
  if (card.type !== "number") return false;
  return player.cards.some((c) => c.type === "number" && c.value === card.value);
}

function getNextActivePlayerIndex(state: GameState, fromIndex: number): number {
  const { players } = state;
  const count = players.length;
  for (let i = 1; i <= count; i++) {
    const idx = (fromIndex + i) % count;
    const p = players[idx];
    if (!p.busted && !p.stayed) {
      return idx;
    }
  }
  return -1; // No active players
}

function isRoundOver(state: GameState): boolean {
  return state.players.every((p) => p.busted || p.stayed);
}

function drawCard(state: GameState): Card {
  if (state.deck.length === 0) {
    // Reshuffle discard pile into deck
    state.deck = shuffleDeck(state.discard);
    state.discard = [];
  }
  return state.deck.pop()!;
}

function processCard(state: GameState, playerIndex: number, card: Card): { busted: boolean; flip7: boolean } {
  const player = state.players[playerIndex];

  if (card.type === "number") {
    // Check for duplicate → bust
    if (hasNumberDuplicate(player, card)) {
      player.busted = true;
      player.roundScore = 0;
      player.cards.push(card);
      state.lastAction = `${player.name} drew a duplicate ${card.value} and busted!`;
      return { busted: true, flip7: false };
    }

    player.cards.push(card);
    player.roundScore = calculateRoundScore(player);

    // Check for Flip 7
    if (getUniqueNumberCount(player) >= 7) {
      player.stayed = true;
      state.lastAction = `${player.name} achieved FLIP 7! Round ends!`;
      return { busted: false, flip7: true };
    }

    state.lastAction = `${player.name} drew a ${card.value}`;
    return { busted: false, flip7: false };
  }

  // Action cards (freeze, flip_three, second_chance) — just add to hand, players handle effects themselves
  // Modifier and multiplier cards — add to hand and update score
  player.cards.push(card);
  player.roundScore = calculateRoundScore(player);
  state.lastAction = `${player.name} drew ${card.label}`;
  return { busted: false, flip7: false };
}

function endRound(state: GameState) {
  // Finalize scores
  for (const player of state.players) {
    if (!player.busted) {
      player.roundScore = calculateRoundScore(player);
      player.score += player.roundScore;
    }
  }

  // Check for game over
  const playersOver200 = state.players.filter((p) => p.score >= state.targetScore);
  if (playersOver200.length > 0) {
    const maxScore = Math.max(...state.players.map((p) => p.score));
    const winners = state.players.filter((p) => p.score === maxScore);
    if (winners.length === 1) {
      state.winner = winners[0].id;
      state.phase = "game_over";
      state.lastAction = `${winners[0].name} wins with ${winners[0].score} points!`;
      return;
    }
    // Tie at 200+ - continue playing
  }

  state.phase = "round_end";
  state.lastAction = `Round ${state.roundNumber} complete!`;
}

function startNewRound(state: GameState) {
  state.roundNumber++;
  state.phase = "playing";
  // On first round, create and shuffle the deck
  if (state.roundNumber === 1) {
    state.deck = shuffleDeck(createDeck());
    state.discard = [];
  }

  // Discard all player cards from previous round
  for (const player of state.players) {
    state.discard.push(...player.cards);
    player.cards = [];
    player.roundScore = 0;
    player.busted = false;
    player.stayed = false;
  }

  // Deal first card to each player
  for (const player of state.players) {
    const card = drawCard(state);
    processCard(state, state.players.indexOf(player), card);
  }

  state.currentPlayerIndex = 0;
  state.lastAction = `Round ${state.roundNumber} started! Each player got their first card.`;
}

export default class Flip7Server implements Party.Server {
  state: GameState;

  constructor(readonly room: Party.Room) {
    this.state = createInitialState("");
  }

  onConnect(conn: Party.Connection) {
    // Send current state to the connecting player
    this.send(conn, { type: "state", state: this.state });
  }

  onClose(conn: Party.Connection) {
    const player = this.state.players.find((p) => p.id === conn.id);
    if (player) {
      player.connected = false;
      this.broadcastState();
    }
  }

  onMessage(message: string, sender: Party.Connection) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(message);
    } catch {
      return;
    }

    switch (msg.type) {
      case "join":
        this.handleJoin(sender, msg.name);
        break;
      case "start_game":
        this.handleStartGame(sender);
        break;
      case "hit":
        this.handleHit(sender);
        break;
      case "stay":
        this.handleStay(sender);
        break;
      case "new_round":
        this.handleNewRound(sender);
        break;
      case "restart":
        this.handleRestart(sender);
        break;
    }
  }

  handleJoin(conn: Party.Connection, name: string) {
    if (this.state.phase !== "lobby") {
      // Allow reconnection during game
      const existing = this.state.players.find((p) => p.name === name);
      if (existing) {
        existing.id = conn.id;
        existing.connected = true;
        this.broadcastState();
        return;
      }
      this.send(conn, { type: "error", message: "Game already in progress" });
      return;
    }

    if (this.state.players.some((p) => p.name === name)) {
      this.send(conn, { type: "error", message: "Name already taken" });
      return;
    }

    if (this.state.players.length === 0) {
      this.state.hostId = conn.id;
    }

    this.state.players.push({
      id: conn.id,
      name,
      cards: [],
      score: 0,
      roundScore: 0,
      busted: false,
      stayed: false,
      connected: true,
    });

    this.state.lastAction = `${name} joined the game!`;
    this.broadcastState();
  }

  handleStartGame(conn: Party.Connection) {
    if (conn.id !== this.state.hostId) {
      this.send(conn, { type: "error", message: "Only the host can start" });
      return;
    }
    if (this.state.players.length < 2) {
      this.send(conn, { type: "error", message: "Need at least 2 players" });
      return;
    }

    startNewRound(this.state);
    this.broadcastState();
  }

  handleHit(conn: Party.Connection) {
    if (this.state.phase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === conn.id);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];
    if (player.busted || player.stayed) return;

    const card = drawCard(this.state);
    const result = processCard(this.state, playerIndex, card);

    if (result.flip7) {
      // Round ends immediately - all non-busted players who haven't stayed get to keep their cards
      for (const p of this.state.players) {
        if (!p.busted && !p.stayed) {
          p.stayed = true;
          p.roundScore = calculateRoundScore(p);
        }
      }
      endRound(this.state);
      this.broadcastState();
      return;
    }

    if (isRoundOver(this.state)) {
      endRound(this.state);
    } else {
      // Move to next player
      const next = getNextActivePlayerIndex(this.state, this.state.currentPlayerIndex);
      if (next === -1) {
        endRound(this.state);
      } else {
        this.state.currentPlayerIndex = next;
      }
    }

    this.broadcastState();
  }

  handleStay(conn: Party.Connection) {
    if (this.state.phase !== "playing") return;

    const player = this.state.players.find((p) => p.id === conn.id);
    if (!player || player.busted || player.stayed) return;

    player.stayed = true;
    player.roundScore = calculateRoundScore(player);
    this.state.lastAction = `${player.name} stayed with ${player.roundScore} points`;

    if (isRoundOver(this.state)) {
      endRound(this.state);
    } else {
      const next = getNextActivePlayerIndex(this.state, this.state.currentPlayerIndex);
      if (next === -1) {
        endRound(this.state);
      } else {
        this.state.currentPlayerIndex = next;
      }
    }

    this.broadcastState();
  }

  handleNewRound(conn: Party.Connection) {
    if (this.state.phase !== "round_end") return;
    if (conn.id !== this.state.hostId) {
      this.send(conn, { type: "error", message: "Only the host can advance" });
      return;
    }
    startNewRound(this.state);
    this.broadcastState();
  }

  handleRestart(conn: Party.Connection) {
    if (conn.id !== this.state.hostId) return;
    const players = this.state.players.map((p) => ({
      ...p,
      cards: [],
      score: 0,
      roundScore: 0,
      busted: false,
      stayed: false,
    }));
    const hostId = this.state.hostId;
    this.state = createInitialState(hostId);
    this.state.players = players;
    this.state.phase = "lobby";
    this.state.lastAction = "Game restarted!";
    this.broadcastState();
  }

  send(conn: Party.Connection, msg: ServerMessage) {
    conn.send(JSON.stringify(msg));
  }

  broadcastState() {
    this.room.broadcast(JSON.stringify({ type: "state", state: this.state }));
  }
}

Flip7Server satisfies Party.Worker;
