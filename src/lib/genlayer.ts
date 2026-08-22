import { createClient } from "genlayer-js";
import { TransactionStatus } from "genlayer-js/types";
import { studionet } from "genlayer-js/chains";

/**
 * AgentArena intelligent contract, deployed on GenLayer Studio (chain 61999).
 * Source of truth: src/contracts/agent_arena.py
 */
export const ARENA_ADDRESS = "0x64438d9516d67D328376E51Ca1f5bFDa837Ba512" as const;

/** The arena contract address is fixed and cannot be changed at runtime. */
export function getArenaAddress(): string {
  return ARENA_ADDRESS;
}


export const STUDIO_CHAIN = {
  chainIdHex: "0xf22f",
  chainId: 61999,
  rpc: "https://studio.genlayer.com/api",
} as const;

export type Breakdown = {
  accuracy: number;
  evidence: number;
  reasoning: number;
  requirements: number;
};

export type PlayerScore = {
  player: string;
  total: number;
  breakdown: Breakdown;
  failed_requirements?: string[];
  notes?: string;
};

export type Judgement = {
  winner?: string;
  confidence?: number;
  verdict?: string;
  scores?: PlayerScore[];
};

export type Appeal = {
  upheld?: boolean;
  new_winner?: string;
  confidence?: number;
  review?: string;
  appellant?: string;
  reason?: string;
};

export type Submission = {
  player: string;
  handle: string;
  answer: string;
  reasoning: string;
  sources: string;
};

export type Battle = {
  id: string;
  question: string;
  requirements: string[];
  duration: number;
  status: "open" | "judged" | "appealed";
  creator: string;
  submissions: Submission[];
  judgement: Judgement;
  appeal: Appeal;
};

export type BattleSummary = {
  id: string;
  question: string;
  status: Battle["status"];
  players: number;
};

export type PlayerStats = {
  address: string;
  rating: number;
  wins: number;
  losses: number;
  battles: number;
  streak: number;
  best_streak: number;
};

function reader() {
  return createClient({ chain: studionet as never });
}

async function read(functionName: string, args: unknown[] = []): Promise<string> {
  const res = await reader().readContract({
    address: getArenaAddress() as `0x${string}`,
    functionName,
    args: args as never[],
  });
  return String(res ?? "");
}

export async function fetchBattles(): Promise<BattleSummary[]> {
  const raw = await read("list_battles");
  return raw ? (JSON.parse(raw) as BattleSummary[]) : [];
}

export async function fetchBattle(id: string): Promise<Battle | null> {
  const raw = await read("get_battle", [id]);
  return raw ? (JSON.parse(raw) as Battle) : null;
}

export async function fetchLeaderboard(): Promise<PlayerStats[]> {
  const raw = await read("get_leaderboard");
  const list = raw ? (JSON.parse(raw) as PlayerStats[]) : [];
  return list.sort((a, b) => b.rating - a.rating);
}

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

function writer(account: string, provider: EthProvider) {
  return createClient({
    chain: studionet as never,
    account: account as `0x${string}`,
    provider: provider as never,
  });
}

export type TxProgress = (stage: string) => void;

async function write(
  account: string,
  provider: EthProvider,
  functionName: string,
  args: unknown[],
  onProgress?: TxProgress,
) {
  const client = writer(account, provider);
  onProgress?.("Waiting for MetaMask signature…");
  const hash = await client.writeContract({
    address: getArenaAddress() as `0x${string}`,
    functionName,
    args: args as never[],
    value: 0n,
  });
  onProgress?.("Transaction sent to GenLayer consensus…");
  await client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.FINALIZED,
    interval: 3000,
    retries: 120,
  });
  onProgress?.("Finalized");
  return hash;
}

export function createBattleTx(
  account: string,
  provider: EthProvider,
  battle: { id: string; question: string; requirements: string[]; duration: number },
  onProgress?: TxProgress,
) {
  return write(
    account,
    provider,
    "create_battle",
    [battle.id, battle.question, JSON.stringify(battle.requirements), battle.duration],
    onProgress,
  );
}

export function submitTx(
  account: string,
  provider: EthProvider,
  data: { battleId: string; handle: string; answer: string; reasoning: string; sources: string },
  onProgress?: TxProgress,
) {
  return write(
    account,
    provider,
    "submit",
    [data.battleId, data.handle, data.answer, data.reasoning, data.sources],
    onProgress,
  );
}

export function judgeTx(
  account: string,
  provider: EthProvider,
  battleId: string,
  onProgress?: TxProgress,
) {
  return write(account, provider, "judge", [battleId], onProgress);
}

export function appealTx(
  account: string,
  provider: EthProvider,
  battleId: string,
  reason: string,
  onProgress?: TxProgress,
) {
  return write(account, provider, "appeal", [battleId, reason], onProgress);
}

export function shortAddress(addr?: string) {
  if (!addr) return "—";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
