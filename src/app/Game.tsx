"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { GameState, ServerMessage, Card, Player } from "../../party/types";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

function CardChip({ card, isNew }: { card: Card; isNew?: boolean }) {
  const colorMap: Record<string, string> = {
    number: "bg-slate-700 border-slate-500",
    freeze: "bg-cyan-900 border-cyan-500",
    flip_three: "bg-orange-900 border-orange-500",
    second_chance: "bg-green-900 border-green-500",
    modifier: "bg-yellow-900 border-yellow-500",
    multiplier: "bg-pink-900 border-pink-500",
  };

  return (
    <div
      className={`inline-flex items-center justify-center w-10 h-14 rounded-lg border-2 text-xs font-bold shrink-0 ${colorMap[card.type] || "bg-slate-700 border-slate-500"} ${isNew ? "card-enter" : ""}`}
      title={card.type === "number" ? `Number ${card.value}` : card.label}
    >
      {card.type === "number" ? (
        <span className="text-base">{card.value}</span>
      ) : (
        <span className="text-[9px] leading-tight text-center px-0.5">{card.label}</span>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  isCurrentTurn,
  isYou,
  gamePhase,
}: {
  player: Player;
  isCurrentTurn: boolean;
  isYou: boolean;
  gamePhase: string;
}) {
  const borderColor = player.busted
    ? "border-red-500/50"
    : player.stayed
      ? "border-slate-600"
      : isCurrentTurn
        ? "border-blue-400 pulse-glow"
        : "border-slate-700";

  return (
    <div
      className={`rounded-xl border-2 p-2.5 ${borderColor} ${isYou ? "bg-slate-800/80" : "bg-slate-800/40"} ${player.busted ? "bust-shake" : ""} transition-all min-w-[140px] flex-1`}
    >
      {/* Name + status row */}
      <div className="flex items-center justify-between mb-1.5">
        <span className={`text-sm font-semibold truncate ${isYou ? "text-blue-300" : "text-slate-200"}`}>
          {player.name}{isYou ? " (you)" : ""}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {player.hasSecondChance && <span className="text-green-400 text-xs" title="Second Chance">SC</span>}
          {!player.connected && <span className="text-red-400 text-[10px]">OFF</span>}
          {player.busted && <span className="text-red-400 text-[10px] font-bold">BUST</span>}
          {player.stayed && !player.busted && <span className="text-yellow-400 text-[10px]">STAYED</span>}
          {isCurrentTurn && !player.busted && !player.stayed && <span className="text-blue-400 text-[10px]">TURN</span>}
        </div>
      </div>

      {/* Score */}
      <div className="flex items-center gap-2 mb-1.5 text-xs">
        {gamePhase === "playing" && !player.busted && (
          <span className="text-yellow-300 font-mono font-bold">{player.roundScore} pts</span>
        )}
        <span className="text-slate-500 font-mono">Total: {player.score}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-wrap gap-1">
        {player.cards.map((card, i) => (
          <CardChip key={card.id} card={card} isNew={i === player.cards.length - 1} />
        ))}
        {player.cards.length === 0 && (
          <span className="text-slate-600 text-xs italic">No cards</span>
        )}
      </div>
    </div>
  );
}

export default function Game({ roomId, playerName }: { roomId: string; playerName: string }) {
  const [state, setState] = useState<GameState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<PartySocket | null>(null);
  const [copied, setCopied] = useState(false);

  const send = useCallback((msg: object) => {
    socketRef.current?.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    const socket = new PartySocket({
      host: PARTYKIT_HOST,
      room: roomId,
    });

    const joinOnOpen = () => {
      socket.send(JSON.stringify({ type: "join", name: playerName }));
    };
    socket.addEventListener("open", joinOnOpen);

    socket.addEventListener("message", (event) => {
      const msg: ServerMessage = JSON.parse(event.data);
      if (msg.type === "state") {
        setState(msg.state);
        setError(null);
      } else if (msg.type === "error") {
        setError(msg.message);
        setTimeout(() => setError(null), 3000);
      }
    });

    socketRef.current = socket;

    return () => {
      socket.removeEventListener("open", joinOnOpen);
      socket.close();
    };
  }, [roomId, playerName, send]);

  function copyRoomCode() {
    navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!state) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-lg">Connecting...</div>
      </div>
    );
  }

  const me = state.players.find((p) => p.name === playerName);
  const isHost = me?.id === state.hostId;
  const isMyTurn =
    state.phase === "playing" &&
    me &&
    state.players[state.currentPlayerIndex]?.id === me.id;
  const isActive = state.phase === "playing" && me && !me.busted && !me.stayed;

  return (
    <div className="min-h-screen p-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            FLIP 7
          </h1>
          <span className="text-slate-500 text-sm">Round {state.roundNumber || "-"}</span>
        </div>
        <button
          onClick={copyRoomCode}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
        >
          <span className="text-slate-400 text-xs">Room:</span>
          <span className="font-mono font-bold tracking-widest text-white text-sm">{roomId}</span>
          <span className="text-[10px] text-slate-500">{copied ? "Copied!" : "Copy"}</span>
        </button>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mb-3 p-2.5 bg-red-900/50 border border-red-500/50 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Last action */}
      {state.lastAction && (
        <div className="mb-3 p-2.5 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-300 text-sm text-center">
          {state.lastAction}
        </div>
      )}

      {/* Lobby */}
      {state.phase === "lobby" && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
          <h2 className="text-xl font-semibold">Waiting for players...</h2>
          <div className="flex flex-wrap justify-center gap-3">
            {state.players.map((p) => (
              <div key={p.id} className="bg-slate-700 px-4 py-2 rounded-xl text-sm font-medium">
                {p.name}
                {p.id === state.hostId && <span className="ml-1.5 text-yellow-400 text-xs">HOST</span>}
              </div>
            ))}
          </div>
          <p className="text-slate-500 text-sm">
            Share the room code <strong className="text-white font-mono">{roomId}</strong> with your friends
          </p>
          {isHost && (
            <button
              onClick={() => send({ type: "start_game" })}
              disabled={state.players.length < 2}
              className="px-8 py-3 bg-green-600 hover:bg-green-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed text-lg"
            >
              Start Game {state.players.length < 2 ? "(need 2+ players)" : ""}
            </button>
          )}
          {!isHost && <p className="text-slate-500 text-sm">Waiting for host to start...</p>}
        </div>
      )}

      {/* Game Board */}
      {(state.phase === "playing" || state.phase === "round_end" || state.phase === "game_over") && (
        <div className="space-y-3">
          {/* Player cards grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {state.players.map((p) => (
              <PlayerCard
                key={p.id}
                player={p}
                isCurrentTurn={state.players[state.currentPlayerIndex]?.id === p.id}
                isYou={p.name === playerName}
                gamePhase={state.phase}
              />
            ))}
          </div>

          {/* Action buttons */}
          {state.phase === "playing" && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4">
              {/* Main HIT/STAY — turn-based */}
              <div className="flex justify-center gap-3 mb-3">
                <button
                  onClick={() => send({ type: "hit" })}
                  disabled={!isMyTurn || me?.busted || me?.stayed}
                  className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-blue-600/20"
                >
                  HIT
                </button>
                <button
                  onClick={() => send({ type: "stay" })}
                  disabled={!isMyTurn || me?.busted || me?.stayed}
                  className="px-8 py-3 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold text-lg rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed shadow-lg shadow-amber-600/20"
                >
                  STAY
                </button>
              </div>

              {/* Status text */}
              {!isActive && (
                <p className="text-center text-slate-500 text-xs mb-3">
                  {me?.busted ? "You busted this round" : me?.stayed ? "You're locked in" : ""}
                </p>
              )}
              {isActive && !isMyTurn && (
                <p className="text-center text-slate-400 text-xs mb-3">
                  Waiting for {state.players[state.currentPlayerIndex]?.name}&apos;s turn...
                </p>
              )}

              {/* Action card buttons — always available to active players */}
              <div className="flex justify-center gap-3 pt-2 border-t border-slate-700/50">
                <button
                  onClick={() => send({ type: "use_flip_three" })}
                  disabled={!isActive}
                  className="px-5 py-2 bg-orange-700 hover:bg-orange-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Flip 3
                </button>
                <button
                  onClick={() => send({ type: "use_freeze" })}
                  disabled={!isActive}
                  className="px-5 py-2 bg-cyan-700 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold text-sm rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
                >
                  Freeze
                </button>
              </div>
            </div>
          )}

          {/* Round end */}
          {state.phase === "round_end" && (
            <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
              <h2 className="text-xl font-semibold">Round {state.roundNumber} Complete!</h2>
              <div className="space-y-1">
                {state.players
                  .slice()
                  .sort((a, b) => b.roundScore - a.roundScore)
                  .map((p) => (
                    <div key={p.id} className="flex items-center justify-between text-sm px-4">
                      <span className={p.busted ? "text-red-400 line-through" : "text-slate-300"}>
                        {p.name}
                      </span>
                      <span className={p.busted ? "text-red-400" : "text-green-400 font-bold"}>
                        {p.busted ? "BUST" : `+${p.roundScore}`}
                      </span>
                    </div>
                  ))}
              </div>
              {isHost && (
                <button
                  onClick={() => send({ type: "new_round" })}
                  className="px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Next Round
                </button>
              )}
              {!isHost && <p className="text-slate-500 text-sm">Waiting for host...</p>}
            </div>
          )}

          {/* Game over */}
          {state.phase === "game_over" && (
            <div className="bg-gradient-to-br from-yellow-900/30 to-purple-900/30 border border-yellow-500/30 rounded-2xl p-8 text-center space-y-4">
              <h2 className="text-3xl font-bold text-yellow-300">Game Over!</h2>
              <div className="space-y-2">
                {state.players
                  .slice()
                  .sort((a, b) => b.score - a.score)
                  .map((p, i) => (
                    <div
                      key={p.id}
                      className={`flex items-center justify-between text-lg px-6 py-2 rounded-lg ${
                        i === 0 ? "bg-yellow-500/20 text-yellow-300 font-bold" : "text-slate-400"
                      }`}
                    >
                      <span>{i === 0 ? "👑 " : ""}{p.name}</span>
                      <span>{p.score} pts</span>
                    </div>
                  ))}
              </div>
              {isHost && (
                <button
                  onClick={() => send({ type: "restart" })}
                  className="px-8 py-3 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Play Again
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Card legend */}
      <div className="mt-6 p-2.5 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-slate-500">
          <span><span className="inline-block w-2.5 h-2.5 bg-slate-700 border border-slate-500 rounded mr-1" /> Number</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-cyan-900 border border-cyan-500 rounded mr-1" /> Freeze</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-orange-900 border border-orange-500 rounded mr-1" /> Flip 3</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-green-900 border border-green-500 rounded mr-1" /> 2nd Chance</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-yellow-900 border border-yellow-500 rounded mr-1" /> Modifier</span>
          <span><span className="inline-block w-2.5 h-2.5 bg-pink-900 border border-pink-500 rounded mr-1" /> x2</span>
        </div>
      </div>
    </div>
  );
}
