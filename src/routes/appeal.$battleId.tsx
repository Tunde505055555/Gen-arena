import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Gavel, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ArenaShell, WalletGate } from "@/components/arena-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useWallet } from "@/lib/wallet";
import { appealTx, fetchBattle, shortAddress } from "@/lib/genlayer";

export const Route = createFileRoute("/appeal/$battleId")({
  head: () => ({
    meta: [
      { title: "Appeal the verdict — AI Agent Arena" },
      {
        name: "description",
        content:
          "Losing players can ask the GenLayer Intelligent Contract to review the verdict and overturn it.",
      },
      { property: "og:title", content: "Appeal the verdict — AI Agent Arena" },
      {
        property: "og:description",
        content: "GenLayer re-reads both submissions and rules on the appeal on-chain.",
      },
    ],
  }),
  component: AppealPage,
});

function AppealPage() {
  const { battleId } = Route.useParams();
  const navigate = useNavigate();
  const { address, provider } = useWallet();
  const [reason, setReason] = useState("");
  const [stage, setStage] = useState("");
  const [busy, setBusy] = useState(false);

  const battle = useQuery({ queryKey: ["battle", battleId], queryFn: () => fetchBattle(battleId) });
  const b = battle.data;

  async function submitAppeal() {
    if (!address || !provider) return;
    if (reason.trim().length < 20) {
      toast.error("Explain the appeal in at least a sentence or two.");
      return;
    }
    setBusy(true);
    try {
      await appealTx(address, provider, battleId, reason.trim(), setStage);
      navigate({ to: "/results/$battleId", params: { battleId } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Appeal failed");
    } finally {
      setBusy(false);
      setStage("");
    }
  }

  if (battle.isLoading) {
    return (
      <ArenaShell>
        <p className="text-sm text-muted-foreground">Loading battle…</p>
      </ArenaShell>
    );
  }

  if (!b || b.status !== "judged") {
    return (
      <ArenaShell>
        <div className="panel p-6">
          <h1 className="text-lg font-semibold">This battle cannot be appealed</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Appeals are only open on a judged battle that has not already been appealed.
          </p>
          <Link to="/results/$battleId" params={{ battleId }} className="mt-4 inline-block">
            <Button variant="secondary">Back to results</Button>
          </Link>
        </div>
      </ArenaShell>
    );
  }

  const winner = b.judgement?.winner;

  return (
    <ArenaShell>
      <div className="panel p-6">
        <p className="label-mono">Appeal</p>
        <h1 className="mt-2 text-xl font-semibold sm:text-2xl">Ask GenLayer to review</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Current winner: <span className="font-mono">{shortAddress(winner)}</span>. The contract
          re-reads every submission alongside your argument and can overturn the verdict.
        </p>
        <p className="mt-3 text-sm">{b.question}</p>
      </div>

      <div className="mt-6">
        <WalletGate note="Connect MetaMask to file an appeal.">
          <div className="panel space-y-4 p-6">
            <div>
              <Label htmlFor="reason">Why the verdict is wrong</Label>
              <Textarea
                id="reason"
                className="mt-1.5 min-h-32"
                placeholder="Point to specific evidence, requirements or reasoning the judgement got wrong."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <Button onClick={submitAppeal} disabled={busy}>
              {busy ? <Loader2 className="animate-spin" /> : <Gavel />}
              {busy ? stage || "Reviewing…" : "File appeal on-chain"}
            </Button>
            <p className="font-mono text-[11px] text-muted-foreground">
              One appeal per battle. The review runs inside GenLayer consensus.
            </p>
          </div>
        </WalletGate>
      </div>
    </ArenaShell>
  );
}
