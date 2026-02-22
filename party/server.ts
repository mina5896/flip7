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
  return -1;
}

function isRoundOver(state: GameState): boolean {
  return state.players.every((p) => p.busted || p.stayed);
}

function drawCard(state: GameState): Card {
  if (state.deck.length === 0) {
    state.deck = shuffleDeck(state.discard);
    state.discard = [];
  }
  return state.deck.pop()!;
}

function processCard(state: GameState, playerIndex: number, card: Card, fromFlipThree = false): { busted: boolean; flip7: boolean; savedBySecondChance: boolean } {
  const player = state.players[playerIndex];

  if (card.type === "number") {
    if (hasNumberDuplicate(player, card)) {
      // Second Chance saves from bust
      if (player.hasSecondChance) {
        player.hasSecondChance = false;
        const scCards = player.cards.filter((c) => c.type === "second_chance");
        player.cards = player.cards.filter((c) => c.type !== "second_chance");
        state.discard.push(card, ...scCards);
        if (!fromFlipThree) {
          // Normal draw: saved but you stay
          player.stayed = true;
        }
        player.roundScore = calculateRoundScore(player);
        state.lastAction = `${player.name} drew a duplicate ${card.value} but Second Chance saved them!`;
        return { busted: false, flip7: false, savedBySecondChance: true };
      }
      player.busted = true;
      player.roundScore = 0;
      player.cards.push(card);
      state.lastAction = `${player.name} drew a duplicate ${card.value} and busted!`;
      return { busted: true, flip7: false, savedBySecondChance: false };
    }

    player.cards.push(card);
    player.roundScore = calculateRoundScore(player);

    if (getUniqueNumberCount(player) >= 7) {
      player.stayed = true;
      state.lastAction = `${player.name} achieved FLIP 7! Round ends!`;
      return { busted: false, flip7: true, savedBySecondChance: false };
    }

    state.lastAction = `${player.name} drew a ${card.value}`;
    return { busted: false, flip7: false, savedBySecondChance: false };
  }

  if (card.type === "second_chance") {
    player.cards.push(card);
    if (!player.hasSecondChance) {
      player.hasSecondChance = true;
      state.lastAction = `${player.name} drew Second Chance!`;
    } else {
      state.lastAction = `${player.name} drew another Second Chance (already has one)`;
    }
    return { busted: false, flip7: false, savedBySecondChance: false };
  }

  // All other cards (freeze, flip_three, modifier, multiplier) — add to hand
  player.cards.push(card);
  player.roundScore = calculateRoundScore(player);
  state.lastAction = `${player.name} drew ${card.label}`;
  return { busted: false, flip7: false, savedBySecondChance: false };
}

function advanceTurn(state: GameState) {
  if (isRoundOver(state)) {
    endRound(state);
  } else {
    const next = getNextActivePlayerIndex(state, state.currentPlayerIndex);
    if (next === -1) {
      endRound(state);
    } else {
      state.currentPlayerIndex = next;
    }
  }
}

function endRound(state: GameState) {
  for (const player of state.players) {
    if (!player.busted) {
      player.roundScore = calculateRoundScore(player);
      player.score += player.roundScore;
    }
  }

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
  }

  state.phase = "round_end";
  state.lastAction = `Round ${state.roundNumber} complete!`;
}

function startNewRound(state: GameState) {
  state.roundNumber++;
  state.phase = "playing";

  if (state.roundNumber === 1) {
    state.deck = shuffleDeck(createDeck());
    state.discard = [];
  }

  for (const player of state.players) {
    state.discard.push(...player.cards);
    player.cards = [];
    player.roundScore = 0;
    player.busted = false;
    player.stayed = false;
    player.hasSecondChance = false;
  }

  state.currentPlayerIndex = 0;
  state.lastAction = `Round ${state.roundNumber} started!`;
}

export default class Flip7Server implements Party.Server {
  state: GameState;

  constructor(readonly room: Party.Room) {
    this.state = createInitialState("");
  }

  onConnect(conn: Party.Connection) {
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
      case "use_flip_three":
        this.handleFlipThree(sender);
        break;
      case "use_freeze":
        this.handleFreeze(sender);
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
      hasSecondChance: false,
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

    // Only current turn player can HIT
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (conn.id !== currentPlayer.id) {
      this.send(conn, { type: "error", message: "Not your turn" });
      return;
    }
    if (currentPlayer.busted || currentPlayer.stayed) return;

    const card = drawCard(this.state);
    const result = processCard(this.state, this.state.currentPlayerIndex, card);

    if (result.flip7) {
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

    advanceTurn(this.state);
    this.broadcastState();
  }

  handleStay(conn: Party.Connection) {
    if (this.state.phase !== "playing") return;

    // Only current turn player can STAY
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (conn.id !== currentPlayer.id) {
      this.send(conn, { type: "error", message: "Not your turn" });
      return;
    }
    if (currentPlayer.busted || currentPlayer.stayed) return;

    currentPlayer.stayed = true;
    currentPlayer.roundScore = calculateRoundScore(currentPlayer);
    this.state.lastAction = `${currentPlayer.name} stayed with ${currentPlayer.roundScore} points`;

    advanceTurn(this.state);
    this.broadcastState();
  }

  // Flip 3: any active player can use — draws 3 cards (or until bust). Doesn't change turn.
  handleFlipThree(conn: Party.Connection) {
    if (this.state.phase !== "playing") return;

    const playerIndex = this.state.players.findIndex((p) => p.id === conn.id);
    if (playerIndex === -1) return;
    const player = this.state.players[playerIndex];
    if (player.busted || player.stayed) return;

    this.state.lastAction = `${player.name} is flipping 3!`;

    for (let i = 0; i < 3; i++) {
      const card = drawCard(this.state);
      const result = processCard(this.state, playerIndex, card, true);

      if (result.flip7) {
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

      // Stop only if actually busted (Second Chance saves let you keep flipping)
      if (result.busted || player.busted) break;
    }

    if (isRoundOver(this.state)) {
      endRound(this.state);
    }

    this.broadcastState();
  }

  // Freeze: any active player can use — they stay immediately. Doesn't change turn.
  handleFreeze(conn: Party.Connection) {
    if (this.state.phase !== "playing") return;

    const player = this.state.players.find((p) => p.id === conn.id);
    if (!player || player.busted || player.stayed) return;

    player.stayed = true;
    player.roundScore = calculateRoundScore(player);
    this.state.lastAction = `${player.name} was frozen! They stay with ${player.roundScore} points.`;

    // If the frozen player was the current turn player, advance turn
    const currentPlayer = this.state.players[this.state.currentPlayerIndex];
    if (currentPlayer.id === player.id) {
      advanceTurn(this.state);
    } else if (isRoundOver(this.state)) {
      endRound(this.state);
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
      hasSecondChance: false,
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
