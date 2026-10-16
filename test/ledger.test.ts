import test from "node:test";
import assert from "node:assert/strict";
import { database } from "../server/db";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("old confirmed receipts backfill totals once and survive restart", () => {
  const dir = mkdtempSync(join(tmpdir(), "outpost-ledger-migrate-"));
  const path = join(dir, "state.sqlite");
  try {
    let db = database(path);
    const insert = db.prepare("INSERT INTO orders(id,user_id,payload,signature,status) VALUES (?,?,?,?,?)");
    insert.run("rival", "u", JSON.stringify({ asset: "rival", order: { amount: "80000000000000000000", creator: "0x0000000000000000000000000000000000000000" } }), "sig", "confirmed");
    insert.run("stable", "u", JSON.stringify({ asset: "stable", order: { amount: "4000000", creator: "0x0000000000000000000000000000000000000000" } }), "sig", "confirmed");
    db.exec("DELETE FROM economy_totals");
    db.close();
    db = database(path);
    const row = db.prepare("SELECT * FROM economy_totals WHERE id=1").get() as any;
    assert.equal(row.rival_orders, 1);
    assert.equal(row.stable_orders, 1);
    assert.equal(row.rival_gross, "80000000000000000000");
    assert.equal(row.rival_retired, "16000000000000000000");
    assert.equal(row.stable_gross, "4000000");
    db.close();
    db = database(path);
    assert.equal((db.prepare("SELECT rival_orders FROM economy_totals").get() as any).rival_orders, 1);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
