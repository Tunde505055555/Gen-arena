import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Crown, Gavel, Link2Off, ShieldAlert, ShieldCheck, Trophy } from "lucide-react";
import { ArenaShell } from "@/components/arena-shell";
import { Button } from "@/components/ui/button";
import { fetchBattle, shortAddress, type PlayerScore } from "@/lib/genlayer";
import { useWallet } from "@/lib/wallet";

export const Route = createFileRoute("/results/$battleId")({
  head: () => ({
    meta: [
      { title: "Verdict — AI Agent Arena" },
      {
        name: "description",
        content:
          "See the GenLayer verdict: winner, per-player scores, score breakdown, failed requirements and confidence.",
      },
      { property: "og:title", content: "Verdict — AI Agent Arena" },
      {
        property: "og:description",
        content: "Winner, scores, breakdown and confidence — decided on-chain by GenLayer.",
      },
    ],
  }),
  component: ResultsPage,
});

const CRITERIA = [
  { key: "accuracy", label: "Accuracy" },
  { key: "evidence", label: "Evidence" },
  { key: "reasoning", label: "Reasoning" },
  { key: "requirements", label: "Requirements" },
] as const;

function ScoreCard({
  score,
  handle,
  isWinner,
}: {
  score: PlayerScore;
  handle: string;
  isWinner: boolean;
}) {
  return (
    <div
      className={`panel p-5 ${isWinner ? "border-primary/60 shadow-[0_0_0_1px_var(--color-primary)]" : ""}`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            {isWinner && <Crown className="size-4 text-primary" />}
            {handle}
          </p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {shortAddress(score.player)}
          </p>
        </div>
        <p className="font-mono text-2xl font-bold text-primary">{score.total}</p>
      </div>
      <div className="mt-4 space-y-2">
        {CRITERIA.map((c) => {
          const v = score.breakdown?.[c.key] ?? 0;
          return (
            <div key={c.key}>
              <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                <span>{c.label}</span>
                <span>{v}/100</span>
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.min(100, v)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {score.verified_sources && score.verified_sources.length > 0 && (
        <div className="mt-4">
          <p className="label-mono flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-primary" /> Sources fetched on-chain
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {score.verified_sources.map((s) => (
              <li key={s.url} className="flex items-start gap-1.5">
                {s.reachable ? (
                  <ShieldCheck
                    className={`mt-0.5 size-3.5 shrink-0 ${s.supports_claim ? "text-primary" : "text-muted-foreground"}`}
                  />
                ) : (
                  <Link2Off className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                )}
                <span className="min-w-0 break-all font-mono">
                  {s.url}
                  <span className="ml-1 not-italic">
                    {!s.reachable
                      ? "— unreachable"
                      : s.supports_claim
                        ? "— supports the claim"
                        : "— does not support the claim"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {score.failed_requirements && score.failed_requirements.length > 0 && (
        <div className="mt-4">
          <p className="label-mono flex items-center gap-1.5 text-destructive">
            <ShieldAlert className="size-3.5" /> Failed requirements
          </p>
          <ul className="mt-1.5 space-y-1 text-xs text-muted-foreground">
            {score.failed_requirements.map((r) => (
              <li key={r}>· {r}</li>
            ))}
          </ul>
        </div>
      )}
      {score.notes && <p className="mt-3 text-xs text-muted-foreground">{score.notes}</p>}
    </div>
  );
}

function ResultsPage() {
  const { battleId } = Route.useParams();
  const { address } = useWallet();
  const battle = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fetchBattle(battleId),
    refetchInterval: 10000,
  });

  const b = battle.data;

  if (battle.isLoading) {
    return (
      <ArenaShell>
        <p className="text-sm text-muted-foreground">Reading the verdict from GenLayer…</p>
      </ArenaShell>
    );
  }

  if (!b) {
    return (
      <ArenaShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Battle not found</h1>
        </div>
      </ArenaShell>
    );
  }

  if (b.status === "open") {
    return (
      <ArenaShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">This battle has not been judged yet</h1>
          <Link to="/battle/$battleId" params={{ battleId }} className="mt-4 inline-block">
            <Button>Back to the battle</Button>
          </Link>
        </div>
      </ArenaShell>
    );
  }

  const j = b.judgement ?? {};
  const scores = j.scores ?? [];
  const handleFor = (p: string) =>
    b.submissions.find((s) => s.player.toLowerCase() === p.toLowerCase())?.handle ??
    shortAddress(p);
  const winner = b.appeal?.upheld ? (b.appeal.new_winner ?? j.winner) : j.winner;
  const iLost =
    address &&
    b.submissions.some((s) => s.player.toLowerCase() === address.toLowerCase()) &&
    winner?.toLowerCase() !== address.toLowerCase();

  return (
    <ArenaShell>
      <section className="panel p-6 sm:p-8">
        <p className="label-mono">GenLayer verdict</p>
        <h1 className="mt-2 flex items-center gap-2 text-2xl font-bold sm:text-3xl">
          <Trophy className="size-6 text-primary" />
          {winner ? handleFor(winner) : "No winner"} wins
        </h1>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {winner ? shortAddress(winner) : "—"} · confidence{" "}
          {Math.round((j.confidence ?? 0) * 100)}%
        </p>
        <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{j.verdict}</p>
        <p className="mt-4 text-sm">{b.question}</p>
      </section>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {scores.map((s) => (
          <ScoreCard
            key={s.player}
            score={s}
            handle={handleFor(s.player)}
            isWinner={winner?.toLowerCase() === s.player.toLowerCase()}
          />
        ))}
      </section>

      {b.status === "appealed" && b.appeal && (
        <section className="panel mt-6 p-6">
          <p className="label-mono flex items-center gap-1.5">
            <Gavel className="size-3.5 text-primary" /> Appeal review
          </p>
          <p className="mt-2 text-sm">
            <span className="font-semibold">
              {b.appeal.upheld ? "Appeal upheld — verdict overturned" : "Appeal rejected"}
            </span>{" "}
            <span className="font-mono text-xs text-muted-foreground">
              confidence {Math.round((b.appeal.confidence ?? 0) * 100)}%
            </span>
          </p>
          {b.appeal.reason && (
            <p className="mt-3 text-xs text-muted-foreground">
              Appellant ({shortAddress(b.appeal.appellant)}): {b.appeal.reason}
            </p>
          )}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{b.appeal.review}</p>
        </section>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {b.status === "judged" && iLost && (
          <Link to="/appeal/$battleId" params={{ battleId }}>
            <Button>
              <Gavel /> Appeal this verdict
            </Button>
          </Link>
        )}
        <Link to="/leaderboard">
          <Button variant="secondary">
            <Trophy /> Leaderboard
          </Button>
        </Link>
      </div>
    </ArenaShell>
  );
}
