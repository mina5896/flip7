"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import PartySocket from "partysocket";
import type { GameState, ServerMessage, Card, Player } from "../../party/types";

const PARTYKIT_HOST = process.env.NEXT_PUBLIC_PARTYKIT_HOST || "localhost:1999";

function CardComponent({ card, isNew }: { card: Card; isNew?: boolean }) {
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
      className={`inline-flex items-center justify-center w-12 h-16 rounded-lg border-2 text-sm font-bold ${colorMap[card.type] || "bg-slate-700 border-slate-500"} ${isNew ? "card-enter" : ""}`}
      title={card.type === "number" ? `Number ${card.value}` : card.label}
    >
      {card.type === "number" ? (
        <span className="text-lg">{card.value}</span>
      ) : (
        <span className="text-[10px] leading-tight text-center px-0.5">{card.label}</span>
      )}
    </div>
  );
}

function PlayerPanel({
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
        ? "border-blue-500 pulse-glow"
        : "border-slate-700";

  const bgColor = isYou ? "bg-slate-800/80" : "bg-slate-800/40";

  return (
    <div
      className={`rounded-xl border-2 p-3 ${borderColor} ${bgColor} ${player.busted ? "bust-shake" : ""} transition-all`}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${isYou ? "text-blue-300" : "text-slate-200"}`}>
            {player.name}
            {isYou ? " (you)" : ""}
          </span>
          {!player.connected && (
            <span className="text-xs text-red-400 bg-red-900/30 px-1.5 py-0.5 rounded">offline</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {player.busted && <span className="text-red-400 text-xs font-bold">BUST</span>}
          {player.stayed && !player.busted && (
            <span className="text-yellow-400 text-xs">STAYED</span>
          )}
          {gamePhase === "playing" && !player.busted && (
            <span className="font-mono text-yellow-300">
              {player.roundScore}
            </span>
          )}
          <span className="font-mono text-slate-400">
            Total: {player.score}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {player.cards.map((card, i) => (
          <CardComponent key={card.id} card={card} isNew={i === player.cards.length - 1} />
        ))}
        {player.cards.length === 0 && (
          <span className="text-slate-600 text-sm italic">No cards yet</span>
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
  const canAct = state.phase === "playing" && me && !me.busted && !me.stayed;

  return (
    <div className="min-h-screen p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            FLIP 7
          </h1>
          <span className="text-slate-500 text-sm">Round {state.roundNumber || "-"}</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={copyRoomCode}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 px-4 py-2 rounded-xl transition-colors cursor-pointer"
          >
            <span className="text-slate-400 text-sm">Room:</span>
            <span className="font-mono font-bold tracking-widest text-white">{roomId}</span>
            <span className="text-xs text-slate-500">{copied ? "Copied!" : "Copy"}</span>
          </button>
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="mb-4 p-3 bg-red-900/50 border border-red-500/50 rounded-xl text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Last action */}
      {state.lastAction && (
        <div className="mb-4 p-3 bg-slate-800/50 border border-slate-700 rounded-xl text-slate-300 text-sm text-center">
          {state.lastAction}
        </div>
      )}

      {/* Lobby */}
      {state.phase === "lobby" && (
        <div className="space-y-4">
          <div className="bg-slate-800/50 border border-slate-700 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-xl font-semibold">Waiting for players...</h2>
            <div className="flex flex-wrap justify-center gap-3">
              {state.players.map((p) => (
                <div
                  key={p.id}
                  className="bg-slate-700 px-4 py-2 rounded-xl text-sm font-medium"
                >
                  {p.name}
                  {p.id === state.hostId && (
                    <span className="ml-1.5 text-yellow-400 text-xs">HOST</span>
                  )}
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
            {!isHost && (
              <p className="text-slate-500 text-sm">Waiting for host to start...</p>
            )}
          </div>
        </div>
      )}

      {/* Game Board */}
      {(state.phase === "playing" || state.phase === "round_end" || state.phase === "game_over") && (
        <div className="space-y-4">
          {/* Scoreboard */}
          <div className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-3">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              {state.players.map((p) => (
                <div key={p.id} className="flex items-center gap-2 text-sm">
                  <span className={p.name === playerName ? "text-blue-300 font-semibold" : "text-slate-400"}>
                    {p.name}
                  </span>
                  <span className="font-mono text-white font-bold">{p.score}</span>
                  <div className="w-24 bg-slate-700 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-purple-500 rounded-full h-1.5 transition-all duration-500"
                      style={{ width: `${Math.min(100, (p.score / state.targetScore) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Player panels */}
          <div className="space-y-3">
            {/* Show "you" first */}
            {me && (
              <PlayerPanel
                player={me}
                isCurrentTurn={state.players[state.currentPlayerIndex]?.id === me.id}
                isYou={true}
                gamePhase={state.phase}
              />
            )}
            {state.players
              .filter((p) => p.name !== playerName)
              .map((p) => (
                <PlayerPanel
                  key={p.id}
                  player={p}
                  isCurrentTurn={state.players[state.currentPlayerIndex]?.id === p.id}
                  isYou={false}
                  gamePhase={state.phase}
                />
              ))}
          </div>

          {/* Action buttons */}
          {state.phase === "playing" && (
            <div className="flex justify-center gap-4 pt-2">
              {canAct ? (
                <>
                  <button
                    onClick={() => send({ type: "hit" })}
                    className="px-10 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg rounded-2xl transition-colors cursor-pointer shadow-lg shadow-blue-600/25"
                  >
                    HIT
                  </button>
                  <button
                    onClick={() => send({ type: "stay" })}
                    className="px-10 py-4 bg-amber-600 hover:bg-amber-500 text-white font-bold text-lg rounded-2xl transition-colors cursor-pointer shadow-lg shadow-amber-600/25"
                  >
                    STAY
                  </button>
                </>
              ) : (
                <div className="text-slate-500 text-sm py-4">
                  {me?.busted
                    ? "You busted this round"
                    : me?.stayed
                      ? "You're locked in for this round"
                      : `Waiting for ${state.players[state.currentPlayerIndex]?.name}...`}
                </div>
              )}
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
                      <span>
                        {i === 0 ? "👑 " : ""}
                        {p.name}
                      </span>
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
      <div className="mt-8 p-3 bg-slate-800/30 border border-slate-700/50 rounded-xl">
        <div className="flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
          <span><span className="inline-block w-3 h-3 bg-slate-700 border border-slate-500 rounded mr-1" /> Number</span>
          <span><span className="inline-block w-3 h-3 bg-cyan-900 border border-cyan-500 rounded mr-1" /> Freeze</span>
          <span><span className="inline-block w-3 h-3 bg-orange-900 border border-orange-500 rounded mr-1" /> Flip 3</span>
          <span><span className="inline-block w-3 h-3 bg-green-900 border border-green-500 rounded mr-1" /> 2nd Chance</span>
          <span><span className="inline-block w-3 h-3 bg-yellow-900 border border-yellow-500 rounded mr-1" /> Modifier</span>
          <span><span className="inline-block w-3 h-3 bg-pink-900 border border-pink-500 rounded mr-1" /> x2</span>
        </div>
      </div>
    </div>
  );
}
