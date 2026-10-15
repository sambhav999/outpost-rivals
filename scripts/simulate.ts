import { createGame, resolveRound, botOrder, scenario } from "../shared/game";
import { mkdirSync, writeFileSync } from "node:fs";
const games = Number(process.env.SIM_GAMES || 1200),
  wins = [0, 0, 0],
  scores = [0, 0, 0];
let draws = 0,
  rounds = 0,
  violations = 0,
  pacts = 0;
for (let i = 0; i < games; i++) {
  let s = createGame(
    "simulation:" + i,
    undefined,
    undefined,
    scenario("2026-10-" + String(1 + (i % 28)).padStart(2, "0")),
  );
  while (s.status === "active") {
    s = resolveRound(
      s,
      s.factions.map((f) => botOrder(s, f.id)),
    );
    rounds++;
    if (
      s.factions.some(
        (f) => f.supplies < 0 || f.supplies > 15 || f.hp < 1 || f.hp > 4,
      )
    )
      violations++;
  }
  if (s.winner === -1) draws++;
  else wins[s.winner!]++;
  s.factions.forEach((f) => (scores[f.id] += f.score));
  pacts += s.events.filter((e) => e.kind === "pact").length;
}
const report = {
  games,
  wins,
  winRates: wins.map((w) => Number(((w / games) * 100).toFixed(2))),
  draws,
  averageRounds: rounds / games,
  averageScores: scores.map((s) => s / games),
  invariantViolations: violations,
  pactEvents: pacts,
  scope:
    "Deterministic autonomous-policy simulations only. Not human retention, token demand, profitability, exploit resistance, or a claim of competitive balance.",
};
mkdirSync("reports", { recursive: true });
writeFileSync("reports/simulation.json", JSON.stringify(report, null, 2));
console.log(report);
if (violations) process.exitCode = 1;
