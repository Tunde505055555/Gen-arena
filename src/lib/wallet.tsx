import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { STUDIO_CHAIN } from "./genlayer";

type EthProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
};

type WalletState = {
  address: string | null;
  provider: EthProvider | null;
  connecting: boolean;
  hasMetaMask: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
};

const WalletContext = createContext<WalletState | null>(null);

function getProvider(): EthProvider | null {
  if (typeof window === "undefined") return null;
  const eth = (window as unknown as { ethereum?: EthProvider }).ethereum;
  return eth ?? null;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [hasMetaMask, setHasMetaMask] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const eth = getProvider();
    setHasMetaMask(Boolean(eth));
    if (!eth) return;
    eth
      .request({ method: "eth_accounts" })
      .then((accs) => {
        const list = accs as string[];
        if (list?.length) setAddress(list[0] ?? null);
      })
      .catch(() => undefined);
    const onAccounts = (...args: never[]) => {
      const list = args[0] as unknown as string[];
      setAddress(list?.length ? (list[0] ?? null) : null);
    };
    eth.on?.("accountsChanged", onAccounts);
    return () => eth.removeListener?.("accountsChanged", onAccounts);
  }, []);

  const connect = useCallback(async () => {
    const eth = getProvider();
    if (!eth) {
      setHasMetaMask(false);
      setError("MetaMask not detected. Install the MetaMask extension to enter the arena.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const accs = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      try {
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: STUDIO_CHAIN.chainIdHex }],
        });
      } catch {
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: STUDIO_CHAIN.chainIdHex,
              chainName: "GenLayer Studio",
              nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
              rpcUrls: [STUDIO_CHAIN.rpc],
              blockExplorerUrls: ["https://genlayer-explorer.vercel.app"],
            },
          ],
        });
      }
      setAddress(accs[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Wallet connection rejected.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const value = useMemo<WalletState>(
    () => ({
      address,
      provider: getProvider(),
      connecting,
      hasMetaMask,
      error,
      connect,
      disconnect: () => setAddress(null),
    }),
    [address, connecting, hasMetaMask, error, connect],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
