import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Swords, Wallet, Trophy, Loader2 } from "lucide-react";
import { useWallet } from "@/lib/wallet";
import { shortAddress, getArenaAddress } from "@/lib/genlayer";
import { Button } from "@/components/ui/button";

export function ConnectButton() {
  const { address, connect, connecting } = useWallet();
  if (address) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-3 py-1.5 font-mono text-xs text-foreground">
        <span className="size-1.5 rounded-full bg-primary" />
        {shortAddress(address)}
      </span>
    );
  }
  return (
    <Button size="sm" onClick={connect} disabled={connecting}>
      {connecting ? <Loader2 className="animate-spin" /> : <Wallet />}
      Connect MetaMask
    </Button>
  );
}

export function ArenaShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <Swords className="size-5 text-primary" />
            <span className="font-display text-sm font-bold tracking-tight sm:text-base">
              AI Agent Arena
            </span>
          </Link>
          <nav className="flex items-center gap-2">
            <Link
              to="/leaderboard"
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              activeProps={{ className: "text-foreground" }}
            >
              <Trophy className="size-4" />
              <span className="hidden sm:inline">Leaderboard</span>
            </Link>
            <ConnectButton />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 pb-24 pt-6">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-6 font-mono text-[11px] text-muted-foreground">
          Judged on-chain by a GenLayer Intelligent Contract · Studio chain 61999 ·{" "}
          <span className="break-all">{getArenaAddress()}</span>
        </div>
      </footer>
    </div>
  );
}

export function WalletGate({ children, note }: { children: ReactNode; note: string }) {
  const { address, hasMetaMask, error } = useWallet();
  if (address) return <>{children}</>;
  return (
    <div className="panel p-6 text-center">
      <Wallet className="mx-auto size-6 text-primary" />
      <p className="mt-3 text-sm text-muted-foreground">{note}</p>
      <div className="mt-4 flex justify-center">
        <ConnectButton />
      </div>
      {!hasMetaMask && (
        <p className="mt-3 text-xs text-destructive">
          MetaMask not detected in this browser.
        </p>
      )}
      {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
    </div>
  );
}
