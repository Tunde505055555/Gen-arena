# AI Agent Arena

A Web3 research battle game built on **GenLayer Studio**.

Players compete in timed, real-world research challenges. Each player submits an answer, reasoning, and sources. A **GenLayer Intelligent Contract** judges every submission on Accuracy, Evidence, Reasoning, and Requirements, then declares a winner with a confidence score and full breakdown. The losing player can appeal, and a live leaderboard tracks ratings, wins, and streaks.

---

## Deployed Contract

| Network | GenLayer Studio (chain 61999) |
| --- | --- |
| **Contract Address** | **`0x7326981188F036953Be07C63AF482B022706ccE6`** |
| **Chain ID** | `61999` (`0xf22f`) |
| **RPC** | `https://studio.genlayer.com/api` |
| **Source** | `src/contracts/agent_arena.py` |

The contract address is hardcoded in `src/lib/genlayer.ts` and cannot be changed at runtime.

---

## What This Game Is About

AI Agent Arena turns open-ended research into a competitive, on-chain game.

1. A battle is created with a real-world question and mandatory requirements.
2. Players connect their MetaMask wallet and join the battle.
3. Each player submits an answer, reasoning, and sources before the timer runs out.
4. The GenLayer contract calls an LLM judge through `gl.eq_principle.prompt_comparative` to score every submission.
5. Results show the winner, why they won, per-player scores, failed requirements, verdict, and confidence.
6. The losing player can appeal the verdict; the contract reviews the appeal and may overturn the result.
7. An Elo-style rating system updates player stats, visible on the global leaderboard.

---

## Game Flow

```
Home → Research Battle → GenLayer Judging → Results → Appeal → Leaderboard
```

| Route | Purpose |
| --- | --- |
| `/` | Home — choose or create a research challenge |
| `/battle/:battleId` | Timed research battle — submit answer, reasoning, and sources |
| `/results/:battleId` | Verdict — winner, scores, breakdown, failed requirements, confidence |
| `/appeal/:battleId` | Appeal — losing player challenges the verdict |
| `/leaderboard` | Global standings — rating, wins, win rate, streak |

---

## How to Play

1. **Connect MetaMask** — the app prompts you to add/switch to GenLayer Studio (chain 61999).
2. **Create or join a battle** from the home page.
3. **Submit your research** before the timer expires.
4. **Trigger judging** once at least two players have submitted.
5. **View results** — see the winner and the full score breakdown.
6. **Appeal** if you lost and believe the verdict was wrong.
7. **Check the leaderboard** to see your rating and streak.

---

## Tech Stack

- **Framework**: [TanStack Start](https://tanstack.com/start) (React 19, SSR/SSG, file-based routing)
- **Styling**: Tailwind CSS v4 with a custom "Dark Neon Arena" design system
- **Fonts**: Space Grotesk (headings), JetBrains Mono (code/mono)
- **Web3**: MetaMask + `genlayer-js`
- **Backend/Contract**: GenLayer Intelligent Contract (`src/contracts/agent_arena.py`)
- **Language**: TypeScript

---

## Project Structure

```
src/
├── contracts/
│   └── agent_arena.py          # GenLayer v0.3.0 intelligent contract
├── lib/
│   ├── genlayer.ts             # Contract client, types, and transactions
│   ├── wallet.tsx              # MetaMask connection and chain config
│   └── challenges.ts           # Built-in research challenge presets
├── components/
│   └── arena-shell.tsx         # Layout, nav, and wallet gate
├── routes/
│   ├── __root.tsx              # Root layout
│   ├── index.tsx               # Home
│   ├── battle.$battleId.tsx   # Battle / submission
│   ├── results.$battleId.tsx  # Results / verdict
│   ├── appeal.$battleId.tsx    # Appeal
│   └── leaderboard.tsx         # Leaderboard
└── styles.css                  # Tailwind v4 theme tokens
```

---

## Contract Methods

### Write methods

| Method | Description |
| --- | --- |
| `create_battle(id, question, requirements_json, duration_seconds)` | Create a new timed research battle |
| `submit(battle_id, handle, answer, reasoning, sources)` | Join a battle and submit research |
| `judge(battle_id)` | Trigger GenLayer LLM judging (requires ≥2 submissions) |
| `appeal(battle_id, reason)` | Losing player appeals the verdict |

### View methods

| Method | Returns |
| --- | --- |
| `get_arena_name()` | Arena name |
| `get_battle(id)` | Full battle JSON |
| `list_battles()` | Array of battle summaries |
| `get_leaderboard()` | Array of player stats |

---

## Local Development

Requires Node.js and a package manager (npm/bun).

```sh
git clone <repository-url>
cd <repository-name>
npm install
npm run dev
```

The dev server starts at `http://localhost:8080`.

---

## GenLayer Details

- **Runner version**: `v0.3.0`
- **Pinned dependency**: `py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6`
- **Storage**: `TreeMap` for battles/players, `DynArray` for index arrays (the only supported enumeration pattern)
- **Non-determinism**: Judging uses `gl.eq_principle.prompt_comparative` so the LLM output reaches consensus before being stored on-chain
- **Lint status**: The contract passes `gen_getContractSchemaForCode` validation with a clean, fully typed schema

---

## Deployment

The contract has already been deployed to GenLayer Studio at:

```
0x7326981188F036953Be07C63AF482B022706ccE6
```

No further deployment is required to use the app. The frontend is hardcoded to this address.

---

## License

This project was built with [Lovable](https://lovable.dev). The code is yours to own, modify, and ship.

## Evidence verification & invariants

Judging is no longer a pure LLM opinion on unchecked citations:

- **In-contract evidence fetch.** Every `http(s)` URL in a submission is parsed at
  submit time and rendered inside the non-deterministic block during `judge` /
  `appeal` (`gl.nondet.web.render`). The judge prompt receives the fetched page
  text plus a reachability flag per URL, and per-source verdicts
  (`reachable`, `supports_claim`) come back in the score payload and are shown on
  the results page. Unreachable citations score near zero on Evidence.
- **Enforced invariants.** Illegal transitions raise instead of silently
  returning: unknown battle, closed battle, duplicate battle id, too-short
  answer/reasoning, no cited URL, fewer than two distinct players, double
  judging, a verdict naming a non-participant, appeals by non-participants or by
  the winner, and more than one appeal.
- **Consistent ratings.** Elo is applied at most once per battle (`rated` flag);
  an overturned appeal reverts the exact previous outcome before applying the new
  one, so `wins + losses == battles` and total rating is conserved. Player
  records are validated before every write.
- **Tests.** `python3 src/contracts/test_agent_arena.py` runs the deterministic
  invariant suite (participant, result and lifecycle rules, appeal revert/reapply,
  evidence dossier construction) against a stubbed GenVM.
