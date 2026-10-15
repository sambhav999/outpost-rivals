import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserProvider, Contract } from "ethers";
import { World } from "./World";
import {
  createGame,
  FACTIONS,
  cost,
  validateOrder,
  type Order,
} from "../shared/game";
import { STORE_ABI, ERC20_ABI } from "../shared/checkout";
import "./style.css";
declare global {
  interface Window {
    ethereum?: any;
  }
}
let csrf = "";
async function api(path: string, body?: any, method = body ? "POST" : "GET") {
  const r = await fetch("/api" + path, {
    method,
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      ...(csrf ? { "X-CSRF-Token": csrf } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
const preview = createGame("outpost-preview");
preview.tiles.forEach((t, i) => {
  if (t.kind !== "base" && i % 7 === 0) t.owner = i % 3;
});
function App() {
  const [boot, setBoot] = useState<any>(),
    [page, setPage] = useState("world"),
    [game, setGame] = useState<any>(),
    [match, setMatch] = useState(""),
    [selected, setSelected] = useState(""),
    [order, setOrder] = useState<Order>({ type: "scout" }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now()),
    [board, setBoard] = useState<any[]>([]),
    [replay, setReplay] = useState<any>(),
    [step, setStep] = useState(0),
    [room, setRoom] = useState(""),
    [profile, setProfile] = useState<any>(),
    [quote, setQuote] = useState<any>(),
    [pending, setPending] = useState<any>(() => {
      try {
        return JSON.parse(localStorage.getItem("pending-purchase") || "null");
      } catch {
        return null;
      }
    });
  const refresh = async () => {
    const b = await api("/bootstrap");
    setBoot(b);
    setProfile(b.profile);
  };
  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    run(async () => {
      const s = await api("/session", {});
      csrf = s.csrf;
      await refresh();
      const params = new URLSearchParams(location.search);
      if (params.get("replay")) {
        const r = await api("/replays/" + params.get("replay"));
        setReplay(r);
        setPage("replay");
      }
      if (params.get("room")) setRoom(params.get("room")!);
    });
  }, []);
  useEffect(() => {
    if (!match) return;
    let alive = true;
    const poll = async () => {
      try {
        const g = await api("/matches/" + match);
        if (alive)
          setGame((old: any) =>
            JSON.stringify(old) === JSON.stringify(g) ? old : g,
          );
      } catch (e: any) {
        if (alive) setError(e.message);
      }
    };
    poll();
    const t = setInterval(poll, 1500);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [match]);
  useEffect(() => {
    const t = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const start = (mode: string) =>
    run(async () => {
      const r = await api("/matches", { mode });
      setMatch(r.id);
      setReplay(null);
      setPage("world");
      setSelected("");
    });
  async function connect() {
    if (!window.ethereum)
      throw Error(
        "Install an EVM wallet to connect. You can play without one.",
      );
    const chain = boot.chain;
    const hex = "0x" + chain.id.toString(16);
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch (e: any) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName:
              chain.id === 4663 ? "Robinhood Chain" : "Robinhood Chain Testnet",
            nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
            rpcUrls: [chain.rpc],
            blockExplorerUrls: [chain.explorer],
          },
        ],
      });
    }
    const provider = new BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    if (Number((await provider.getNetwork()).chainId) !== chain.id)
      throw Error("Switch to the configured Robinhood network");
    const address = await signer.getAddress();
    const challenge = await api("/wallet/challenge", { address });
    const signature = await signer.signMessage(challenge.message);
    const verified = await api("/wallet/verify", {
      nonce: challenge.nonce,
      signature,
    });
    csrf = verified.csrf;
    await refresh();
    return { provider, signer };
  }
  async function purchase() {
    if (!quote) return;
    const { provider, signer } = await connect();
    if (
      (await signer.getAddress()).toLowerCase() !==
      quote.order.payer.toLowerCase()
    )
      throw Error("Wallet changed. Request a new quote.");
    const token = new Contract(quote.order.asset, ERC20_ABI, signer),
      amount = BigInt(quote.order.amount);
    if ((await token.balanceOf(quote.order.payer)) < amount)
      throw Error("Insufficient payment asset balance");
    if ((await token.allowance(quote.order.payer, quote.store)) < amount) {
      setNotice("Confirm the exact token allowance in your wallet.");
      await (await token.approve(quote.store, amount)).wait();
    }
    setNotice("Confirm cosmetic purchase in your wallet.");
    const tx = await new Contract(quote.store, STORE_ABI, signer).purchase(
      quote.order,
      quote.signature,
    );
    const p = { id: quote.order.orderId, hash: tx.hash };
    setPending(p);
    localStorage.setItem("pending-purchase", JSON.stringify(p));
    await tx.wait(3);
    await api("/shop/orders/" + p.id + "/confirm", { hash: p.hash });
    localStorage.removeItem("pending-purchase");
    setPending(null);
    setQuote(null);
    setNotice("Cosmetic unlocked. Equip it in Captain.");
    await refresh();
    provider.destroy();
  }
  const openReplay = (id: string) =>
    run(async () => {
      const r = await api("/replays/" + id);
      setReplay(r);
      setStep(0);
      setPage("replay");
    });
  function share() {
    const url = location.origin + "/?replay=" + game.id;
    navigator.clipboard
      ?.writeText(url)
      .then(() => setNotice("Replay link copied."))
      .catch(() => setNotice(url));
  }
  if (!boot)
    return (
      <div className="loading">
        <img src="/mark.svg" />
        <h1>Opening the frontier</h1>
        <p>{error || "Preparing your captain and world…"}</p>
        {error && <button onClick={() => location.reload()}>Retry</button>}
      </div>
    );
  const self = game?.factions?.[game.you],
    showGame = page === "world" && game,
    shown =
      page === "replay" && replay
        ? { ...replay.snapshots[step]?.state, you: 0 }
        : showGame
          ? game
          : preview;
  const plannedOrder = { ...order, target: selected || undefined };
  const orderIssue =
    game?.status === "active"
      ? validateOrder(game, game.you, plannedOrder)
      : null;
  const orderCost =
    game?.status === "active" ? cost(game, game.you, plannedOrder) : 0;
  return (
    <>
      <header>
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            setPage("world");
          }}
        >
          <img src="/mark.svg" />
          <span>
            OUTPOST<span className="subbrand">RIVALS</span>
          </span>
        </a>
        <nav>
          {[
            ["world", "The frontier"],
            ["captain", "Captain"],
            ["warroom", "War room"],
            ["armory", "Armory"],
            ["economy", "Economy"],
          ].map(([id, label]) => (
            <button
              className={page === id ? "active" : ""}
              key={id}
              onClick={() => {
                setPage(id);
                if (id === "warroom")
                  run(async () => setBoard(await api("/leaderboard")));
                if (id === "captain" || id === "armory") run(refresh);
              }}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="wallet" disabled={busy} onClick={() => run(connect)}>
          {boot.profile.wallet
            ? boot.profile.wallet.slice(0, 6) +
              "…" +
              boot.profile.wallet.slice(-4)
            : "Connect wallet"}
          <span>↗</span>
        </button>
      </header>
      <div className="network">
        <span className="dot" />{" "}
        {boot.chain.id === 4663 ? "ROBINHOOD CHAIN" : "ROBINHOOD TESTNET"}
        <span>FREE TO PLAY · COSMETICS ONLY</span>
        <span className="network-end">SEASON 00 / THE FIRST FRONTIER</span>
      </div>
      {error && (
        <div role="alert" className="toast error">
          {error}
          <button onClick={() => setError("")}>×</button>
        </div>
      )}
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button onClick={() => setNotice("")}>×</button>
        </div>
      )}
      {(page === "world" || page === "replay") && (
        <main className={"frontier " + (showGame ? "in-match" : "")}>
          <div className="hero-copy">
            {showGame ? (
              <>
                <div className="eyebrow">
                  {game.mode === "weekly"
                    ? "DAILY RANKED CHALLENGE"
                    : "LIVE FRONTIER"}{" "}
                  / {game.code}
                </div>
                <h1>
                  {game.status === "lobby"
                    ? "Gather your rivals."
                    : game.status === "finished"
                      ? game.winner === -1
                        ? "A divided frontier."
                        : game.winner === game.you
                          ? "The frontier is yours."
                          : "A rival takes the frontier."
                      : "Every order leaves a mark."}
                </h1>
                <p>
                  {game.status === "lobby"
                    ? "Share your room code. The host can start with up to three players; empty seats become agents."
                    : game.status === "finished"
                      ? "The match is complete. Your captain carries this history into the next encounter."
                      : "Commit one order. Rivals plan at the same time. Unsubmitted orders hold when the timer expires."}
                </p>
              </>
            ) : page === "replay" ? (
              <>
                <div className="eyebrow">THE WAR ARCHIVE</div>
                <h1>Every rivalry has a history.</h1>
                <p>
                  {replay?.verified
                    ? "Replay hash chain checks out."
                    : "Replay integrity has not been established."}{" "}
                  Server receipts, not onchain gameplay verification.
                </p>
              </>
            ) : (
              <>
                <div className="eyebrow">A SIX-ROUND STRATEGY GAME</div>
                <h1>
                  A small world.
                  <br />A long <em>memory.</em>
                </h1>
                <p>
                  Lead a captain. Scout the unknown. Make a pact—or break one.
                  Three rivals. One frontier. Every decision matters.
                </p>
                <div className="hero-buttons">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => start("solo")}
                  >
                    Enter the frontier <span>↗</span>
                  </button>
                  <button className="secondary" onClick={() => start("room")}>
                    Play with friends
                  </button>
                </div>
                <div className="micro">
                  NO WALLET NEEDED <span>·</span> SIX ROUNDS <span>·</span>{" "}
                  THREE FACTIONS
                </div>
              </>
            )}
            {showGame && game.status === "lobby" && (
              <section className="panel">
                <h3>Room {game.code}</h3>
                {game.players.map((p: any) => (
                  <p key={p.slot}>◈ {p.name}</p>
                ))}
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(
                      location.origin + "/?room=" + game.code,
                    );
                    setNotice("Room link copied.");
                  }}
                >
                  Copy invite
                </button>
                {game.host && (
                  <button
                    className="primary"
                    onClick={() =>
                      run(async () => {
                        await api("/matches/" + match + "/start", {});
                        setGame(await api("/matches/" + match));
                      })
                    }
                  >
                    Start match
                  </button>
                )}
              </section>
            )}
            {showGame && game.status === "active" && (
              <section className="order-card">
                <div className="row">
                  <b>ROUND {game.round} / 6</b>
                  <span className="timer">
                    {Math.max(0, Math.ceil((game.deadline - clock) / 1000))}s
                  </span>
                </div>
                <div className="stats">
                  <span>
                    <b>{self.supplies}</b>Supply
                  </span>
                  <span>
                    <b>{self.hp}/4</b>Squad
                  </span>
                  <span>
                    <b>{self.score}</b>Renown
                  </span>
                </div>
                <div className="order-types">
                  {["scout", "contest", "develop", "pact", "hold"].map(
                    (type) => (
                      <button
                        key={type}
                        className={order.type === type ? "selected" : ""}
                        onClick={() =>
                          setOrder({
                            type: type as any,
                            upgrade: "income",
                            partner: (game.you + 1) % 3,
                          })
                        }
                      >
                        {type}
                      </button>
                    ),
                  )}
                </div>
                <p className="hint">
                  {order.type === "scout"
                    ? "Reveal terrain within two hexes. Scouting does not capture."
                    : order.type === "contest"
                      ? "Capture an explored hex within two steps. Squads clash if they meet."
                      : order.type === "develop"
                        ? "Improve supply income, fortifications or squad health."
                        : order.type === "pact"
                          ? "Both captains must offer a pact to each other this round to receive the reward."
                          : "Spend nothing. Hold your current ground."}
                </p>
                {["scout", "contest"].includes(order.type) && (
                  <label>
                    Destination
                    <select
                      value={selected}
                      onChange={(e) => setSelected(e.target.value)}
                    >
                      <option value="">Choose a hex on the map</option>
                      {game.tiles.map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.id} · {t.kind}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {order.type === "develop" && (
                  <select
                    value={order.upgrade}
                    onChange={(e) =>
                      setOrder({ ...order, upgrade: e.target.value as any })
                    }
                  >
                    <option value="income">Supply income +1 (cap +2)</option>
                    <option value="fortify">Fortification +1</option>
                    <option value="heal">Restore 2 squad strength</option>
                  </select>
                )}
                {order.type === "pact" && (
                  <select
                    value={order.partner}
                    onChange={(e) =>
                      setOrder({ ...order, partner: Number(e.target.value) })
                    }
                  >
                    {game.factions
                      .filter((f: any) => f.id !== game.you)
                      .map((f: any) => (
                        <option key={f.id} value={f.id}>
                          {f.captain}
                        </option>
                      ))}
                  </select>
                )}
                <p className="hint">
                  Cost: <b>{orderCost} Supply</b> ·{" "}
                  {orderIssue || "Order is valid. Ready to commit."}
                </p>
                <button
                  disabled={busy || game.submitted || !!orderIssue}
                  className="primary full"
                  onClick={() =>
                    run(async () => {
                      await api("/matches/" + match + "/orders", {
                        round: game.round,
                        order: { ...order, target: selected || undefined },
                      });
                      setGame(await api("/matches/" + match));
                      setSelected("");
                    })
                  }
                >
                  {game.submitted
                    ? "Order sealed · waiting for rivals"
                    : "Seal this order →"}
                </button>
                <button
                  className="text-button"
                  disabled={busy || game.submitted}
                  onClick={() =>
                    run(async () => {
                      await api("/matches/" + match + "/orders", {
                        round: game.round,
                        order: { type: "hold" },
                      });
                      setGame(await api("/matches/" + match));
                    })
                  }
                >
                  Hold this round
                </button>
              </section>
            )}
            {showGame && game.status === "finished" && (
              <section className="panel">
                <div className="stats">
                  {game.factions.map((f: any) => (
                    <span key={f.id}>
                      <b>{f.score}</b>
                      {f.captain}
                    </span>
                  ))}
                </div>
                <button className="primary" onClick={() => openReplay(game.id)}>
                  Watch replay →
                </button>
                <button onClick={share}>Share result</button>
                <button
                  onClick={() => {
                    setGame(null);
                    setMatch("");
                    refresh();
                  }}
                >
                  Return to frontier
                </button>
              </section>
            )}
            {page === "replay" && replay && (
              <section className="panel">
                <label>
                  Round {replay.snapshots[step]?.round}
                  <input
                    type="range"
                    min="0"
                    max={replay.snapshots.length - 1}
                    value={step}
                    onChange={(e) => setStep(Number(e.target.value))}
                  />
                </label>
                <p className="hash">SHA-256 {replay.digest}</p>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(replay, null, 2)], {
                      type: "application/json",
                    });
                    const url = URL.createObjectURL(blob),
                      a = document.createElement("a");
                    a.href = url;
                    a.download = "outpost-replay.json";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download receipts
                </button>
                <button
                  onClick={() => {
                    setGame(null);
                    setMatch("");
                    setPage("world");
                  }}
                >
                  Play your own frontier
                </button>
              </section>
            )}
          </div>
          <div className="map-wrap">
            <div className="map-heading">
              <span>THE FIRST FRONTIER</span>
              <span>
                {showGame ? "TACTICAL VIEW" : "37 HEXES · INFINITE RIVALRIES"}
              </span>
            </div>
            <World
              game={shown}
              cosmetic={boot.profile.skin}
              selected={selected}
              onSelect={setSelected}
            />
            <div className="map-caption">
              <span>◈ Scout. Develop. Contest.</span>
              <span>
                {showGame
                  ? "Click a hex to plan"
                  : "Original world · autonomous rivals"}
              </span>
            </div>
            {showGame && (
              <div className="rival-strip">
                {game.factions.map((f: any) => (
                  <div key={f.id}>
                    <i style={{ background: FACTIONS[f.id].color }} />
                    <b>{f.captain}</b>
                    <span>{f.score} renown</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="frontier-bottom">
            <section className="weather">
              <span className="eyebrow">
                {(showGame ? game.market : boot.market).status === "live"
                  ? "DAILY QUOTE SNAPSHOT"
                  : (showGame
                      ? game.market
                      : boot.market
                    ).status.toUpperCase()}{" "}
                / FRONTIER CONDITIONS
              </span>
              <h3>{(showGame ? game.market : boot.market).label}</h3>
              <p>{(showGame ? game.market : boot.market).detail}</p>
              <small className="hint">
                Captured{" "}
                {new Date(
                  (showGame ? game.market : boot.market).timestamp,
                ).toLocaleString()}
              </small>
            </section>
            {showGame ? (
              <section className="journal">
                <div className="eyebrow">FIELD NOTES</div>
                {game.events.slice(-3).map((e: any, i: number) => (
                  <p key={i}>
                    <span>R{e.round}</span> {e.text}
                  </p>
                ))}
                {!game.events.length && (
                  <p>Your story starts with the first order.</p>
                )}
              </section>
            ) : (
              <section className="join">
                <div className="eyebrow">A RIVAL SENT YOU A CODE?</div>
                <div className="row">
                  <input
                    aria-label="Room code"
                    placeholder="ROOM CODE"
                    maxLength={8}
                    value={room}
                    onChange={(e) => setRoom(e.target.value.toUpperCase())}
                  />
                  <button
                    disabled={busy || !room}
                    onClick={() =>
                      run(async () => {
                        const r = await api("/rooms/join", { code: room });
                        setMatch(r.id);
                      })
                    }
                  >
                    Join →
                  </button>
                </div>
              </section>
            )}
          </div>
          {!showGame && page !== "replay" && (
            <div className="factions">
              {FACTIONS.map((f, i) => (
                <button
                  className={
                    "faction " + (boot.profile.faction === i ? "chosen" : "")
                  }
                  key={f.name}
                  onClick={() => {
                    setPage("captain");
                    setProfile({ ...boot.profile, faction: i });
                  }}
                >
                  <span className="faction-symbol" style={{ color: f.color }}>
                    {f.symbol}
                  </span>
                  <div>
                    <small>FACTION 0{i + 1}</small>
                    <h3>{f.name}</h3>
                    <p>{f.tag}</p>
                  </div>
                  <span>↗</span>
                </button>
              ))}
            </div>
          )}
        </main>
      )}
      {page === "captain" && (
        <main className="content">
          <div className="eyebrow">YOUR PERSISTENT AGENT</div>
          <h1>A captain with history.</h1>
          <p className="intro">
            Rivals use deterministic tactical policies. Their memories record
            alliances and clashes. You choose your captain’s orders; no AI
            controls your wallet.
          </p>
          <div className="columns">
            <section className="panel">
              <h2>Captain’s mandate</h2>
              <label>
                Name
                <input
                  maxLength={24}
                  value={profile.name}
                  onChange={(e) =>
                    setProfile({ ...profile, name: e.target.value })
                  }
                />
              </label>
              <label>
                Faction
                <select
                  value={profile.faction}
                  onChange={(e) =>
                    setProfile({ ...profile, faction: Number(e.target.value) })
                  }
                >
                  {FACTIONS.map((f, i) => (
                    <option value={i} key={i}>
                      {f.name} · {f.doctrine}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Combat stance
                <select
                  value={profile.stance}
                  onChange={(e) =>
                    setProfile({ ...profile, stance: e.target.value })
                  }
                >
                  <option value="balanced">Balanced</option>
                  <option value="bold">
                    Bold: +1 strength; Contest costs +1
                  </option>
                  <option value="careful">
                    Careful: +1 defending owned terrain
                  </option>
                </select>
              </label>
              <label>
                Equipped cosmetic
                <select
                  value={profile.skin}
                  onChange={(e) =>
                    setProfile({ ...profile, skin: e.target.value })
                  }
                >
                  <option value="">Frontier uniform</option>
                  {boot.inventory.map((id: string) => (
                    <option key={id} value={id}>
                      {boot.shop.items.find((i: any) => i.id === id)?.name ||
                        id}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api(
                      "/profile",
                      {
                        name: profile.name,
                        faction: profile.faction,
                        stance: profile.stance,
                        skin: profile.skin,
                      },
                      "PATCH",
                    );
                    await refresh();
                    setNotice("Captain saved. Changes apply to new matches.");
                  })
                }
              >
                Save captain →
              </button>
            </section>
            <section className="panel captain-card">
              <div
                className="captain-emblem"
                style={{ color: FACTIONS[profile.faction].color }}
              >
                {FACTIONS[profile.faction].symbol}
              </div>
              <h2>{profile.name}</h2>
              <p>{FACTIONS[profile.faction].name}</p>
              <div className="stats">
                <span>
                  <b>{profile.played}</b>Matches
                </span>
                <span>
                  <b>{profile.wins}</b>Wins
                </span>
                <span>
                  <b>{profile.xp}</b>XP
                </span>
              </div>
              <h3>Rival memory</h3>
              {Object.entries(profile.memory).length ? (
                Object.entries(profile.memory).map(([i, value]) => (
                  <p key={i}>
                    {FACTIONS[Number(i)]?.name}:{" "}
                    {Number(value) > 0
                      ? "Trust +" + value
                      : Number(value) < 0
                        ? "Grudge " + value
                        : "Neutral"}
                  </p>
                ))
              ) : (
                <p>No shared history yet. Play a frontier to begin.</p>
              )}
              <p className="hint">
                Ranked play resets stances and memory for equal starts. Guest
                profiles stay on this browser; link a wallet to restore your
                account elsewhere.
              </p>
            </section>
          </div>
        </main>
      )}
      {page === "warroom" && (
        <main className="content">
          <div className="eyebrow">THE WAR ROOM</div>
          <h1>Earn your place.</h1>
          <div className="columns">
            <section className="panel">
              <h2>Daily equal-start challenge</h2>
              <p>
                Same map seed. Same faction and stance. Neutral market costs.
                One ranked attempt per account each UTC day. Best score in the
                last seven days ranks.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => start("weekly")}
              >
                Begin today’s attempt →
              </button>
              <p className="hint">
                No cash or token rewards. Account limits are not proof of unique
                humans.
              </p>
              <h3>Seven-day standings</h3>
              {board.length ? (
                board.map((p, i) => (
                  <div className="leader row" key={i}>
                    <span>
                      {String(i + 1).padStart(2, "0")} · {p.name}
                    </span>
                    <b>{p.score} renown</b>
                  </div>
                ))
              ) : (
                <p>No completed ranked attempts yet. Set the first score.</p>
              )}
            </section>
            <section className="panel">
              <h2>Your field archive</h2>
              {boot.history.length ? (
                boot.history.map((h: any) => (
                  <div className="leader row" key={h.id}>
                    <span>
                      {h.mode} · {h.status}
                      <small>{new Date(h.created).toLocaleDateString()}</small>
                    </span>
                    <button
                      onClick={() =>
                        h.status === "finished"
                          ? openReplay(h.id)
                          : (setMatch(h.id), setPage("world"))
                      }
                    >
                      {h.status === "finished" ? "Replay ↗" : "Resume →"}
                    </button>
                  </div>
                ))
              ) : (
                <p>Your finished games will appear here.</p>
              )}
            </section>
          </div>
        </main>
      )}
      {page === "armory" && (
        <main className="content">
          <div className="eyebrow">THE ARMORY</div>
          <h1>Make your mark.</h1>
          <p className="intro">
            Distinctive looks. Equal strength. Every item is cosmetic, with no
            effect on combat, supply or ranked scoring.
          </p>
          <div className="status-panel">
            {boot.shop.enabled
              ? "Onchain checkout configured"
              : boot.shop.reason}{" "}
            ·{" "}
            {boot.chain.id === 46630
              ? "Testnet assets have no intended monetary value."
              : "Prices are merchant-set, not an exchange quote."}
          </div>
          <div className="shop-grid">
            {boot.shop.items.map((item: any) => (
              <section className="shop-card" key={item.id}>
                <div
                  className={"item-art " + item.kind}
                  style={{ color: item.color }}
                >
                  <span>
                    {item.kind === "banner"
                      ? "⚑"
                      : item.kind === "theme"
                        ? "☾"
                        : item.kind === "badge"
                          ? "✧"
                          : "♜"}
                  </span>
                </div>
                <small>{item.category}</small>
                <h3>{item.name}</h3>
                <p>{item.description}</p>
                <div className="row">
                  <b>{(item.priceCents / 100).toFixed(2)} USDG</b>
                  <span>Cosmetic</span>
                </div>
                {boot.inventory.includes(item.id) ? (
                  <button disabled>Owned · equip in Captain</button>
                ) : (
                  <div className="row">
                    <button
                      disabled={busy || !boot.shop.enabled}
                      onClick={() =>
                        run(async () => {
                          if (!boot.profile.wallet) await connect();
                          setQuote(
                            await api("/shop/orders", {
                              sku: item.id,
                              asset: "stable",
                            }),
                          );
                        })
                      }
                    >
                      USDG
                    </button>
                    <button
                      disabled={busy || !boot.shop.enabled}
                      onClick={() =>
                        run(async () => {
                          if (!boot.profile.wallet) await connect();
                          setQuote(
                            await api("/shop/orders", {
                              sku: item.id,
                              asset: "rival",
                            }),
                          );
                        })
                      }
                    >
                      RIVAL
                    </button>
                  </div>
                )}
              </section>
            ))}
          </div>
          {pending && (
            <section className="panel">
              <h3>Purchase awaiting confirmation</h3>
              <p className="hash">{pending.hash}</p>
              <button
                onClick={() =>
                  run(async () => {
                    await api("/shop/orders/" + pending.id + "/confirm", {
                      hash: pending.hash,
                    });
                    setPending(null);
                    localStorage.removeItem("pending-purchase");
                    await refresh();
                    setNotice("Purchase confirmed.");
                  })
                }
              >
                Retry receipt confirmation
              </button>
            </section>
          )}
        </main>
      )}
      {page === "economy" && (
        <main className="content">
          <div className="eyebrow">TRANSPARENT BY DESIGN</div>
          <h1>
            Play is free.
            <br />
            Style funds the frontier.
          </h1>
          <p className="intro">
            RIVAL is optional cosmetic utility. There are no promised returns,
            paid combat boosts, passive yield or inflationary play-to-earn
            rewards.
          </p>
          <div className="economy-grid">
            <section className="panel">
              <small>CANONICAL TOKEN</small>
              <h2>RIVAL</h2>
              <p>
                Planned o1 Standard launch on Robinhood Chain. Fixed launch
                supply: 1 billion. The launch pool receives the supply; there is
                no separate team or gameplay-rewards allocation in this design.
              </p>
              <p className="hash">
                {boot.chain.token || "Token not deployed / configured"}
              </p>
              {boot.chain.token && (
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={boot.chain.explorer + "/token/" + boot.chain.token}
                >
                  Inspect token ↗
                </a>
              )}
            </section>
            <section className="panel">
              <small>RIVAL COSMETIC CHECKOUT</small>
              <h2>80% / 20%</h2>
              <div className="split">
                <i />
                <i />
              </div>
              <p>
                80% goes to the operating treasury. 20% is sent to the disclosed
                dead address. Retirement does not reduce the ERC-20 totalSupply
                counter.
              </p>
              <p>
                USDG checkout: 100% treasury. Launchpad trading fees are
                separate from game checkout.
              </p>
            </section>
            <section className="panel">
              <small>NO FINANCIAL SHORTCUTS</small>
              <h2>Earn reputation.</h2>
              <p>
                Wins earn nontransferable XP. Purchases unlock visual identity
                only. More token holders do not guarantee more players, revenue,
                liquidity or token appreciation.
              </p>
              <p>
                Creator marketplace splits are supported by the contract but
                creator publishing is not enabled in this release.
              </p>
            </section>
          </div>
          <section className="panel">
            <h3>Where real-world assets fit</h3>
            <p>
              Optional Robinhood underlying equity prices influence a daily,
              capped Supply cost. The game does not sell equities, hold player
              deposits, offer a vault or distribute investment yield. If fresh
              quotes cannot be verified, the cost modifier is neutral.
            </p>
            <p>
              Current mode: <b>{boot.market.status}</b> · {boot.market.source}
            </p>
          </section>
        </main>
      )}
      <footer>
        <span>OUTPOST RIVALS</span>
        <span>A small world. A long memory.</span>
        <button onClick={() => setPage("economy")}>Read the economy ↗</button>
      </footer>
      {quote && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="Review cosmetic purchase"
          >
            <div className="eyebrow">REVIEW BEFORE SIGNING</div>
            <h2>
              {boot.shop.items.find((i: any) => i.id === quote.sku)?.name}
            </h2>
            <h3>{quote.displayAmount}</h3>
            <p>
              Cosmetic access only. Network gas is additional. Signed price
              expires in five minutes.{" "}
              {quote.asset === "rival"
                ? "20% retirement / 80% treasury."
                : "100% treasury."}
            </p>
            <p className="hash">Contract: {quote.store}</p>
            <button
              disabled={busy}
              className="primary"
              onClick={() => run(purchase)}
            >
              Approve & purchase →
            </button>
            <button disabled={busy} onClick={() => setQuote(null)}>
              Cancel
            </button>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
