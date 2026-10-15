export type Doctrine = "pathfinder" | "builder" | "trader";
export type Stance = "balanced" | "bold" | "careful";
export type Order = {
  type: "scout" | "contest" | "develop" | "pact" | "hold";
  target?: string;
  upgrade?: "income" | "fortify" | "heal";
  partner?: number;
};
export type Tile = {
  id: string;
  q: number;
  r: number;
  kind: "grass" | "forest" | "rock" | "base" | "flag" | "cache";
  owner: number;
  fort: number;
};
export type Faction = {
  id: number;
  name: string;
  captain: string;
  doctrine: Doctrine;
  stance: Stance;
  pos: string;
  hp: number;
  supplies: number;
  income: number;
  score: number;
  explored: string[];
  seen: Record<string, number>;
  memory: Record<string, number>;
};
export type Market = {
  status: "scenario" | "live" | "stale" | "neutral";
  label: string;
  detail: string;
  source: string;
  timestamp: number;
  affected: "scout" | "contest" | "develop" | "none";
  surcharge: number;
  price?: number;
  baseline?: number;
};
export type GameEvent = {
  round: number;
  kind: "move" | "battle" | "capture" | "economy" | "pact" | "betrayal" | "end";
  text: string;
  actors: number[];
  tile?: string;
};
export type GameState = {
  version: 1;
  seed: string;
  round: number;
  status: "active" | "finished";
  winner: number | null;
  tiles: Tile[];
  factions: Faction[];
  events: GameEvent[];
  market: Market;
  history: { round: number; orders: Order[] }[];
};
export const FACTIONS = [
  {
    name: "Verdant Pact",
    doctrine: "pathfinder" as Doctrine,
    color: "#bcdf8a",
    tag: "Travel light. Choose your ground.",
    symbol: "◈",
  },
  {
    name: "Ember Union",
    doctrine: "builder" as Doctrine,
    color: "#e99c74",
    tag: "Build a foothold. Hold the line.",
    symbol: "▲",
  },
  {
    name: "Tide Assembly",
    doctrine: "trader" as Doctrine,
    color: "#8dc7d5",
    tag: "A promise can change the map.",
    symbol: "◎",
  },
];
export const BASES = ["0,-3", "3,0", "-3,3"];
export const FLAGS = ["0,-1", "1,0", "-1,1"];
export const CACHES = ["0,-2", "2,0", "-2,2"];
export const MAX_ROUNDS = 6;
export function hash(s: string) {
  let h = 2166136261;
  for (const c of s) {
    h ^= c.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function random(seed: string) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function coords(id: string) {
  return id.split(",").map(Number) as [number, number];
}
export function distance(a: string, b: string) {
  const [q, r] = coords(a),
    [x, y] = coords(b);
  return (Math.abs(q - x) + Math.abs(r - y) + Math.abs(q + r - x - y)) / 2;
}
export function scenario(day = new Date().toISOString().slice(0, 10)): Market {
  const choices = [
    {
      affected: "contest",
      label: "Long way home",
      detail: "Supply routes are stretched. Contest costs +1 Supply.",
    },
    {
      affected: "develop",
      label: "A scarce frontier",
      detail: "Materials are scarce. Develop costs +1 Supply.",
    },
    {
      affected: "scout",
      label: "Mist on the ridge",
      detail: "Scouting parties need extra provisions. Scout costs +1 Supply.",
    },
  ] as const;
  const c = choices[hash(day) % 3];
  return {
    ...c,
    status: "scenario",
    surcharge: 1,
    source: "Curated game scenario • no live price claim",
    timestamp: Date.parse(day + "T00:00:00Z"),
  };
}
export function visible(s: GameState, id: number) {
  const f = s.factions[id];
  return s.tiles
    .filter((t) => distance(t.id, f.pos) <= 2 || t.owner === id)
    .map((t) => t.id);
}
function reveal(s: GameState) {
  for (const f of s.factions) {
    for (const id of visible(s, f.id)) {
      if (!f.explored.includes(id)) f.explored.push(id);
      f.seen[id] = s.tiles.find((t) => t.id === id)!.owner;
    }
  }
}
export function createGame(
  seed: string,
  names = ["Nox", "Ash", "Mira"],
  doctrines: Doctrine[] = FACTIONS.map((f) => f.doctrine),
  market = scenario(),
): GameState {
  const tiles: Tile[] = [];
  for (let q = -3; q <= 3; q++)
    for (let r = -3; r <= 3; r++) {
      if (Math.abs(q + r) > 3) continue;
      const id = `${q},${r}`;
      const orbit = [id, `${-q - r},${q}`, `${r},${-q - r}`].sort()[0];
      let kind: Tile["kind"] = ["grass", "grass", "forest", "rock"][
        hash(seed + orbit) % 4
      ] as Tile["kind"];
      if (BASES.includes(id)) kind = "base";
      if (FLAGS.includes(id)) kind = "flag";
      if (CACHES.includes(id)) kind = "cache";
      tiles.push({ id, q, r, kind, owner: BASES.indexOf(id), fort: 0 });
    }
  const s: GameState = {
    version: 1,
    seed,
    round: 1,
    status: "active",
    winner: null,
    tiles,
    factions: FACTIONS.map((f, id) => ({
      id,
      name: f.name,
      captain: names[id] || f.name,
      doctrine: doctrines[id],
      stance: "balanced",
      pos: BASES[id],
      hp: 4,
      supplies: 5,
      income: 0,
      score: 0,
      explored: [],
      seen: {},
      memory: {},
    })),
    events: [],
    market,
    history: [],
  };
  reveal(s);
  return s;
}
export function cost(s: GameState, fid: number, o: Order) {
  const f = s.factions[fid];
  let n =
    o.type === "scout"
      ? 1
      : o.type === "contest"
        ? 2
        : o.type === "pact"
          ? 1
          : o.type === "develop"
            ? o.upgrade === "income"
              ? 3
              : 2
            : 0;
  if (o.type === "scout" && f.doctrine === "pathfinder") n--;
  if (o.type === "contest" && f.stance === "bold") n++;
  if (o.type === "develop" && f.doctrine === "builder" && s.round === 1) n--;
  if (s.market.affected === o.type) n += s.market.surcharge;
  return Math.max(0, n);
}
export function validateOrder(
  s: GameState,
  fid: number,
  o: Order,
): string | null {
  const f = s.factions[fid];
  if (!f || s.status !== "active") return "Match is not active";
  if (!["scout", "contest", "develop", "pact", "hold"].includes(o.type))
    return "Unknown order";
  if (cost(s, fid, o) > f.supplies) return "Not enough Supplies";
  if (o.type === "scout" || o.type === "contest") {
    const t = s.tiles.find((t) => t.id === o.target);
    if (!t) return "Choose a tile";
    if (t.kind === "base" && t.owner !== fid)
      return "Home outposts cannot be captured";
    const d = distance(f.pos, t.id);
    if (d > 2 || d < 1) return "Choose a tile one or two steps away";
    if (o.type === "contest" && !f.explored.includes(t.id))
      return "Scout unknown terrain first";
  }
  if (o.type === "develop") {
    if (!["income", "fortify", "heal"].includes(o.upgrade || ""))
      return "Choose a development";
    if (o.upgrade === "income" && f.income >= 2)
      return "Income upgrades are capped at two";
    if (o.upgrade === "heal" && f.hp >= 4)
      return "Squad is already at full strength";
    if (
      o.upgrade === "fortify" &&
      !s.tiles.some((t) => t.owner === fid && t.fort < 2)
    )
      return "All outposts are fortified";
  }
  if (
    o.type === "pact" &&
    (!Number.isInteger(o.partner) ||
      o.partner === fid ||
      !s.factions[o.partner!])
  )
    return "Choose another faction";
  return null;
}
export function botOrder(s: GameState, id: number): Order {
  const f = s.factions[id],
    rng = random(`${s.seed}:${s.round}:${id}:bot`);
  const reachable = s.tiles.filter(
    (t) =>
      distance(t.id, f.pos) <= 2 &&
      t.id !== f.pos &&
      !(t.kind === "base" && t.owner !== id),
  );
  if (
    f.hp <= 2 &&
    f.supplies >= cost(s, id, { type: "develop", upgrade: "heal" })
  )
    return { type: "develop", upgrade: "heal" };
  const diplomat = hash(s.seed + ":convoy") % 3,
    partner = (diplomat + 1) % 3;
  if (
    s.round === 2 &&
    hash(s.seed + ":offer") % 4 === 0 &&
    [diplomat, partner].includes(id) &&
    f.supplies >= cost(s, id, { type: "pact" })
  ) {
    const other = id === diplomat ? partner : diplomat;
    if ((f.memory[String(other)] || 0) >= 0)
      return { type: "pact", partner: other };
  }
  const targets = reachable
    .filter((t) => f.explored.includes(t.id) && (f.seen[t.id] ?? -1) !== id)
    .sort((a, b) => {
      const score = (t: Tile) =>
        (t.kind === "flag" ? 12 : t.kind === "cache" ? 6 : 0) -
        distance(t.id, "0,0") +
        (f.memory[String(t.owner)] || 0) * -0.15;
      return (
        score(b) - score(a) ||
        hash(`${s.seed}:${s.round}:${id}:${a.id}`) -
          hash(`${s.seed}:${s.round}:${id}:${b.id}`)
      );
    });
  if (targets.length && f.supplies >= cost(s, id, { type: "contest" }))
    return {
      type: "contest",
      target: targets[Math.floor(rng() * Math.min(2, targets.length))].id,
    };
  if (
    s.round <= 2 &&
    f.income < 2 &&
    rng() < 0.4 &&
    f.supplies >= cost(s, id, { type: "develop", upgrade: "income" })
  )
    return { type: "develop", upgrade: "income" };
  const unknown = reachable.filter((t) => !f.explored.includes(t.id));
  if (unknown.length && f.supplies >= cost(s, id, { type: "scout" }))
    return {
      type: "scout",
      target: unknown[Math.floor(rng() * unknown.length)].id,
    };
  const toward = reachable.sort(
    (a, b) => distance(a.id, "0,0") - distance(b.id, "0,0"),
  );
  if (toward.length && f.supplies >= cost(s, id, { type: "scout" }))
    return { type: "scout", target: toward[0].id };
  return { type: "hold" };
}
export function resolveRound(input: GameState, submitted: Order[]): GameState {
  if (input.status !== "active") throw Error("Match finished");
  const s = structuredClone(input);
  const orders = s.factions.map((_, i) => submitted[i] || botOrder(s, i));
  for (let i = 0; i < 3; i++) {
    const e = validateOrder(s, i, orders[i]);
    if (e) throw Error(`Faction ${i}: ${e}`);
  }
  const round = s.round;
  const event = (
    kind: GameEvent["kind"],
    text: string,
    actors: number[],
    tile?: string,
  ) => s.events.push({ round, kind, text, actors, ...(tile ? { tile } : {}) });
  const origins = s.factions.map((f) => f.pos),
    dest = origins.slice();
  for (const f of s.factions) {
    const o = orders[f.id];
    f.supplies -= cost(s, f.id, o);
    if (o.type === "scout" || o.type === "contest") dest[f.id] = o.target!;
    if (o.type === "develop") {
      if (o.upgrade === "income") f.income++;
      if (o.upgrade === "heal") f.hp = Math.min(4, f.hp + 2);
      if (o.upgrade === "fortify") {
        const tile = s.tiles
          .filter((t) => t.owner === f.id && t.fort < 2)
          .sort((a, b) => distance(a.id, f.pos) - distance(b.id, f.pos))[0];
        tile.fort++;
      }
      event("economy", `${f.captain} invested in ${o.upgrade}.`, [f.id], f.pos);
    }
    if (o.type === "hold")
      event(
        "economy",
        `${f.captain} held position and conserved Supplies.`,
        [f.id],
        f.pos,
      );
  }
  for (const f of s.factions) {
    const o = orders[f.id];
    if (o.type !== "pact") continue;
    const p = s.factions[o.partner!],
      po = orders[p.id];
    if (po.type === "pact" && po.partner === f.id) {
      f.supplies += f.doctrine === "trader" ? 4 : 3;
      f.memory[String(p.id)] = Math.min(3, (f.memory[String(p.id)] || 0) + 1);
      f.score++;
      event(
        "pact",
        `${f.captain} and ${p.captain} kept their convoy promise.`,
        [f.id, p.id],
      );
    } else if (
      po.type === "contest" &&
      (po.target === origins[f.id] ||
        s.tiles.find((t) => t.id === po.target)?.owner === f.id)
    ) {
      f.memory[String(p.id)] = Math.max(-3, (f.memory[String(p.id)] || 0) - 2);
      p.supplies++;
      event(
        "betrayal",
        `${p.captain} raided while ${f.captain} offered a pact. This will be remembered.`,
        [f.id, p.id],
        po.target,
      );
    } else {
      f.supplies++;
      event(
        "pact",
        `${p.captain} did not accept ${f.captain}'s convoy pact. Supplies returned.`,
        [f.id, p.id],
      );
    }
  }
  for (const tileId of [...new Set(dest)]) {
    const entrants = s.factions.filter((f) => dest[f.id] === tileId);
    const tile = s.tiles.find((t) => t.id === tileId)!;
    let victor = entrants[0];
    if (entrants.length > 1) {
      const powers = entrants
        .map((f) => ({
          f,
          p:
            f.hp +
            (f.stance === "bold" ? 1 : 0) +
            (tile.owner === f.id
              ? tile.fort + (f.stance === "careful" ? 1 : 0)
              : 0) +
            Math.floor(random(`${s.seed}:${round}:${tileId}:${f.id}`)() * 2),
        }))
        .sort((a, b) => b.p - a.p);
      if (powers[0].p === powers[1].p) {
        for (const f of entrants) {
          f.pos = BASES[f.id];
          f.hp = Math.max(1, f.hp - 1);
        }
        event(
          "battle",
          "The clash ended in a stalemate. Squads regrouped at home.",
          entrants.map((f) => f.id),
          tileId,
        );
        continue;
      }
      victor = powers[0].f;
      for (const { f } of powers.slice(1)) {
        f.pos = BASES[f.id];
        f.hp = Math.max(1, f.hp - 1);
        f.memory[String(victor.id)] = Math.max(
          -3,
          (f.memory[String(victor.id)] || 0) - 1,
        );
      }
      victor.hp = Math.max(1, victor.hp - 1);
      event(
        "battle",
        `${victor.captain} won the clash. Rival squads regrouped at home.`,
        entrants.map((f) => f.id),
        tileId,
      );
    }
    victor.pos = tileId;
    const o = orders[victor.id];
    if (o.type === "contest" && tile.kind !== "base") {
      const old = tile.owner;
      tile.owner = victor.id;
      if (old !== victor.id) {
        tile.fort = 0;
        event(
          "capture",
          `${victor.captain} secured ${tile.kind === "flag" ? "a banner" : tile.kind === "cache" ? "a supply post" : "new ground"}.`,
          [victor.id, ...(old >= 0 ? [old] : [])],
          tileId,
        );
      }
    }
    if (o.type === "scout")
      event(
        "move",
        `${victor.captain} scouted a new route.`,
        [victor.id],
        tileId,
      );
  }
  for (const f of s.factions) {
    const banners = s.tiles.filter(
      (t) => t.kind === "flag" && t.owner === f.id,
    ).length;
    f.score += banners;
    const caches = s.tiles.filter(
      (t) => t.kind === "cache" && t.owner === f.id,
    ).length;
    f.supplies = Math.min(15, f.supplies + Math.min(6, 3 + f.income + caches));
    if (banners === 3) {
      s.status = "finished";
      s.winner = f.id;
    }
  }
  s.history.push({ round, orders });
  reveal(s);
  if (round >= MAX_ROUNDS || s.status === "finished") {
    s.status = "finished";
    if (s.winner === null) {
      const ranked = [...s.factions].sort((a, b) => b.score - a.score);
      s.winner = ranked[0].score === ranked[1].score ? -1 : ranked[0].id;
    }
    event(
      "end",
      s.winner === -1
        ? "The frontier stands divided. A draw."
        : `${s.factions[s.winner!].name} controls the frontier.`,
      [0, 1, 2],
    );
  } else s.round++;
  return s;
}
export function viewGame(s: GameState, id: number) {
  if (s.status === "finished")
    return {
      ...s,
      you: id,
      visible: s.tiles.map((t) => t.id),
      submitted: false,
    };
  const v = visible(s, id),
    self = s.factions[id];
  return {
    version: s.version,
    round: s.round,
    status: s.status,
    winner: s.winner,
    market: s.market,
    you: id,
    visible: v,
    submitted: false,
    tiles: s.tiles.map((t) =>
      self.explored.includes(t.id)
        ? {
            ...t,
            owner: v.includes(t.id) ? t.owner : (self.seen[t.id] ?? -1),
            fort: v.includes(t.id) ? t.fort : 0,
          }
        : { id: t.id, q: t.q, r: t.r, kind: "fog", owner: -1, fort: 0 },
    ),
    factions: s.factions.map((f) =>
      f.id === id
        ? f
        : {
            id: f.id,
            name: f.name,
            captain: f.captain,
            doctrine: f.doctrine,
            pos: v.includes(f.pos) ? f.pos : null,
            hp: v.includes(f.pos) ? f.hp : null,
            score: f.score,
            supplies: null,
          },
    ),
    events: s.events
      .filter((e) => e.actors.includes(id) || (e.tile && v.includes(e.tile)))
      .slice(-12),
  };
}
