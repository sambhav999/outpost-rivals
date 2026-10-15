import express from "express";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { resolve } from "node:path";
import { verifyMessage, getAddress } from "ethers";
import { z } from "zod";
import { database, tx } from "./db";
import { config, type Config } from "./config";
import { market } from "./market";
import { shop } from "./shop";
import {
  createGame,
  resolveRound,
  validateOrder,
  viewGame,
  botOrder,
  FACTIONS,
  type GameState,
  type Order,
} from "../shared/game";
import { SHOP_ITEMS, ECONOMY } from "../shared/economy";
const digest = (s: string) => createHash("sha256").update(s).digest("hex");
const uid = () => randomBytes(24).toString("hex");
const orderSchema = z
  .object({
    type: z.enum(["scout", "contest", "develop", "pact", "hold"]),
    target: z.string().max(20).optional(),
    upgrade: z.enum(["income", "fortify", "heal"]).optional(),
    partner: z.number().int().min(0).max(2).optional(),
  })
  .strict();
export function createApp(c: Config = config) {
  const db = database(c.db),
    app = express(),
    store = shop(db, c);
  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  const rate = new Map<string, { n: number; t: number }>();
  app.use((req, res, next) => {
    res.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https:; font-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'",
    });
    const key = req.socket.remoteAddress || "local";
    let r = rate.get(key);
    if (!r || Date.now() - r.t > 60000) {
      r = { n: 0, t: Date.now() };
      rate.set(key, r);
    }
    if (++r.n > 600)
      return res.status(429).json({ error: "Slow down and retry shortly" });
    if (rate.size > 10000) rate.clear();
    next();
  });
  const session = (req: any) => {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .find((s: string) => s.trim().startsWith("outpost="))
      ?.trim()
      .slice(8);
    if (!cookie) return null;
    return db
      .prepare(
        "SELECT s.*,u.name,u.faction,u.stance,u.wallet,u.xp,u.wins,u.played,u.skin,u.memory FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.expires>?",
      )
      .get(digest(cookie), Date.now()) as any;
  };
  function issue(res: any, userId: string) {
    const secret = uid(),
      csrf = uid();
    db.prepare("INSERT INTO sessions VALUES (?,?,?,?)").run(
      digest(secret),
      userId,
      csrf,
      Date.now() + 30 * 86400000,
    );
    res.cookie("outpost", secret, {
      httpOnly: true,
      sameSite: "lax",
      secure: c.production,
      maxAge: 30 * 86400000,
      path: "/",
    });
    return csrf;
  }
  app.get("/healthz", (_, res) => res.status(200).send("ok"));
  app.get("/readyz", (_, res) => {
    db.prepare("SELECT 1").get();
    res.json({ ready: true });
  });
  app.use("/api", (req: any, res, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
      if (req.headers.origin && req.headers.origin !== c.origin)
        return res.status(403).json({ error: "Origin rejected" });
      if (c.production && !req.headers.origin)
        return res.status(403).json({ error: "Origin required" });
    }
    req.auth = session(req);
    if (req.path === "/session" && req.method === "POST") return next();
    if (!req.auth)
      return res.status(401).json({ error: "Start a guest session" });
    if (
      !["GET", "HEAD"].includes(req.method) &&
      req.headers["x-csrf-token"] !== req.auth.csrf
    )
      return res.status(403).json({ error: "Session token required" });
    next();
  });
  app.post("/api/session", (req: any, res) => {
    if (req.auth) return res.json({ csrf: req.auth.csrf });
    const id = randomUUID();
    db.prepare("INSERT INTO users(id,name) VALUES (?,?)").run(
      id,
      "Captain " + id.slice(0, 4),
    );
    res.json({ csrf: issue(res, id) });
  });
  const user = (req: any) => ({ ...req.auth, id: req.auth.user_id });
  app.get("/api/bootstrap", async (req: any, res) => {
    const u = user(req);
    res.json({
      profile: {
        id: u.id,
        name: u.name,
        faction: u.faction,
        stance: u.stance,
        wallet: u.wallet,
        xp: u.xp,
        wins: u.wins,
        played: u.played,
        skin: u.skin,
        memory: JSON.parse(u.memory),
      },
      inventory: db
        .prepare("SELECT sku FROM inventory WHERE user_id=?")
        .all(u.id)
        .map((x: any) => x.sku),
      history: db
        .prepare(
          "SELECT m.id,m.mode,m.status,m.created,r.score,r.won FROM matches m JOIN players p ON p.match_id=m.id LEFT JOIN results r ON r.match_id=m.id AND r.user_id=p.user_id WHERE p.user_id=? ORDER BY m.created DESC LIMIT 15",
        )
        .all(u.id),
      market: await market(db, c),
      shop: { ...store.status(), items: SHOP_ITEMS },
      economy: ECONOMY,
      chain: {
        id: c.chainId,
        store: c.store,
        token: c.token,
        stable: c.stable,
        explorer:
          c.chainId === 4663
            ? "https://robinhoodchain.blockscout.com"
            : "https://explorer.testnet.chain.robinhood.com",
        rpc:
          c.chainId === 4663
            ? "https://rpc.mainnet.chain.robinhood.com"
            : "https://rpc.testnet.chain.robinhood.com",
      },
      payments: db
        .prepare(
          "SELECT payload,tx FROM orders WHERE user_id=? AND status='pending' ORDER BY rowid DESC LIMIT 5",
        )
        .all(u.id),
    });
  });
  app.patch("/api/profile", (req: any, res) => {
    const p = z
      .object({
        name: z.string().trim().min(2).max(24),
        faction: z.number().int().min(0).max(2),
        stance: z.enum(["balanced", "bold", "careful"]),
        skin: z.string().max(50).optional(),
      })
      .parse(req.body);
    if (
      p.skin &&
      !db
        .prepare("SELECT 1 FROM inventory WHERE user_id=? AND sku=?")
        .get(user(req).id, p.skin)
    )
      throw Error("Cosmetic is not owned");
    db.prepare(
      "UPDATE users SET name=?,faction=?,stance=?,skin=? WHERE id=?",
    ).run(p.name, p.faction, p.stance, p.skin || "", user(req).id);
    res.json({ saved: true });
  });
  app.post("/api/wallet/challenge", (req: any, res) => {
    const address = getAddress(z.string().parse(req.body.address));
    const nonce = uid(),
      expires = Date.now() + 300000;
    const message = `${new URL(c.origin).host} requests a wallet link for Outpost Rivals.\n\nAddress: ${address}\nChain ID: ${c.chainId}\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}\nExpires: ${new Date(expires).toISOString()}\n\nThis signature only links your account. It authorizes no transfer.`;
    db.prepare("INSERT INTO nonces VALUES (?,?,?,?,?)").run(
      nonce,
      user(req).id,
      address.toLowerCase(),
      message,
      expires,
    );
    res.json({ nonce, message });
  });
  app.post("/api/wallet/verify", (req: any, res) => {
    const b = z
      .object({ nonce: z.string(), signature: z.string().max(200) })
      .parse(req.body);
    const row: any = db
      .prepare("SELECT * FROM nonces WHERE id=? AND user_id=? AND expires>?")
      .get(b.nonce, user(req).id, Date.now());
    if (
      !row ||
      verifyMessage(row.message, b.signature).toLowerCase() !== row.address
    )
      throw Error("Invalid or expired wallet proof");
    let target = user(req).id;
    tx(db, () => {
      db.prepare("DELETE FROM nonces WHERE id=?").run(row.id);
      const existing: any = db
        .prepare("SELECT id FROM users WHERE wallet=?")
        .get(row.address);
      if (existing) target = existing.id;
      else
        db.prepare("UPDATE users SET wallet=? WHERE id=?").run(
          row.address,
          target,
        );
      db.prepare("DELETE FROM sessions WHERE id=?").run(req.auth.id);
    });
    res.json({ csrf: issue(res, target), restored: target !== user(req).id });
  });
  function finish(row: any, s: GameState) {
    const players = db
      .prepare("SELECT * FROM players WHERE match_id=?")
      .all(row.id) as any[];
    for (const p of players) {
      if (
        db
          .prepare("SELECT 1 FROM results WHERE match_id=? AND user_id=?")
          .get(row.id, p.user_id)
      )
        continue;
      const f = s.factions[p.slot],
        won = s.winner === p.slot ? 1 : 0;
      db.prepare("INSERT INTO results VALUES (?,?,?,?,?)").run(
        row.id,
        p.user_id,
        f.score,
        won,
        Date.now(),
      );
      db.prepare(
        "UPDATE users SET xp=xp+?,wins=wins+?,played=played+1,memory=? WHERE id=?",
      ).run(50 + f.score * 10, won, JSON.stringify(f.memory), p.user_id);
    }
  }
  function advance(id: string) {
    return tx(db, () => {
      const row: any = db.prepare("SELECT * FROM matches WHERE id=?").get(id);
      if (!row || row.status !== "active") return;
      const ps = db
        .prepare("SELECT * FROM players WHERE match_id=?")
        .all(id) as any[];
      if (ps.some((p) => !p.order_json) && Date.now() < row.deadline) return;
      const s: GameState = JSON.parse(row.state);
      const orders = s.factions.map((_, slot) => {
        const p = ps.find((p) => p.slot === slot);
        return p
          ? p.order_json
            ? JSON.parse(p.order_json)
            : { type: "hold" }
          : botOrder(s, slot);
      });
      const out = resolveRound(s, orders),
        previous = row.digest || "",
        serialized = JSON.stringify(out),
        proof = digest(previous + JSON.stringify(orders) + serialized);
      db.prepare("INSERT INTO snapshots VALUES (?,?,?,?,?,?)").run(
        id,
        s.round,
        serialized,
        JSON.stringify(orders),
        previous,
        proof,
      );
      db.prepare(
        "UPDATE matches SET state=?,status=?,deadline=?,digest=? WHERE id=?",
      ).run(serialized, out.status, Date.now() + c.roundMs, proof, id);
      db.prepare("UPDATE players SET order_json=NULL WHERE match_id=?").run(id);
      if (out.status === "finished") finish(row, out);
    });
  }
  app.post("/api/matches", async (req: any, res) => {
    const b = z
      .object({ mode: z.enum(["solo", "weekly", "room"]).default("solo") })
      .parse(req.body);
    const u = user(req);
    const active: any = db
      .prepare(
        "SELECT m.id FROM matches m JOIN players p ON p.match_id=m.id WHERE p.user_id=? AND m.status IN ('active','lobby') ORDER BY m.created DESC LIMIT 1",
      )
      .get(u.id);
    if (active) return res.json({ id: active.id, resumed: true });
    const id = randomUUID(),
      day = new Date().toISOString().slice(0, 10);
    const snapshot = await market(db, c);
    const out = tx(db, () => {
      if (
        b.mode === "weekly" &&
        db
          .prepare("SELECT 1 FROM attempts WHERE user_id=? AND day=?")
          .get(u.id, day)
      )
        throw Error(
          "Ranked attempt already used today. Practice is unlimited.",
        );
      const s = createGame(
        b.mode === "weekly" ? "ranked:" + day : uid(),
        undefined,
        undefined,
        b.mode === "weekly"
          ? {
              ...snapshot,
              affected: "none",
              surcharge: 0,
              label: "Equal-start daily challenge",
              detail:
                "Identical daily seed and neutral costs for every ranked attempt.",
            }
          : snapshot,
      );
      const slot = b.mode === "weekly" ? 0 : u.faction;
      s.factions[slot].captain = u.name;
      if (b.mode !== "weekly") {
        s.factions[slot].stance = u.stance;
        s.factions[slot].memory = JSON.parse(u.memory);
      }
      const code = randomBytes(4).toString("hex").toUpperCase();
      const status = b.mode === "room" ? "lobby" : "active";
      db.prepare(
        "INSERT INTO matches(id,code,host,mode,status,state,deadline,created) VALUES (?,?,?,?,?,?,?,?)",
      ).run(
        id,
        code,
        u.id,
        b.mode,
        status,
        JSON.stringify(s),
        Date.now() + c.roundMs,
        Date.now(),
      );
      db.prepare(
        "INSERT INTO players(match_id,slot,user_id) VALUES (?,?,?)",
      ).run(id, slot, u.id);
      if (b.mode === "weekly")
        db.prepare("INSERT INTO attempts VALUES (?,?,?)").run(u.id, day, id);
      return { id, code };
    });
    res.json(out);
  });
  app.post("/api/rooms/join", (req: any, res) => {
    const code = z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-F0-9]{8}$/)
      .parse(req.body.code);
    const result = tx(db, () => {
      const row: any = db
        .prepare("SELECT * FROM matches WHERE code=? AND status='lobby'")
        .get(code);
      if (!row) throw Error("Room is unavailable");
      const ps = db
        .prepare("SELECT * FROM players WHERE match_id=?")
        .all(row.id) as any[];
      if (ps.some((p) => p.user_id === user(req).id)) return { id: row.id };
      if (ps.length >= 3) throw Error("Room is full");
      if (
        db
          .prepare(
            "SELECT 1 FROM matches m JOIN players p ON p.match_id=m.id WHERE p.user_id=? AND m.status IN ('active','lobby')",
          )
          .get(user(req).id)
      )
        throw Error("Finish your current match before joining another room");
      const slot = [0, 1, 2].find((i) => !ps.some((p) => p.slot === i))!;
      const s: GameState = JSON.parse(row.state);
      s.factions[slot].captain = user(req).name;
      s.factions[slot].stance = user(req).stance;
      db.prepare(
        "INSERT INTO players(match_id,slot,user_id) VALUES (?,?,?)",
      ).run(row.id, slot, user(req).id);
      db.prepare("UPDATE matches SET state=? WHERE id=?").run(
        JSON.stringify(s),
        row.id,
      );
      return { id: row.id };
    });
    res.json(result);
  });
  app.post("/api/matches/:id/start", (req: any, res) => {
    const result = db
      .prepare(
        "UPDATE matches SET status='active',deadline=? WHERE id=? AND host=? AND status='lobby'",
      )
      .run(Date.now() + c.roundMs, req.params.id, user(req).id);
    if (!result.changes) throw Error("Only the host can start a lobby");
    res.json({ started: true });
  });
  app.get("/api/matches/:id", (req: any, res) => {
    advance(req.params.id);
    const row: any = db
      .prepare("SELECT * FROM matches WHERE id=?")
      .get(req.params.id);
    const p: any = db
      .prepare("SELECT * FROM players WHERE match_id=? AND user_id=?")
      .get(req.params.id, user(req).id);
    if (!row || !p) return res.status(404).json({ error: "Match not found" });
    res.json({
      ...viewGame(JSON.parse(row.state), p.slot),
      id: row.id,
      code: row.code,
      status: row.status,
      mode: row.mode,
      host: row.host === user(req).id,
      deadline: row.deadline,
      submitted: !!p.order_json,
      players: db
        .prepare(
          "SELECT p.slot,u.name FROM players p JOIN users u ON u.id=p.user_id WHERE match_id=?",
        )
        .all(row.id),
      digest: row.status === "finished" ? row.digest : undefined,
    });
  });
  app.post("/api/matches/:id/orders", (req: any, res) => {
    const b = z
      .object({ round: z.number().int(), order: orderSchema })
      .parse(req.body);
    tx(db, () => {
      const row: any = db
          .prepare("SELECT * FROM matches WHERE id=?")
          .get(req.params.id),
        p: any = db
          .prepare("SELECT * FROM players WHERE match_id=? AND user_id=?")
          .get(req.params.id, user(req).id);
      if (!row || !p || row.status !== "active")
        throw Error("Not an active participant");
      const s: GameState = JSON.parse(row.state);
      if (Date.now() >= row.deadline || s.round !== b.round)
        throw Error("Planning round has ended. Refresh the world.");
      if (p.order_json) throw Error("Order already committed");
      const error = validateOrder(s, p.slot, b.order);
      if (error) throw Error(error);
      db.prepare(
        "UPDATE players SET order_json=? WHERE match_id=? AND slot=?",
      ).run(JSON.stringify(b.order), row.id, p.slot);
    });
    advance(req.params.id);
    res.json({ committed: true });
  });
  app.get("/api/replays/:id", (req: any, res) => {
    const row: any = db
      .prepare("SELECT * FROM matches WHERE id=? AND status='finished'")
      .get(req.params.id);
    if (!row)
      return res
        .status(404)
        .json({ error: "Replay is available only after the match finishes" });
    const snapshots = db
      .prepare("SELECT * FROM snapshots WHERE match_id=? ORDER BY round")
      .all(row.id) as any[];
    let previous = "",
      valid = snapshots.length > 0;
    for (const p of snapshots) {
      valid &&=
        p.previous === previous &&
        digest(p.previous + p.orders + p.state) === p.digest;
      previous = p.digest;
    }
    res.json({
      id: row.id,
      verified: valid && previous === row.digest,
      verification:
        "Server hash-chain integrity only; not independent or onchain gameplay verification.",
      digest: row.digest,
      snapshots: snapshots.map((p) => ({
        round: p.round,
        state: JSON.parse(p.state),
        digest: p.digest,
      })),
    });
  });
  app.get("/api/leaderboard", (_, res) => {
    res.json(
      db
        .prepare(
          "SELECT u.name,u.wallet,MAX(r.score) AS score,COUNT(*) AS attempts FROM results r JOIN users u ON u.id=r.user_id JOIN matches m ON m.id=r.match_id WHERE m.mode='weekly' AND r.created>? GROUP BY u.id ORDER BY score DESC LIMIT 30",
        )
        .all(Date.now() - 7 * 86400000),
    );
  });
  app.post("/api/shop/orders", async (req: any, res) => {
    res.json(
      await store.quote(
        user(req),
        String(req.body.sku),
        String(req.body.asset),
      ),
    );
  });
  app.post("/api/shop/orders/:id/confirm", async (req: any, res) =>
    res.json(
      await store.confirm(user(req), req.params.id, String(req.body.hash)),
    ),
  );
  app.use(express.static(resolve("dist"), { index: false }));
  app.get("/{*path}", (req, res) => {
    if (req.path.startsWith("/api/"))
      return res.status(404).json({ error: "Unknown endpoint" });
    res.sendFile(resolve("dist/index.html"));
  });
  app.use((e: any, _req: any, res: any, _next: any) => {
    if (c.production) console.error(e.message);
    res
      .status(e instanceof z.ZodError ? 422 : 400)
      .json({
        error:
          e instanceof z.ZodError
            ? "Invalid request fields"
            : e.message || "Request failed",
      });
  });
  const interval = setInterval(() => {
    for (const row of db
      .prepare("SELECT id FROM matches WHERE status='active' AND deadline<=?")
      .all(Date.now()) as any[]) {
      try {
        advance(row.id);
      } catch (e) {
        console.error("Round resolution failed", row.id, e);
      }
    }
  }, 1000);
  interval.unref();
  return {
    app,
    db,
    store,
    close() {
      clearInterval(interval);
      store.close();
      db.close();
    },
  };
}
