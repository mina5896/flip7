"use client";

import { useState } from "react";
import Game from "./Game";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [joined, setJoined] = useState(false);
  const [activeRoom, setActiveRoom] = useState("");

  function createRoom() {
    if (!playerName.trim()) return;
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setActiveRoom(id);
    setJoined(true);
  }

  function joinRoom() {
    if (!playerName.trim() || !roomId.trim()) return;
    setActiveRoom(roomId.trim().toUpperCase());
    setJoined(true);
  }

  if (joined) {
    return <Game roomId={activeRoom} playerName={playerName.trim()} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <h1 className="text-6xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
            FLIP 7
          </h1>
          <p className="mt-2 text-slate-400 text-lg">Press your luck. Score big.</p>
        </div>

        <div className="bg-slate-800/50 backdrop-blur rounded-2xl p-6 space-y-5 border border-slate-700">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Your Name
            </label>
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="Enter your name"
              className="w-full px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              maxLength={20}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !roomId) createRoom();
                else if (e.key === "Enter" && roomId) joinRoom();
              }}
            />
          </div>

          <button
            onClick={createRoom}
            disabled={!playerName.trim()}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            Create Room
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-3 bg-slate-800 text-slate-500">or join a room</span>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="text"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              placeholder="Room code"
              className="flex-1 px-4 py-3 bg-slate-900 border border-slate-600 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent uppercase tracking-widest text-center font-mono"
              maxLength={6}
              onKeyDown={(e) => {
                if (e.key === "Enter") joinRoom();
              }}
            />
            <button
              onClick={joinRoom}
              disabled={!playerName.trim() || !roomId.trim()}
              className="py-3 px-6 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl transition-colors cursor-pointer disabled:cursor-not-allowed"
            >
              Join
            </button>
          </div>
        </div>

        <p className="text-center text-slate-600 text-xs">
          First to 200 points wins!
        </p>
      </div>
    </div>
  );
}
