import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Send, Gavel, Users, Copy } from "lucide-react";
import { toast } from "sonner";
import { ArenaShell, WalletGate } from "@/components/arena-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/wallet";
import { fetchBattle, judgeTx, shortAddress, submitTx } from "@/lib/genlayer";

export const Route = createFileRoute("/battle/$battleId")({
  head: () => ({
    meta: [
      { title: "Research Battle — AI Agent Arena" },
      {
        name: "description",
        content:
          "Answer the research challenge before the timer runs out, then send both submissions to GenLayer for judging.",
      },
      { property: "og:title", content: "Research Battle — AI Agent Arena" },
      {
        property: "og:description",
        content: "Timed head-to-head research, judged on-chain by GenLayer.",
      },
    ],
  }),
  component: BattlePage,
});

function useCountdown(battleId: string, duration: number, active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  const startKey = `arena.timer.${battleId}`;
  const start = useMemo(() => {
    if (typeof window === "undefined") return Date.now();
    const existing = window.localStorage.getItem(startKey);
    if (existing) return Number(existing);
    const t = Date.now();
    window.localStorage.setItem(startKey, String(t));
    return t;
  }, [startKey]);

  useEffect(() => {
    if (!active) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [active]);

  const left = Math.max(0, duration - Math.floor((now - start) / 1000));
  return {
    left,
    label: `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`,
    pct: duration ? (left / duration) * 100 : 0,
  };
}

function BattlePage() {
  const { battleId } = Route.useParams();
  const navigate = useNavigate();
  const { address, provider } = useWallet();
  const [handle, setHandle] = useState("");
  const [answer, setAnswer] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [sources, setSources] = useState("");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState<"submit" | "judge" | null>(null);

  const battle = useQuery({
    queryKey: ["battle", battleId],
    queryFn: () => fetchBattle(battleId),
    refetchInterval: 8000,
  });

  const b = battle.data;
  const timer = useCountdown(battleId, b?.duration ?? 300, b?.status === "open");

  useEffect(() => {
    if (b && b.status !== "open") {
      navigate({ to: "/results/$battleId", params: { battleId } });
    }
  }, [b, battleId, navigate]);

  const mine = b?.submissions.find((s) => s.player.toLowerCase() === address?.toLowerCase());

  async function handleSubmit() {
    if (!address || !provider) return;
    if (!answer.trim() || !reasoning.trim() || !sources.trim()) {
      toast.error("Answer, reasoning and sources are all required.");
      return;
    }
    setBusy("submit");
    try {
      await submitTx(
        address,
        provider,
        { battleId, handle: handle.trim() || shortAddress(address), answer, reasoning, sources },
        setStage,
      );
      toast.success("Submission locked on-chain");
      await battle.refetch();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Submission failed");
    } finally {
      setBusy(null);
      setStage("");
    }
  }

  async function handleJudge() {
    if (!address || !provider) return;
    setBusy("judge");
    try {
      setStage("Waiting for MetaMask signature…");
      await judgeTx(address, provider, battleId, setStage);
      navigate({ to: "/results/$battleId", params: { battleId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Judging failed");
    } finally {
      setBusy(null);
      setStage("");
    }
  }

  if (battle.isLoading) {
    return (
      <ArenaShell>
        <p className="text-sm text-muted-foreground">Loading battle from GenLayer…</p>
      </ArenaShell>
    );
  }

  if (!b) {
    return (
      <ArenaShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">Battle not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            No battle with id <span className="font-mono">{battleId}</span> exists in this arena.
          </p>
        </div>
      </ArenaShell>
    );
  }

  const expired = timer.left === 0;

  return (
    <ArenaShell>
      <div className="panel p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="label-mono">Research battle</p>
            <h1 className="mt-2 text-xl font-semibold sm:text-2xl">{b.question}</h1>
          </div>
          <div className="text-right">
            <p className="label-mono">Time left</p>
            <p
              className={`font-mono text-3xl font-bold ${expired ? "text-destructive" : "text-primary"}`}
            >
              {timer.label}
            </p>
          </div>
        </div>
        <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000"
            style={{ width: `${timer.pct}%` }}
          />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="label-mono">Requirements</p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {b.requirements.map((r) => (
                <li key={r}>· {r}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label-mono">Players in this battle</p>
            <ul className="mt-2 space-y-1">
              {b.submissions.map((s) => (
                <li key={s.player} className="flex items-center gap-2 text-sm">
                  <Users className="size-3.5 text-primary" />
                  <span>{s.handle}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {shortAddress(s.player)}
                  </span>
                </li>
              ))}
              {b.submissions.length === 0 && (
                <li className="text-sm text-muted-foreground">No submissions yet.</li>
              )}
            </ul>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() => {
                navigator.clipboard.writeText(window.location.href);
                toast.success("Battle link copied — send it to your opponent");
              }}
            >
              <Copy /> Copy invite link
            </Button>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <WalletGate note="Connect MetaMask to compete in this battle.">
          {mine ? (
            <div className="panel p-6">
              <p className="label-mono">Your submission is locked</p>
              <p className="mt-2 text-sm text-muted-foreground">
                Waiting for opponents. You cannot edit an answer once it is on-chain.
              </p>
              <p className="mt-3 whitespace-pre-wrap text-sm">{mine.answer}</p>
            </div>
          ) : (
            <div className="panel space-y-4 p-6">
              <div>
                <Label htmlFor="handle">Display name</Label>
                <Input
                  id="handle"
                  className="mt-1.5"
                  placeholder="researcher-01"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="answer">Answer</Label>
                <Textarea
                  id="answer"
                  className="mt-1.5 min-h-24"
                  placeholder="Your direct answer to the challenge"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={expired}
                />
              </div>
              <div>
                <Label htmlFor="reasoning">Reasoning</Label>
                <Textarea
                  id="reasoning"
                  className="mt-1.5 min-h-28"
                  placeholder="How you got there, and why competing explanations lose"
                  value={reasoning}
                  onChange={(e) => setReasoning(e.target.value)}
                  disabled={expired}
                />
              </div>
              <div>
                <Label htmlFor="sources">Sources</Label>
                <Textarea
                  id="sources"
                  className="mt-1.5 min-h-20"
                  placeholder="One source per line, with dates"
                  value={sources}
                  onChange={(e) => setSources(e.target.value)}
                  disabled={expired}
                />
              </div>
              {expired && (
                <p className="text-xs text-destructive">
                  Research window closed — you can no longer submit to this battle.
                </p>
              )}
              <Button onClick={handleSubmit} disabled={busy !== null || expired}>
                {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />}
                {busy === "submit" ? stage || "Submitting…" : "Lock submission on-chain"}
              </Button>
            </div>
          )}

          <div className="panel mt-4 p-6">
            <p className="label-mono">Step 2 · GenLayer judging</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Once at least two players have submitted, send the battle to the Intelligent
              Contract. Validators run the judgement and must agree on the winner before it is
              written to the chain.
            </p>
            <Button
              className="mt-4"
              onClick={handleJudge}
              disabled={busy !== null || b.submissions.length < 2}
            >
              {busy === "judge" ? <Loader2 className="animate-spin" /> : <Gavel />}
              {busy === "judge"
                ? stage || "Judging…"
                : b.submissions.length < 2
                  ? "Waiting for a second player"
                  : "Send to GenLayer judging"}
            </Button>
            {busy === "judge" && (
              <p className="mt-3 font-mono text-[11px] text-muted-foreground">
                LLM judging runs inside consensus — this can take a minute.
              </p>
            )}
          </div>
        </WalletGate>
      </div>
    </ArenaShell>
  );
}
