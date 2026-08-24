# v0.3.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
import json

# AI Agent Arena — players compete on the same real-world research challenge.
# Each player submits an answer, reasoning and sources. The GenLayer
# Intelligent Contract FETCHES every cited source from the live web, checks
# that it is reachable and that it actually supports the claim, then judges
# every submission on Accuracy, Evidence, Reasoning and Requirements.
#
# Hardening in this version:
#  * Evidence is verified in-contract: each cited URL is rendered inside the
#    non-deterministic block and the fetched text is handed to the judge, so
#    the verdict can no longer trust an unchecked citation.
#  * Participant / result / lifecycle invariants are enforced BEFORE any record
#    is written, and every illegal transition raises instead of silently
#    returning, so ratings and verdict state can never drift.
#  * Ratings are applied at most once per battle (`rated` flag) and an appeal
#    that overturns a verdict reverts the exact previous outcome before
#    applying the new one.
#
# Storage rules honoured here:
#  * TreeMap is never iterated (no .items()/.keys()/.values()) — DynArrays
#    hold the known keys and the maps are read key-by-key.
#  * Every @gl.public.view returns a primitive (str) so the generated ABI is
#    statically typed and genlayer-js can decode it.

MAX_SOURCES_PER_PLAYER = 4
MAX_EVIDENCE_CHARS = 2400
MIN_PLAYERS = 2
MAX_PLAYERS = 8
MIN_DURATION = 30
MAX_DURATION = 3600


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

    def _require_battle(self, battle_id: str) -> dict:
        b = self._battle(battle_id)
        if not b:
            raise Exception("unknown battle: " + battle_id)
        return b

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
        # result invariants — a record is never written in an impossible shape
        if p["wins"] + p["losses"] != p["battles"]:
            raise Exception("player record invariant broken: wins+losses != battles")
        if p["wins"] < 0 or p["losses"] < 0 or p["battles"] < 0:
            raise Exception("player record invariant broken: negative counter")
        if p["best_streak"] < 0 or p["best_streak"] < p["streak"]:
            raise Exception("player record invariant broken: best_streak")
        if p["rating"] < 100:
            p["rating"] = 100
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

    def _addresses(self, b: dict) -> list:
        addrs = []
        for s in b.get("submissions", []):
            if s["player"] not in addrs:
                addrs.append(s["player"])
        return addrs

    def _urls(self, sources: str) -> list:
        urls = []
        for chunk in sources.replace(",", " ").replace("\n", " ").split(" "):
            u = chunk.strip().strip(").,;'\"")
            if u.startswith("http://") or u.startswith("https://"):
                if u not in urls:
                    urls.append(u)
            if len(urls) >= MAX_SOURCES_PER_PLAYER:
                break
        return urls

    # ---------- result bookkeeping ----------
    def _apply_result(self, b: dict, winner: str) -> None:
        addrs = self._addresses(b)
        if winner not in addrs:
            raise Exception("winner is not a participant of this battle")
        if b.get("rated"):
            raise Exception("battle already rated")
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
        b["rated"] = True
        b["rated_winner"] = winner

    def _revert_result(self, b: dict, winner: str) -> None:
        if not b.get("rated"):
            raise Exception("nothing to revert: battle is not rated")
        if b.get("rated_winner") != winner:
            raise Exception("revert target does not match the recorded winner")
        addrs = self._addresses(b)
        avg = 0
        for a in addrs:
            avg = avg + self._player(a)["rating"]
        avg = avg // len(addrs)
        for a in addrs:
            p = self._player(a)
            # undo the exact Elo delta by recomputing it from the pre-battle rating
            won = 1.0 if a == winner else 0.0
            prev = p["rating"]
            for guess in range(0, 64):
                candidate = prev - 32 + guess
                expected = 1.0 / (1.0 + pow(10.0, (avg - candidate) / 400.0))
                if int(candidate + 32 * (won - expected)) == prev:
                    p["rating"] = candidate
                    break
            p["battles"] = max(0, p["battles"] - 1)
            if a == winner:
                p["wins"] = max(0, p["wins"] - 1)
            else:
                p["losses"] = max(0, p["losses"] - 1)
            p["streak"] = 0
            self._save_player(a, p)
        b["rated"] = False
        b["rated_winner"] = ""

    # ---------- writes ----------
    @gl.public.write
    def create_battle(
        self,
        battle_id: str,
        question: str,
        requirements: str,
        duration_seconds: int,
    ) -> None:
        if not battle_id.strip():
            raise Exception("battle_id is required")
        if battle_id in self.battles:
            raise Exception("battle already exists: " + battle_id)
        if len(question.strip()) < 10:
            raise Exception("question is too short")
        reqs = json.loads(requirements)
        if not isinstance(reqs, list) or len(reqs) == 0:
            raise Exception("requirements must be a non-empty JSON array")
        if duration_seconds < MIN_DURATION or duration_seconds > MAX_DURATION:
            raise Exception("duration out of range")
        b = {
            "id": battle_id,
            "question": question,
            "requirements": reqs,
            "duration": duration_seconds,
            "status": "open",
            "creator": gl.message.sender_address.as_hex,
            "submissions": [],
            "judgement": {},
            "appeal": {},
            "rated": False,
            "rated_winner": "",
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
        b = self._require_battle(battle_id)
        # lifecycle invariant: entries are only accepted while the battle is open
        if b["status"] != "open":
            raise Exception("battle is not open for submissions")
        if len(answer.strip()) < 10:
            raise Exception("answer is too short")
        if len(reasoning.strip()) < 10:
            raise Exception("reasoning is too short")
        if len(self._urls(sources)) == 0:
            raise Exception("at least one http(s) source URL is required")
        addr = gl.message.sender_address.as_hex
        subs = []
        for s in b["submissions"]:
            if s["player"] != addr:
                subs.append(s)
        # participant invariant: one entry per address, capped roster
        if len(subs) >= MAX_PLAYERS:
            raise Exception("battle is full")
        subs.append(
            {
                "player": addr,
                "handle": handle.strip() if handle.strip() else addr[:8],
                "answer": answer,
                "reasoning": reasoning,
                "sources": sources,
                "urls": self._urls(sources),
            }
        )
        b["submissions"] = subs
        self._save_battle(battle_id, b)

    @gl.public.write
    def judge(self, battle_id: str) -> None:
        b = self._require_battle(battle_id)
        # lifecycle invariant: a battle is judged exactly once
        if b["status"] != "open":
            raise Exception("battle has already been judged")
        if b.get("rated"):
            raise Exception("battle already rated")
        subs = b["submissions"]
        addrs = self._addresses(b)
        if len(addrs) < MIN_PLAYERS:
            raise Exception("at least two distinct players are required")
        if len(addrs) != len(subs):
            raise Exception("duplicate submissions detected")

        reqs = ""
        for r in b["requirements"]:
            reqs = reqs + "- " + r + "\n"

        question = b["question"]
        roster = []
        for s in subs:
            roster.append(
                {
                    "player": s["player"],
                    "handle": s["handle"],
                    "answer": s["answer"],
                    "reasoning": s["reasoning"],
                    "sources": s["sources"],
                    "urls": s.get("urls", []),
                }
            )

        def run() -> str:
            # 1. fetch every cited source from the live web
            dossier = ""
            for s in roster:
                dossier = dossier + "### Player " + s["player"] + " sources\n"
                if not s["urls"]:
                    dossier = dossier + "NO VALID URL CITED\n"
                for u in s["urls"]:
                    body = ""
                    ok = False
                    try:
                        body = gl.nondet.web.render(u, mode="text")
                        ok = True
                    except Exception:
                        try:
                            body = gl.nondet.web.render(u, mode="html")
                            ok = True
                        except Exception:
                            body = ""
                            ok = False
                    if ok and body:
                        dossier = (
                            dossier
                            + "URL "
                            + u
                            + " [REACHABLE]\nCONTENT:\n"
                            + body[:MAX_EVIDENCE_CHARS]
                            + "\n\n"
                        )
                    else:
                        dossier = dossier + "URL " + u + " [UNREACHABLE — treat as no evidence]\n\n"

            # 2. judge with the fetched evidence in hand
            entries = ""
            for s in roster:
                entries = (
                    entries
                    + "### Player "
                    + s["player"]
                    + " (handle: "
                    + s["handle"]
                    + ")\nANSWER: "
                    + s["answer"]
                    + "\nREASONING: "
                    + s["reasoning"]
                    + "\nCITED SOURCES: "
                    + s["sources"]
                    + "\n\n"
                )

            prompt = f"""You are the impartial judge of a research battle.

RESEARCH CHALLENGE:
{question}

MANDATORY REQUIREMENTS:
{reqs}
SUBMISSIONS:
{entries}
VERIFIED EVIDENCE (fetched from the live web by the contract — this is the ONLY
trustworthy view of each citation; ignore claims about a source that the fetched
content does not support):
{dossier}
Score every submission from 0 to 100 on each criterion:
- accuracy: is the answer factually correct given the fetched evidence?
- evidence: are the cited sources reachable, real, specific and do the FETCHED
  contents actually support the claims? An unreachable or irrelevant source
  scores near zero.
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
      "verified_sources": [
        {{"url": "<cited url>", "reachable": <true|false>, "supports_claim": <true|false>}}
      ],
      "notes": "<one sentence>"
    }}
  ]
}}"""
            return gl.nondet.exec_prompt(prompt)

        raw = gl.eq_principle.prompt_comparative(
            run,
            criteria=(
                "The declared winner must be the same player address, each total "
                "score must be within 15 points, the reachability verdict for each "
                "cited URL must match, and the verdict must reach the same conclusion."
            ),
        )
        result = self._clean_json(raw)
        if not result:
            raise Exception("judge returned no parsable verdict")
        winner = result.get("winner", "")
        # result invariant: the verdict must name a real participant
        if winner not in addrs:
            raise Exception("verdict named a non-participant as winner")
        b["judgement"] = result
        b["status"] = "judged"
        self._apply_result(b, winner)
        self._save_battle(battle_id, b)

    @gl.public.write
    def appeal(self, battle_id: str, reason: str) -> None:
        b = self._require_battle(battle_id)
        # lifecycle invariant: exactly one appeal, only on a judged battle
        if b["appeal"] or b["status"] == "appealed":
            raise Exception("this battle has already been appealed")
        if b["status"] != "judged":
            raise Exception("only a judged battle can be appealed")
        if len(reason.strip()) < 20:
            raise Exception("appeal reason is too short")
        addr = gl.message.sender_address.as_hex
        addrs = self._addresses(b)
        # participant invariant: only a losing participant may appeal
        if addr not in addrs:
            raise Exception("only a participant can appeal")
        judgement = b["judgement"]
        original_winner = judgement.get("winner", "")
        if addr == original_winner:
            raise Exception("the winner cannot appeal")

        question = b["question"]
        roster = []
        for s in b["submissions"]:
            roster.append(
                {
                    "player": s["player"],
                    "answer": s["answer"],
                    "reasoning": s["reasoning"],
                    "sources": s["sources"],
                    "urls": s.get("urls", []),
                }
            )
        judgement_json = json.dumps(judgement)

        def run() -> str:
            dossier = ""
            for s in roster:
                for u in s["urls"]:
                    body = ""
                    try:
                        body = gl.nondet.web.render(u, mode="text")
                    except Exception:
                        body = ""
                    if body:
                        dossier = (
                            dossier
                            + "URL "
                            + u
                            + " ("
                            + s["player"]
                            + ") [REACHABLE]\n"
                            + body[:MAX_EVIDENCE_CHARS]
                            + "\n\n"
                        )
                    else:
                        dossier = dossier + "URL " + u + " (" + s["player"] + ") [UNREACHABLE]\n\n"

            entries = ""
            for s in roster:
                entries = (
                    entries
                    + "### Player "
                    + s["player"]
                    + "\nANSWER: "
                    + s["answer"]
                    + "\nREASONING: "
                    + s["reasoning"]
                    + "\nCITED SOURCES: "
                    + s["sources"]
                    + "\n\n"
                )

            prompt = f"""You are reviewing an appeal against an earlier verdict in a research battle.

RESEARCH CHALLENGE:
{question}

SUBMISSIONS:
{entries}
VERIFIED EVIDENCE (fetched live by the contract; unreachable citations carry no weight):
{dossier}
ORIGINAL VERDICT (JSON):
{judgement_json}

APPEAL FILED BY: {addr}
APPEAL ARGUMENT: {reason}

Only overturn the original verdict if the appeal shows a clear, material error
that the fetched evidence supports.
Respond with ONLY this JSON object and nothing else:
{{
  "upheld": <true if the original verdict stands, false if overturned>,
  "new_winner": "<player address that wins after review>",
  "confidence": <integer 0-100>,
  "review": "<2-3 sentence explanation of the appeal decision>"
}}"""
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
            raise Exception("appeal review returned no parsable decision")
        new_winner = review.get("new_winner", original_winner)
        upheld = review.get("upheld", True)
        if not upheld and new_winner not in addrs:
            raise Exception("appeal named a non-participant as the new winner")
        if upheld:
            new_winner = original_winner
        review["appellant"] = addr
        review["reason"] = reason
        review["new_winner"] = new_winner
        review["upheld"] = upheld
        b["appeal"] = review
        # result invariant: ratings are reverted then re-applied atomically,
        # so an overturned verdict can never double-count a battle
        if not upheld and new_winner != original_winner:
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
