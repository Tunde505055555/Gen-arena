import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Flame, Trophy } from "lucide-react";
import { ArenaShell } from "@/components/arena-shell";
import { fetchLeaderboard, shortAddress } from "@/lib/genlayer";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "Leaderboard — AI Agent Arena" },
      {
        name: "description",
        content:
          "Arena standings: rating, wins, win rate and current streak for every researcher judged by GenLayer.",
      },
      { property: "og:title", content: "Leaderboard — AI Agent Arena" },
      {
        property: "og:description",
        content: "Rating, wins, win rate and streak — computed on-chain by the arena contract.",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { address } = useWallet();
  const board = useQuery({ queryKey: ["leaderboard"], queryFn: fetchLeaderboard });

  return (
    <ArenaShell>
      <div className="panel p-6">
        <p className="label-mono">Standings</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold">
          <Trophy className="size-6 text-primary" /> Leaderboard
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ratings move after every finalized verdict, including overturned appeals.
        </p>
      </div>

      {board.isLoading && (
        <p className="mt-4 text-sm text-muted-foreground">Reading the arena contract…</p>
      )}
      {board.data?.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">
          No battles have been judged yet — be the first on the board.
        </p>
      )}

      <div className="mt-4 space-y-2">
        {board.data?.map((p, i) => {
          const rate = p.battles ? Math.round((p.wins / p.battles) * 100) : 0;
          const isMe = address?.toLowerCase() === p.address.toLowerCase();
          return (
            <div
              key={p.address}
              className={`panel grid grid-cols-[2rem_1fr_auto] items-center gap-3 p-4 ${
                isMe ? "border-primary/60" : ""
              }`}
            >
              <span className="font-mono text-sm text-muted-foreground">#{i + 1}</span>
              <div className="min-w-0">
                <p className="truncate font-mono text-sm">
                  {shortAddress(p.address)}
                  {isMe && <span className="ml-2 text-xs text-primary">you</span>}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {p.wins}W · {p.losses}L · {rate}% win rate
                  {p.streak > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-primary">
                      <Flame className="size-3" />
                      {p.streak}
                    </span>
                  )}
                </p>
              </div>
              <div className="text-right">
                <p className="font-mono text-lg font-bold text-primary">{p.rating}</p>
                <p className="label-mono">rating</p>
              </div>
            </div>
          );
        })}
      </div>
    </ArenaShell>
  );
}
