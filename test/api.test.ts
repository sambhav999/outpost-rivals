import test from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../server/app";
import { config } from "../server/config";
import { Wallet } from "ethers";
test("guest, CSRF, authoritative match, replay integrity, room privacy and wallet restoration", async () => {
  const runtime = createApp({
    ...config,
    db: ":memory:",
    roundMs: 60000,
    production: false,
    origin: "http://test",
  });
  const server = runtime.app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port,
    base = `http://127.0.0.1:${port}`;
  function client() {
    let cookie = "",
      csrf = "";
    return {
      async call(path: string, body?: any, extra: any = {}) {
        const r = await fetch(base + path, {
          method: body ? "POST" : "GET",
          headers: {
            "content-type": "application/json",
            origin: "http://test",
            cookie,
            "x-csrf-token": csrf,
            ...extra,
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (r.headers.get("set-cookie"))
          cookie = r.headers.get("set-cookie")!.split(";")[0];
        const data = await r.json();
        if (data.csrf) csrf = data.csrf;
        return { status: r.status, data };
      },
    };
  }
  try {
    const a = client(),
      b = client();
    assert.equal((await a.call("/api/bootstrap")).status, 401);
    await a.call("/api/session", {});
    await b.call("/api/session", {});
    assert.equal(
      (await a.call("/api/matches", { mode: "solo" }, { "x-csrf-token": "" }))
        .status,
      403,
    );
    assert.equal(
      (
        await a.call(
          "/api/matches",
          { mode: "solo" },
          { origin: "https://evil.test" },
        )
      ).status,
      403,
    );
    const m = await a.call("/api/matches", { mode: "solo" });
    const id = m.data.id;
    assert.equal((await b.call("/api/matches/" + id)).status, 404);
    assert.equal((await a.call("/api/replays/" + id)).status, 404);
    for (let round = 1; round <= 6; round++) {
      if ((await a.call("/api/matches/" + id)).data.status === "finished")
        break;
      const response = await a.call("/api/matches/" + id + "/orders", {
        round,
        order: { type: "hold" },
      });
      assert.equal(response.status, 200, JSON.stringify(response.data));
    }
    const replay = await a.call("/api/replays/" + id);
    assert.equal(replay.data.verified, true);
    assert.ok(
      replay.data.snapshots.length > 0 && replay.data.snapshots.length <= 6,
    );
    assert.equal((await a.call("/api/bootstrap")).data.profile.played, 1);
    await a.call("/api/matches/" + id);
    assert.equal((await a.call("/api/bootstrap")).data.profile.played, 1);
    runtime.db
      .prepare("UPDATE snapshots SET digest=? WHERE match_id=? AND round=2")
      .run("tampered", id);
    assert.equal((await a.call("/api/replays/" + id)).data.verified, false);
    const room = await a.call("/api/matches", { mode: "room" });
    assert.equal(
      (await b.call("/api/rooms/join", { code: room.data.code })).status,
      200,
    );
    assert.equal(
      (await b.call("/api/matches/" + room.data.id + "/start", {})).status,
      400,
    );
    assert.equal(
      (await a.call("/api/matches/" + room.data.id + "/start", {})).status,
      200,
    );
    await a.call("/api/matches/" + room.data.id + "/orders", {
      round: 1,
      order: { type: "hold" },
    });
    assert.equal(
      (
        await a.call("/api/matches/" + room.data.id + "/orders", {
          round: 1,
          order: { type: "hold" },
        })
      ).status,
      400,
    );
    assert.equal((await b.call("/api/matches/" + room.data.id)).data.round, 1);
    await b.call("/api/matches/" + room.data.id + "/orders", {
      round: 1,
      order: { type: "hold" },
    });
    assert.equal((await a.call("/api/matches/" + room.data.id)).data.round, 2);
    const wallet = Wallet.createRandom(),
      challenge = await a.call("/api/wallet/challenge", {
        address: wallet.address,
      }),
      signature = await wallet.signMessage(challenge.data.message);
    assert.equal(
      (
        await a.call("/api/wallet/verify", {
          nonce: challenge.data.nonce,
          signature,
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await a.call("/api/wallet/verify", {
          nonce: challenge.data.nonce,
          signature,
        })
      ).status,
      400,
    );
    const another = await b.call("/api/wallet/challenge", {
      address: wallet.address,
    });
    assert.equal(
      (
        await b.call("/api/wallet/verify", {
          nonce: another.data.nonce,
          signature: await wallet.signMessage(another.data.message),
        })
      ).data.restored,
      true,
    );
    assert.equal((await b.call("/api/bootstrap")).data.profile.played, 1);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    runtime.close();
  }
});

test("timeout resolution, persistence and one daily ranked attempt", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "outpost-test-")),
    cfg = {
      ...config,
      db: join(dir, "game.sqlite"),
      roundMs: 60000,
      production: false,
      origin: "http://test",
    };
  let runtime = createApp(cfg),
    server = runtime.app.listen(0);
  await new Promise<void>((r) => server.once("listening", r));
  const port = (server.address() as any).port;
  let cookie = "",
    csrf = "";
  async function call(path: string, body?: any) {
    const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        "content-type": "application/json",
        origin: "http://test",
        cookie,
        "x-csrf-token": csrf,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (response.headers.get("set-cookie"))
      cookie = response.headers.get("set-cookie")!.split(";")[0];
    const data = await response.json();
    if (data.csrf) csrf = data.csrf;
    return { status: response.status, data };
  }
  try {
    await call("/session", {});
    const m = await call("/matches", { mode: "weekly" });
    runtime.db
      .prepare("UPDATE matches SET deadline=0 WHERE id=?")
      .run(m.data.id);
    assert.equal((await call("/matches/" + m.data.id)).data.round, 2);
    let completedRounds = 1;
    for (let round = 2; round <= 6; round++) {
      if ((await call("/matches/" + m.data.id)).data.status === "finished")
        break;
      const r = await call("/matches/" + m.data.id + "/orders", {
        round,
        order: { type: "hold" },
      });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      completedRounds++;
    }
    assert.equal((await call("/matches", { mode: "weekly" })).status, 400);
    const profile = (await call("/bootstrap")).data.profile;
    await new Promise<void>((r) => server.close(() => r()));
    runtime.close();
    runtime = createApp(cfg);
    const row: any = runtime.db
      .prepare("SELECT * FROM users WHERE id=?")
      .get(profile.id);
    assert.equal(row.played, 1);
    assert.equal(
      (runtime.db.prepare("SELECT COUNT(*) AS n FROM snapshots").get() as any)
        .n,
      completedRounds,
    );
  } finally {
    if (server.listening)
      await new Promise<void>((r) => server.close(() => r()));
    runtime.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
