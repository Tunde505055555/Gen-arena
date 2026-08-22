# v0.3.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

# AI Agent Arena — players compete on the same real-world research challenge.
# Each player submits an answer, reasoning and sources. The GenLayer
# Intelligent Contract judges every submission on Accuracy, Evidence,
# Reasoning and Requirements, then returns a winner, per-player scores,
# a score breakdown, failed requirements, a verdict and a confidence.
#
# Storage rules honoured here:
#  * TreeMap is never iterated (no .items()/.keys()/.values()) — DynArrays
#    hold the known keys and the maps are read key-by-key.
#  * Every @gl.public.view returns a primitive (str) so the generated ABI is
#    statically typed and genlayer-js can decode it. Structured payloads are
#    JSON-encoded strings.


class AgentArena(gl.Contract):
    arena_name: str
    # battles[battle_id] = json blob
    battles: TreeMap[str, str]
    # players[address] = json stats blob
    players: TreeMap[str, str]
    # index arrays — the only supported way to enumerate map keys
    battle_index: DynArray[str]
    player_index: DynArray[str]

    def __init__(self, arena_name: str):
        self.arena_name = arena_name

    # ---------- helpers ----------
    def _read_battle(self, battle_id: str) -> str:
        if battle_id in self.battles:
            return self.battles[battle_id]
        return ""

    def _battle(self, battle_id: str) -> dict:
        raw = self._read_battle(battle_id)
        if not raw:
            return {}
        return json.loads(raw)

    def _save_battle(self, battle_id: str, b: dict) -> None:
        if battle_id not in self.battles:
            self.battle_index.append(battle_id)
        self.battles[battle_id] = json.dumps(b)

    def _player(self, addr: str) -> dict:
        if addr in self.players:
            return json.loads(self.players[addr])
        return {
            "address": addr,
            "rating": 1200,
            "wins": 0,
            "losses": 0,
            "battles": 0,
            "streak": 0,
            "best_streak": 0,
        }

    def _save_player(self, addr: str, p: dict) -> None:
        if addr not in self.players:
            self.player_index.append(addr)
        self.players[addr] = json.dumps(p)

    def _clean_json(self, text: str) -> dict:
        t = text.strip()
        if t.startswith("```"):
            t = t.split("```")[1]
            if t.startswith("json"):
                t = t[4:]
        start = t.find("{")
        end = t.rfind("}")
        if start == -1 or end == -1:
            return {}
        return json.loads(t[start : end + 1])

    def _apply_result(self, b: dict, winner: str) -> None:
        subs = b.get("submissions", [])
        addrs = []
        for s in subs:
            addrs.append(s["player"])
        if len(addrs) < 2:
            return
        avg = 0
        for a in addrs:
            avg = avg + self._player(a)["rating"]
        avg = avg // len(addrs)
        for a in addrs:
            p = self._player(a)
            expected = 1.0 / (1.0 + pow(10.0, (avg - p["rating"]) / 400.0))
            won = 1.0 if a == winner else 0.0
            p["rating"] = int(p["rating"] + 32 * (won - expected))
            p["battles"] = p["battles"] + 1
            if a == winner:
                p["wins"] = p["wins"] + 1
                p["streak"] = p["streak"] + 1 if p["streak"] > 0 else 1
                if p["streak"] > p["best_streak"]:
                    p["best_streak"] = p["streak"]
            else:
                p["losses"] = p["losses"] + 1
                p["streak"] = p["streak"] - 1 if p["streak"] < 0 else -1
            self._save_player(a, p)

    def _revert_result(self, b: dict, winner: str) -> None:
        subs = b.get("submissions", [])
        for s in subs:
            a = s["player"]
            p = self._player(a)
            p["battles"] = max(0, p["battles"] - 1)
            if a == winner:
                p["wins"] = max(0, p["wins"] - 1)
            else:
                p["losses"] = max(0, p["losses"] - 1)
            p["streak"] = 0
            self._save_player(a, p)

    # ---------- writes ----------
    @gl.public.write
    def create_battle(
        self,
        battle_id: str,
        question: str,
        requirements: str,
        duration_seconds: int,
    ) -> None:
        if battle_id in self.battles:
            return
        b = {
            "id": battle_id,
            "question": question,
            "requirements": json.loads(requirements),
            "duration": duration_seconds,
            "status": "open",
            "creator": gl.message.sender_address.as_hex,
            "submissions": [],
            "judgement": {},
            "appeal": {},
        }
        self._save_battle(battle_id, b)

    @gl.public.write
    def submit(
        self,
        battle_id: str,
        handle: str,
        answer: str,
        reasoning: str,
        sources: str,
    ) -> None:
        b = self._battle(battle_id)
        if not b:
            return
        if b["status"] != "open":
            return
        addr = gl.message.sender_address.as_hex
        subs = []
        for s in b["submissions"]:
            if s["player"] != addr:
                subs.append(s)
        subs.append(
            {
                "player": addr,
                "handle": handle,
                "answer": answer,
                "reasoning": reasoning,
                "sources": sources,
            }
        )
        b["submissions"] = subs
        self._save_battle(battle_id, b)

    @gl.public.write
    def judge(self, battle_id: str) -> None:
        b = self._battle(battle_id)
        if not b:
            return
        if b["status"] == "judged":
            return
        subs = b["submissions"]
        if len(subs) < 2:
            return

        reqs = ""
        for r in b["requirements"]:
            reqs = reqs + "- " + r + "\n"

        entries = ""
        for s in subs:
            entries = (
                entries
                + "### Player "
                + s["player"]
                + " (handle: "
                + s["handle"]
                + ")\n"
                + "ANSWER: "
                + s["answer"]
                + "\n"
                + "REASONING: "
                + s["reasoning"]
                + "\n"
                + "SOURCES: "
                + s["sources"]
                + "\n\n"
            )

        prompt = f"""You are the impartial judge of a research battle.

RESEARCH CHALLENGE:
{b["question"]}

MANDATORY REQUIREMENTS:
{reqs}
SUBMISSIONS:
{entries}
Score every submission from 0 to 100 on each criterion:
- accuracy: is the answer factually correct?
- evidence: are the sources real, specific and supporting?
- reasoning: is the argument logical and complete?
- requirements: were the mandatory requirements met?

The total score is the average of the four criteria, rounded to an integer.
The winner is the player address with the highest total score.

Respond with ONLY this JSON object and nothing else:
{{
  "winner": "<player address>",
  "confidence": <integer 0-100>,
  "verdict": "<2-3 sentence explanation of why the winner won>",
  "scores": [
    {{
      "player": "<player address>",
      "total": <integer 0-100>,
      "breakdown": {{
        "accuracy": <integer>,
        "evidence": <integer>,
        "reasoning": <integer>,
        "requirements": <integer>
      }},
      "failed_requirements": ["<requirement text>"],
      "notes": "<one sentence>"
    }}
  ]
}}"""

        def run() -> str:
            return gl.nondet.exec_prompt(prompt)

        raw = gl.eq_principle.prompt_comparative(
            run,
            criteria=(
                "The declared winner must be the same player address, each total "
                "score must be within 15 points, and the verdict must reach the "
                "same conclusion."
            ),
        )
        result = self._clean_json(raw)
        if not result:
            return
        b["judgement"] = result
        b["status"] = "judged"
        self._save_battle(battle_id, b)
        self._apply_result(b, result.get("winner", ""))

    @gl.public.write
    def appeal(self, battle_id: str, reason: str) -> None:
        b = self._battle(battle_id)
        if not b:
            return
        if b["status"] != "judged":
            return
        if b["appeal"]:
            return
        addr = gl.message.sender_address.as_hex
        judgement = b["judgement"]
        original_winner = judgement.get("winner", "")
        if addr == original_winner:
            return

        entries = ""
        for s in b["submissions"]:
            entries = (
                entries
                + "### Player "
                + s["player"]
                + "\nANSWER: "
                + s["answer"]
                + "\nREASONING: "
                + s["reasoning"]
                + "\nSOURCES: "
                + s["sources"]
                + "\n\n"
            )

        prompt = f"""You are reviewing an appeal against an earlier verdict in a research battle.

RESEARCH CHALLENGE:
{b["question"]}

SUBMISSIONS:
{entries}
ORIGINAL VERDICT (JSON):
{json.dumps(judgement)}

APPEAL FILED BY: {addr}
APPEAL ARGUMENT: {reason}

Only overturn the original verdict if the appeal shows a clear, material error.
Respond with ONLY this JSON object and nothing else:
{{
  "upheld": <true if the original verdict stands, false if overturned>,
  "new_winner": "<player address that wins after review>",
  "confidence": <integer 0-100>,
  "review": "<2-3 sentence explanation of the appeal decision>"
}}"""

        def run() -> str:
            return gl.nondet.exec_prompt(prompt)

        raw = gl.eq_principle.prompt_comparative(
            run,
            criteria=(
                "The upheld/overturned decision and the resulting winner address "
                "must match, and the review must reach the same conclusion."
            ),
        )
        review = self._clean_json(raw)
        if not review:
            return
        review["appellant"] = addr
        review["reason"] = reason
        b["appeal"] = review
        new_winner = review.get("new_winner", original_winner)
        if not review.get("upheld", True) and new_winner != original_winner:
            self._revert_result(b, original_winner)
            self._apply_result(b, new_winner)
            b["judgement"]["winner"] = new_winner
        b["status"] = "appealed"
        self._save_battle(battle_id, b)

    # ---------- views ----------
    @gl.public.view
    def get_arena_name(self) -> str:
        return self.arena_name

    @gl.public.view
    def get_battle(self, battle_id: str) -> str:
        return self._read_battle(battle_id)

    @gl.public.view
    def list_battles(self) -> str:
        out = []
        for bid in self.battle_index:
            b = self._battle(bid)
            if not b:
                continue
            out.append(
                {
                    "id": b["id"],
                    "question": b["question"],
                    "status": b["status"],
                    "players": len(b["submissions"]),
                }
            )
        return json.dumps(out)

    @gl.public.view
    def get_leaderboard(self) -> str:
        out = []
        for addr in self.player_index:
            out.append(json.loads(self.players[addr]))
        return json.dumps(out)
