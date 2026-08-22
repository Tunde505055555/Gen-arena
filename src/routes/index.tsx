import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Swords, Timer, Scale, Gavel } from "lucide-react";
import { ArenaShell, WalletGate } from "@/components/arena-shell";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";
import { createBattleTx, fetchBattles } from "@/lib/genlayer";
import { CHALLENGES } from "@/lib/challenges";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "AI Agent Arena — Research Battles Judged by GenLayer" },
      {
        name: "description",
        content:
          "Compete in real-world research challenges. Submit an answer, reasoning and sources, and let a GenLayer Intelligent Contract decide the winner.",
      },
      { property: "og:title", content: "AI Agent Arena — Research Battles Judged by GenLayer" },
      {
        property: "og:description",
        content:
          "Two players, one research challenge, one on-chain verdict. Scores, breakdowns and appeals decided by GenLayer.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { address, provider } = useWallet();
  const [busy, setBusy] = useState<string | null>(null);
  const [stage, setStage] = useState("");

  const battles = useQuery({ queryKey: ["battles"], queryFn: fetchBattles });

  async function startBattle(index: number) {
    if (!address || !provider) return;
    const challenge = CHALLENGES[index];
    if (!challenge) return;
    const id = `battle-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    setBusy(challenge.title);
    try {
      await createBattleTx(
        address,
        provider,
        {
          id,
          question: challenge.question,
          requirements: challenge.requirements,
          duration: challenge.duration,
        },
        setStage,
      );
      navigate({ to: "/battle/$battleId", params: { battleId: id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open the battle");
    } finally {
      setBusy(null);
      setStage("");
    }
  }

  return (
    <ArenaShell>
      <section className="panel overflow-hidden p-6 sm:p-10">
        <p className="label-mono">GenLayer Studio · chain 61999</p>
        <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-5xl">
          Two researchers.
          <br />
          One <span className="text-primary">on-chain verdict</span>.
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Every player answers the same real-world research challenge under a timer. A GenLayer
          Intelligent Contract scores accuracy, evidence, reasoning and requirements — then names
          the winner, explains why, and hears the loser&apos;s appeal.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-4">
          {[
            { icon: Timer, label: "Timed research" },
            { icon: Swords, label: "Head-to-head" },
            { icon: Scale, label: "4 scoring criteria" },
            { icon: Gavel, label: "On-chain appeal" },
          ].map((f) => (
            <div
              key={f.label}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2.5 text-xs"
            >
              <f.icon className="size-4 text-primary" />
              {f.label}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Pick a research challenge</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Opening a battle writes it to the arena contract. Share the link with your opponent.
        </p>
        <WalletGate note="Connect MetaMask to open a battle on GenLayer Studio.">
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {CHALLENGES.map((c, i) => (
              <div key={c.title} className="panel flex flex-col p-5">
                <p className="label-mono">{c.tag}</p>
                <h3 className="mt-2 text-base font-semibold">{c.title}</h3>
                <p className="mt-2 flex-1 text-sm text-muted-foreground">{c.question}</p>
                <ul className="mt-3 space-y-1">
                  {c.requirements.map((r) => (
                    <li key={r} className="font-mono text-[11px] text-muted-foreground">
                      · {r}
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-4"
                  onClick={() => startBattle(i)}
                  disabled={busy !== null}
                >
                  {busy === c.title ? <Loader2 className="animate-spin" /> : <Swords />}
                  {busy === c.title ? stage || "Opening…" : `Open battle · ${c.duration / 60} min`}
                </Button>
              </div>
            ))}
          </div>
        </WalletGate>
      </section>

      <section className="mt-10">
        <h2 className="text-lg font-semibold">Live battles</h2>
        {battles.isLoading && (
          <p className="mt-3 text-sm text-muted-foreground">Reading the arena contract…</p>
        )}
        {battles.data?.length === 0 && (
          <p className="mt-3 text-sm text-muted-foreground">No battles yet. Open the first one.</p>
        )}
        <div className="mt-3 space-y-2">
          {battles.data?.slice().reverse().map((b) => (
            <Link
              key={b.id}
              to="/battle/$battleId"
              params={{ battleId: b.id }}
              className="panel flex items-center justify-between gap-4 p-4 transition-colors hover:border-primary/50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{b.question}</p>
                <p className="font-mono text-[11px] text-muted-foreground">{b.id}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="label-mono">{b.status}</p>
                <p className="text-xs text-muted-foreground">{b.players} players</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </ArenaShell>
  );
}
