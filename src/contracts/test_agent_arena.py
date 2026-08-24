"""Invariant tests for the AgentArena Intelligent Contract.

Run with:  python3 src/contracts/test_agent_arena.py

The GenVM runtime is not available off-chain, so the module is loaded with a
small stub of the `genlayer` namespace: storage maps become dicts, the
non-deterministic block is executed locally, and web fetches / LLM calls are
faked. Everything that is *deterministic* in the contract (participant,
result and lifecycle invariants, Elo bookkeeping, appeal revert/re-apply) is
exercised for real.
"""

import json
import sys
import types
from pathlib import Path

# ---------- genlayer stub ----------
gl = types.SimpleNamespace()


def _identity(fn):
    return fn


gl.public = types.SimpleNamespace(write=_identity, view=_identity)
gl.Contract = object
gl.message = types.SimpleNamespace(sender_address=types.SimpleNamespace(as_hex="0x0"))

WEB = {}
LLM = {"reply": ""}


def _render(url, mode="text"):
    if url in WEB:
        return WEB[url]
    raise Exception("unreachable")


gl.nondet = types.SimpleNamespace(
    web=types.SimpleNamespace(render=_render),
    exec_prompt=lambda prompt: LLM["reply"],
)
gl.eq_principle = types.SimpleNamespace(prompt_comparative=lambda fn, criteria="": fn())

stub = types.ModuleType("genlayer")
stub.gl = gl
stub.TreeMap = dict
stub.DynArray = list
sys.modules["genlayer"] = stub

src = (Path(__file__).parent / "agent_arena.py").read_text()
mod = types.ModuleType("agent_arena")
mod.__dict__["__file__"] = "agent_arena.py"
exec(compile(src, "agent_arena.py", "exec"), mod.__dict__)
AgentArena = mod.AgentArena


# ---------- harness ----------
def sender(addr):
    gl.message.sender_address.as_hex = addr


def arena():
    a = AgentArena.__new__(AgentArena)
    a.battles = {}
    a.players = {}
    a.battle_index = []
    a.player_index = []
    a.arena_name = "test arena"
    return a


A = "0xaaa1"
B = "0xbbb2"
C = "0xccc3"
URL_A = "https://example.com/a"
URL_B = "https://example.com/b"
WEB[URL_A] = "solar capacity grew 32 percent in 2025"
WEB[URL_B] = "grid storage deployments doubled in 2025"

FAILED = []


def check(name, fn):
    try:
        fn()
        print("PASS", name)
    except AssertionError as e:
        FAILED.append(name)
        print("FAIL", name, "-", e)
    except Exception as e:  # noqa: BLE001
        FAILED.append(name)
        print("ERROR", name, "-", type(e).__name__, e)


def raises(fn, needle):
    try:
        fn()
    except Exception as e:  # noqa: BLE001
        assert needle in str(e), f"expected '{needle}', got '{e}'"
        return
    raise AssertionError(f"expected raise containing '{needle}'")


def seeded():
    a = arena()
    sender(A)
    a.create_battle("b1", "Which grid tech scaled most in 2025?", json.dumps(["cite a source"]), 300)
    sender(A)
    a.submit("b1", "ada", "Solar scaled the most in 2025.", "Capacity data shows it.", URL_A)
    sender(B)
    a.submit("b1", "bob", "Storage scaled the most in 2025.", "Deployments doubled.", URL_B)
    return a


def verdict(winner, other):
    return json.dumps(
        {
            "winner": winner,
            "confidence": 82,
            "verdict": "clearer evidence",
            "scores": [
                {
                    "player": winner,
                    "total": 88,
                    "breakdown": {
                        "accuracy": 90,
                        "evidence": 88,
                        "reasoning": 86,
                        "requirements": 88,
                    },
                    "failed_requirements": [],
                    "verified_sources": [{"url": URL_A, "reachable": True, "supports_claim": True}],
                    "notes": "ok",
                },
                {
                    "player": other,
                    "total": 61,
                    "breakdown": {
                        "accuracy": 60,
                        "evidence": 55,
                        "reasoning": 65,
                        "requirements": 64,
                    },
                    "failed_requirements": ["cite a source"],
                    "verified_sources": [{"url": URL_B, "reachable": True, "supports_claim": False}],
                    "notes": "weaker",
                },
            ],
        }
    )


# ---------- lifecycle invariants ----------
def t_duplicate_battle():
    a = seeded()
    sender(A)
    raises(lambda: a.create_battle("b1", "another question here", json.dumps(["x"]), 300), "already exists")


def t_bad_creation():
    a = arena()
    sender(A)
    raises(lambda: a.create_battle("b2", "short", json.dumps(["x"]), 300), "too short")
    raises(lambda: a.create_battle("b2", "a long enough question?", json.dumps([]), 300), "non-empty")
    raises(lambda: a.create_battle("b2", "a long enough question?", json.dumps(["x"]), 5), "out of range")


def t_submit_requires_source():
    a = seeded()
    sender(C)
    raises(
        lambda: a.submit("b1", "cy", "An answer long enough.", "Some reasoning here.", "trust me"),
        "source URL",
    )


def t_submit_unknown_battle():
    a = seeded()
    sender(C)
    raises(lambda: a.submit("nope", "cy", "An answer long enough.", "Reasoning here.", URL_A), "unknown battle")


def t_judge_needs_two_players():
    a = arena()
    sender(A)
    a.create_battle("solo", "Is there a single player here?", json.dumps(["x"]), 300)
    a.submit("solo", "ada", "An answer long enough.", "Reasoning here.", URL_A)
    LLM["reply"] = verdict(A, B)
    raises(lambda: a.judge("solo"), "two distinct players")


def t_judge_once():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    raises(lambda: a.judge("b1"), "already been judged")


def t_no_submit_after_judging():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    sender(C)
    raises(lambda: a.submit("b1", "cy", "A late answer here.", "Late reasoning.", URL_A), "not open")


def t_non_participant_winner_rejected():
    a = seeded()
    LLM["reply"] = verdict(C, A)
    raises(lambda: a.judge("b1"), "non-participant")
    assert a._battle("b1")["status"] == "open", "state must be untouched after a bad verdict"
    assert a.players == {}, "no ratings may be written after a bad verdict"


# ---------- result invariants ----------
def t_ratings_applied_once():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    pa = json.loads(a.players[A])
    pb = json.loads(a.players[B])
    assert pa["wins"] == 1 and pa["losses"] == 0 and pa["battles"] == 1, pa
    assert pb["wins"] == 0 and pb["losses"] == 1 and pb["battles"] == 1, pb
    assert pa["rating"] > 1200 > pb["rating"], (pa["rating"], pb["rating"])
    assert a._battle("b1")["rated"] is True


def t_double_apply_blocked():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    b = a._battle("b1")
    raises(lambda: a._apply_result(b, A), "already rated")


def t_revert_requires_rated():
    a = seeded()
    b = a._battle("b1")
    raises(lambda: a._revert_result(b, A), "not rated")


def t_player_record_invariant():
    a = arena()
    raises(
        lambda: a._save_player(A, {"address": A, "rating": 1200, "wins": 2, "losses": 0, "battles": 1, "streak": 1, "best_streak": 1}),
        "wins+losses != battles",
    )


# ---------- appeal invariants ----------
def t_appeal_only_loser():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    sender(A)
    LLM["reply"] = json.dumps({"upheld": True, "new_winner": A, "confidence": 70, "review": "stands"})
    raises(lambda: a.appeal("b1", "I believe the verdict was wrong for reasons."), "winner cannot appeal")
    sender(C)
    raises(lambda: a.appeal("b1", "I believe the verdict was wrong for reasons."), "only a participant")


def t_appeal_once():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    sender(B)
    LLM["reply"] = json.dumps({"upheld": True, "new_winner": A, "confidence": 70, "review": "stands"})
    a.appeal("b1", "The fetched evidence supports my answer instead.")
    raises(lambda: a.appeal("b1", "The fetched evidence supports my answer instead."), "already been appealed")


def t_upheld_appeal_keeps_ratings():
    a = seeded()
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    before = (a.players[A], a.players[B])
    sender(B)
    LLM["reply"] = json.dumps({"upheld": True, "new_winner": A, "confidence": 70, "review": "stands"})
    a.appeal("b1", "The fetched evidence supports my answer instead.")
    assert (a.players[A], a.players[B]) == before, "an upheld appeal must not touch ratings"
    assert a._battle("b1")["status"] == "appealed"


def t_overturned_appeal_is_consistent():
    a = seeded()
    pre_a = a._player(A)["rating"]
    pre_b = a._player(B)["rating"]
    LLM["reply"] = verdict(A, B)
    a.judge("b1")
    sender(B)
    LLM["reply"] = json.dumps({"upheld": False, "new_winner": B, "confidence": 76, "review": "overturned"})
    a.appeal("b1", "My source is reachable and directly supports the claim.")
    pa = json.loads(a.players[A])
    pb = json.loads(a.players[B])
    assert pa["battles"] == 1 and pb["battles"] == 1, (pa, pb)
    assert pb["wins"] == 1 and pb["losses"] == 0, pb
    assert pa["wins"] == 0 and pa["losses"] == 1, pa
    # the reverted-then-reapplied ratings must mirror a battle B simply won
    assert pb["rating"] > pre_b > 0 and pa["rating"] < pre_a, (pa["rating"], pb["rating"])
    assert pa["rating"] + pb["rating"] == pre_a + pre_b, "rating must be conserved after revert+reapply"
    b = a._battle("b1")
    assert b["judgement"]["winner"] == B
    assert b["rated"] is True and b["rated_winner"] == B


# ---------- evidence verification ----------
def t_unreachable_source_marked():
    a = arena()
    sender(A)
    a.create_battle("b3", "Which grid tech scaled most?", json.dumps(["cite a source"]), 300)
    seen = {}
    sender(A)
    a.submit("b3", "ada", "Solar scaled the most.", "Capacity data shows it.", URL_A)
    sender(B)
    a.submit("b3", "bob", "Storage scaled the most.", "Deployments doubled.", "https://dead.example/x")

    def capture(prompt):
        seen["prompt"] = prompt
        return verdict(A, B)

    gl.nondet.exec_prompt = capture
    a.judge("b3")
    gl.nondet.exec_prompt = lambda prompt: LLM["reply"]
    p = seen["prompt"]
    assert "solar capacity grew 32 percent" in p, "fetched page content must reach the judge"
    assert "[UNREACHABLE" in p, "dead links must be flagged to the judge"


def t_urls_parsed():
    a = arena()
    got = a._urls("see https://a.com/x, https://b.com/y and https://a.com/x")
    assert got == ["https://a.com/x", "https://b.com/y"], got


for name, fn in list(globals().items()):
    if name.startswith("t_"):
        check(name[2:], fn)

print()
if FAILED:
    print(f"{len(FAILED)} test(s) failed:", ", ".join(FAILED))
    sys.exit(1)
print("all invariant tests passed")
