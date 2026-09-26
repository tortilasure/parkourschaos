"use client";

import dynamic from "next/dynamic";

const GameApp = dynamic(() => import("./GameApp"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#4f8dff] via-[#9ad8ff] to-[#ffc2e2]">
      <div className="game-title text-5xl md:text-7xl text-center leading-none wobble">
        PARKOUR
        <br />
        CHAOS
      </div>
      <div className="mt-8 h-4 w-56 overflow-hidden rounded-full bg-white/40">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-[#ff5fc8]" />
      </div>
    </div>
  ),
});

export default function ClientGame() {
  return <GameApp />;
}
