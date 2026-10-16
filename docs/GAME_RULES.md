# Rules and original design

These rules describe the server-owned **tactical match**. The living isometric island on the landing page is a separate local browser simulation; its battles, resources, PX and seasons do not determine tactical matches or persist to the server.

Outpost Rivals uses compact territorial strategy as inspiration. It does not reuse Polytopia branding, art, characters, maps or source code.

## Win

Three home bases, three neutral banners, 37 hexes. Six simultaneous rounds. Holding a banner awards one renown at each round end. Holding all three ends the game immediately. Otherwise highest renown after round six wins; a tied top score is a draw. Mutual convoy pacts each grant one renown and Supply. Home bases cannot be entered by rivals.

## Orders

- Scout: move one or two hexes, reveal terrain; does not capture. Base cost 1.
- Contest: move one or two hexes into explored terrain and capture if victorious. Base cost 2. A captain can cross paths with another without fighting; combat occurs at the final destination.
- Develop: income upgrade costs 3, fortify/heal costs 2. Income cap +2; nearest eligible owned hex gets fortification, capped 2; heal restores 2 strength, cap4.
- Pact: offer one other faction a convoy. Costs1; mutual offers return3 each (Trader4) and add1 renown/trust. Unmatched offers are refunded unless the partner raids your current/owned ground, which records a grudge and rewards the raider1 Supply.
- Hold: no cost; keep current location.

A verified scenario can add at most1 to one action type. Supplies regenerate3 plus upgrades and captured supply posts, total income cap6; carried Supply cap15. Match Supply is never purchased.

## Factions and stance

All factions see radius2 plus owned tiles. Pathfinder Scout cost is reduced by1 before a possible scenario surcharge. Builder's first-round development cost is reduced by1. Trader gains1 extra Supply for a mutual convoy. These are modest differences, with fixed equal starts in ranked.

Bold adds1 clash power but Contest costs1 extra Supply. Careful adds1 power while defending a hex you own. Balanced has neither modifier. Power is current squad strength + stance modifier + owned fortification + deterministic seeded 0/1 roll. Ties send every involved squad home; losing squads return home. Every battling squad loses1 strength, minimum1. Uncontested captures reset captured fortifications. The deterministic roll is inspectable in a completed replay, not known to the browser during the game.

## Memory and agents

Each captain records trust/grudges toward faction IDs, capped -3..3. Tactical agents favor key objectives, heal when weak, occasionally coordinate a convoy, and account for relationships. This is transparent rule-based autonomy. Persistent player memory is saved after each match and restored into future unranked games. Ranked resets it. There is no LLM or autonomous financial execution.

## Timing and verification

Each round allows40 seconds. A sealed order cannot be changed. If every human has submitted, resolution happens immediately; bots submit from the pre-round state. On deadline, absent humans hold. Single-player therefore moves at your pace up to the deadline. Server restarts resume overdue rounds without trusting browser state.

Completed snapshots include orders and a SHA-256 chain over previous digest + serialized orders + serialized post-round state. This verifies internal receipt consistency, not honesty of the operator. Fog hides private active state; completed replays are public.

## What still needs player validation

Bots are not a substitute for human strategy testing. Validate faction balance, stalemate frequency, cost clarity, diplomacy comprehension, match length, fairness under latency, and whether players return without token incentives. The six-round format intentionally avoids endless offline compounding and paid progression advantages.
