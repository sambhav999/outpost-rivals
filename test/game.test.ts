import test from "node:test";
import assert from "node:assert/strict";
import {
  createGame,
  resolveRound,
  botOrder,
  validateOrder,
  viewGame,
  cost,
  scenario,
} from "../shared/game";
import { splitPayment } from "../shared/economy";
test("deterministic replay, bounded economy and legal agent orders over 600 games", () => {
  for (let seed = 0; seed < 600; seed++) {
    let s = createGame(
      "test:" + seed,
      undefined,
      undefined,
      scenario("2026-10-15"),
    );
    const initial = structuredClone(s);
    while (s.status === "active") {
      const orders = s.factions.map((f) => botOrder(s, f.id));
      orders.forEach((o, i) => assert.equal(validateOrder(s, i, o), null));
      s = resolveRound(s, orders);
      assert.equal(new Set(s.factions.map((f) => f.pos)).size, 3);
      s.factions.forEach((f) => {
        assert.ok(f.supplies >= 0 && f.supplies <= 15);
        assert.ok(f.hp >= 1 && f.hp <= 4);
        assert.ok(f.income <= 2);
      });
    }
    let replay = initial;
    for (const h of s.history) replay = resolveRound(replay, h.orders);
    assert.deepEqual(replay, s);
    assert.ok(s.history.length <= 6);
  }
});
test("fog does not reveal initial enemy positions, state seed or private supplies", () => {
  const v: any = viewGame(createGame("secret"), 0);
  assert.equal(v.seed, undefined);
  assert.equal(v.history, undefined);
  assert.equal(v.factions[1].supplies, null);
  assert.equal(v.factions[1].pos, null);
  assert.ok(v.tiles.some((t: any) => t.kind === "fog"));
});
test("server rejects unseen capture, distant movement, invalid pact, exhausted income", () => {
  const s = createGame("rules");
  assert.ok(validateOrder(s, 0, { type: "contest", target: "-3,2" }));
  assert.ok(validateOrder(s, 0, { type: "scout", target: "3,0" }));
  assert.ok(validateOrder(s, 0, { type: "pact", partner: 0 }));
  s.factions[0].income = 2;
  assert.ok(validateOrder(s, 0, { type: "develop", upgrade: "income" }));
});
test("mutual pact records trust and one-way pact refunds the offer", () => {
  const s = createGame("pact");
  const out = resolveRound(s, [
    { type: "pact", partner: 1 },
    { type: "pact", partner: 0 },
    { type: "hold" },
  ]);
  assert.equal(out.factions[0].memory["1"], 1);
  assert.equal(out.factions[0].score, 1);
  const no = resolveRound(s, [
    { type: "pact", partner: 1 },
    { type: "hold" },
    { type: "hold" },
  ]);
  assert.equal(no.factions[0].supplies, 8);
});
test("bold stance pays an explicit extra contest supply", () => {
  const s = createGame("stance");
  const before = cost(s, 0, { type: "contest" });
  s.factions[0].stance = "bold";
  assert.equal(cost(s, 0, { type: "contest" }), before + 1);
});
test("payment splits conserve every unit including rounding", () => {
  for (let n = 1n; n < 1000n; n++) {
    for (const asset of ["rival", "stable"] as const)
      for (const creator of [true, false]) {
        const s = splitPayment(n, asset, creator);
        assert.equal(
          Object.values(s).reduce((a, b) => a + b, 0n),
          n,
        );
      }
  }
});
