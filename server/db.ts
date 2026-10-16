import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
export function database(path: string) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL, faction INTEGER DEFAULT 0,stance TEXT DEFAULT 'balanced',wallet TEXT UNIQUE,xp INTEGER DEFAULT 0,wins INTEGER DEFAULT 0,played INTEGER DEFAULT 0,skin TEXT DEFAULT '',memory TEXT DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),csrf TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS nonces(id TEXT PRIMARY KEY,user_id TEXT,address TEXT,message TEXT,expires INTEGER);
 CREATE TABLE IF NOT EXISTS matches(id TEXT PRIMARY KEY,code TEXT UNIQUE,host TEXT,mode TEXT,status TEXT,state TEXT,deadline INTEGER,created INTEGER,digest TEXT DEFAULT '');
 CREATE TABLE IF NOT EXISTS players(match_id TEXT REFERENCES matches(id),slot INTEGER,user_id TEXT REFERENCES users(id),order_json TEXT,PRIMARY KEY(match_id,slot),UNIQUE(match_id,user_id));
 CREATE TABLE IF NOT EXISTS snapshots(match_id TEXT,round INTEGER,state TEXT,orders TEXT,previous TEXT,digest TEXT,PRIMARY KEY(match_id,round));
 CREATE TABLE IF NOT EXISTS results(match_id TEXT,user_id TEXT,score INTEGER,won INTEGER,created INTEGER,PRIMARY KEY(match_id,user_id));
 CREATE TABLE IF NOT EXISTS attempts(user_id TEXT,day TEXT,match_id TEXT,PRIMARY KEY(user_id,day));
 CREATE TABLE IF NOT EXISTS inventory(user_id TEXT,sku TEXT,order_id TEXT UNIQUE,PRIMARY KEY(user_id,sku));
 CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,user_id TEXT,payload TEXT,signature TEXT,status TEXT DEFAULT 'pending',tx TEXT UNIQUE);
 CREATE TABLE IF NOT EXISTS economy_totals(id INTEGER PRIMARY KEY CHECK(id=1),rival_orders INTEGER NOT NULL,stable_orders INTEGER NOT NULL,rival_gross TEXT NOT NULL,rival_retired TEXT NOT NULL,stable_gross TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS liquidity_observations(as_of INTEGER,pool_id TEXT,price_usd TEXT,liquidity_usd REAL,PRIMARY KEY(as_of,pool_id));
 CREATE TABLE IF NOT EXISTS cache(key TEXT PRIMARY KEY,value TEXT);
 `);
  const columns = db.prepare("PRAGMA table_info(users)").all() as {name:string}[];
  if(!columns.some(c=>c.name==="onboarded")){
    db.exec("ALTER TABLE users ADD COLUMN onboarded INTEGER NOT NULL DEFAULT 0");
    // Legacy faction IDs had different names. Keep history and inventory, but
    // ask linked accounts to choose an identity in the new three-outpost world.
  }
  // One-time migration for prior receipts. Every new confirmed order updates
  // this row in the same transaction as its inventory entitlement.
  if (!db.prepare("SELECT id FROM economy_totals WHERE id=1").get()) {
    db.exec("BEGIN IMMEDIATE");
    try {
      let rivalOrders=0, stableOrders=0, rivalGross=0n, rivalRetired=0n, stableGross=0n;
      for (const row of db.prepare("SELECT payload FROM orders WHERE status='confirmed'").all() as {payload:string}[]) {
        const p=JSON.parse(row.payload), amount=BigInt(p.order.amount);
        if (p.asset==="rival") {
          rivalOrders++; rivalGross+=amount;
          rivalRetired+=amount*BigInt(p.order.creator?.toLowerCase() === "0x0000000000000000000000000000000000000000" ? 2000 : 200)/10000n;
        } else { stableOrders++; stableGross+=amount; }
      }
      db.prepare("INSERT INTO economy_totals VALUES (1,?,?,?,?,?)").run(rivalOrders,stableOrders,rivalGross.toString(),rivalRetired.toString(),stableGross.toString());
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  return db;
}
export type DB = ReturnType<typeof database>;
export function tx<T>(db: DB, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
