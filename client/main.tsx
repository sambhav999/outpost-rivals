import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { RainbowKitProvider, useAccountModal, useConnectModal, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, useAccount, useSwitchChain } from "wagmi";
import { World } from "./World";
import { walletConfig, walletConnectEnabled } from "./wallet";
import {
  createGame,
  FACTIONS,
  cost,
  validateOrder,
  type Order,
} from "../shared/game";
import { STORE_ABI, ERC20_ABI, EMPTY_PRICE_CHECK } from "../shared/checkout";
import "@rainbow-me/rainbowkit/styles.css";
import "./style.css";
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
  const { address: activeAddress, chainId: activeChainId, connector, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { switchChainAsync } = useSwitchChain();
  const livingFrame = useRef<HTMLIFrameElement>(null);
  const [authRequested, setAuthRequested] = useState(false);
  const [boot, setBoot] = useState<any>(),
    [page, setPage] = useState("observatory"),
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
    [onboardingStep, setOnboardingStep] = useState(0),
    [quote, setQuote] = useState<any>(),
    [liquidity, setLiquidity] = useState<any>(),
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
    return b;
  };
  const syncLivingCaptain = (p = boot?.profile) => {
    if (!p?.wallet || !p?.onboarded) return;
    livingFrame.current?.contentWindow?.postMessage({
      type: "OUTPOST_CAPTAIN", name: p.name, faction: p.faction
    }, location.origin);
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
  useEffect(() => {
    if (page !== "economy") return;
    let alive = true;
    const load = async () => {
      try { const x = await api("/liquidity"); if (alive) setLiquidity(x); }
      catch { if (alive) setLiquidity({ status: "unavailable", reason: "Market data unavailable" }); }
    };
    load();
    const timer = setInterval(load, 30000);
    return () => { alive = false; clearInterval(timer); };
  }, [page]);
  useEffect(() => {
    syncLivingCaptain();
  }, [boot?.profile?.wallet, boot?.profile?.onboarded, boot?.profile?.name, boot?.profile?.faction]);
  useEffect(() => {
    setQuote(null);
  }, [activeAddress, activeChainId]);
  useEffect(() => {
    if (!authRequested || !isConnected || !boot) return;
    setAuthRequested(false);
    run(async () => { await connect(); });
  }, [authRequested, isConnected, activeAddress, boot?.chain?.id]);
  function requestWallet() {
    if (!isConnected) {
      setAuthRequested(true);
      if (openConnectModal) openConnectModal();
      else setError("Wallet picker unavailable. Configure a WalletConnect project ID or install an EVM wallet.");
    } else run(async () => { await connect(); });
  }
  async function requestQuote(sku: string, asset: "stable" | "rival") {
    if (!isConnected || !activeAddress) return requestWallet();
    if (boot.profile.wallet?.toLowerCase() !== activeAddress.toLowerCase()) {
      await connect();
      setNotice("Wallet linked. Return to the Armory after creating your captain.");
      return;
    }
    if (!boot.profile.onboarded) throw Error("Create your captain before checkout");
    if (activeChainId !== boot.chain.id) await switchChainAsync({ chainId: boot.chain.id });
    setQuote(await api("/shop/orders", { sku, asset }));
  }
  const start = (mode: string) =>
    run(async () => {
      const r = await api("/matches", { mode });
      setMatch(r.id);
      setReplay(null);
      setPage("tactics");
      setSelected("");
    });
  async function connect(forPurchase = false) {
    if (!activeAddress || !connector) throw Error("Connect your wallet first.");
    const chain = boot.chain;
    if (import.meta.env.VITE_CHAIN_ID && Number(import.meta.env.VITE_CHAIN_ID) !== chain.id)
      throw Error("Client chain configuration differs from the server. Ask the operator to rebuild the app.");
    if (activeChainId !== chain.id) await switchChainAsync({ chainId: chain.id });
    const { BrowserProvider } = await import("ethers");
    const rawProvider = await connector.getProvider();
    if (!rawProvider) throw Error("Selected wallet did not provide an EVM connection.");
    const provider = new BrowserProvider(rawProvider as any, "any");
    const signer = await provider.getSigner(activeAddress);
    if (Number((await provider.getNetwork()).chainId) !== chain.id)
      throw Error("Switch to the configured Robinhood network");
    const address = await signer.getAddress();
    if (address.toLowerCase() !== activeAddress.toLowerCase()) throw Error("Wallet account changed. Reconnect.");
    if (forPurchase) {
      if (boot.profile.wallet?.toLowerCase() !== address.toLowerCase())
        throw Error("Link this wallet to your captain before paying.");
      return { provider, signer, profile: boot.profile };
    }
    const challenge = await api("/wallet/challenge", { address });
    const signature = await signer.signMessage(challenge.message);
    const verified = await api("/wallet/verify", {
      nonce: challenge.nonce,
      signature,
    });
    csrf = verified.csrf;
    const updated = await refresh();
    if (verified.restored) {
      setMatch("");
      setGame(null);
      setRoom("");
    }
    if (!updated.profile.onboarded && /^Captain [0-9a-f]{4}$/i.test(updated.profile.name))
      setProfile({ ...updated.profile, name: "" });
    setPage("observatory");
    setOnboardingStep(0);
    setNotice(updated.profile.onboarded
      ? verified.restored
        ? "Existing captain restored. Guest match progress is not merged."
        : "Welcome back. Your captain is ready."
      : "Wallet verified. Create your captain to save your identity.");
    return { provider, signer, profile: updated.profile };
  }
  async function purchase() {
    if (!quote) return;
    const { Contract } = await import("ethers");
    const { provider, signer } = await connect(true);
    try {
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
    // An approval is a separate transaction and can outlive the signed price.
    // Keep the allowance, but ask the player to review a newly signed quote.
    if (Date.now() + 15000 >= quote.order.expires * 1000) {
      const fresh = await api("/shop/orders", { sku: quote.sku, asset: quote.asset });
      setQuote(fresh);
      throw Error("Price quote expired during approval. Review the refreshed amount before buying.");
    }
    let proof = { proof: EMPTY_PRICE_CHECK, signature: "0x" };
    if (quote.asset === "rival") {
      try { proof = await api("/shop/orders/" + quote.order.orderId + "/price-check", {}); }
      catch (e: any) {
        if (/moved|expired|old/i.test(e.message)) {
          setQuote(null);
          setQuote(await api("/shop/orders", { sku: quote.sku, asset: quote.asset }));
          throw Error("Market changed. Review the refreshed token amount before buying.");
        }
        throw e;
      }
    }
    setNotice("Confirm cosmetic purchase in your wallet.");
    const tx = await new Contract(quote.store, STORE_ABI, signer).purchase(
      quote.order,
      quote.signature,
      proof.proof,
      proof.signature,
    );
    const p = { id: quote.order.orderId, hash: tx.hash };
    setPending(p);
    localStorage.setItem("pending-purchase", JSON.stringify(p));
    try {
      await tx.wait(3);
    } catch (e: any) {
      if (e.receipt?.status === 0) {
        localStorage.removeItem("pending-purchase");
        setPending(null);
        setQuote(null);
      }
      throw e;
    }
    await api("/shop/orders/" + p.id + "/confirm", { hash: p.hash });
    localStorage.removeItem("pending-purchase");
    setPending(null);
    setQuote(null);
    setNotice("Cosmetic unlocked. Equip it in Captain.");
    await refresh();
    } finally { provider.destroy(); }
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
    showGame = page === "tactics" && game,
    shown =
      page === "replay" && replay
        ? { ...replay.snapshots[step]?.state, you: 0 }
        : showGame
          ? game
          : preview;
  const chosenTile = shown.tiles?.find((t: any) => t.id === selected);
  const legalTargets = game?.status === "active" && ["scout", "contest"].includes(order.type)
    ? game.tiles.filter((t: any) => !validateOrder(game, game.you, { ...order, target: t.id })).map((t: any) => t.id)
    : [];
  const availableAction = game?.status === "active" && selected
    ? !validateOrder(game, game.you, { type: "contest", target: selected }) ? "contest"
      : !validateOrder(game, game.you, { type: "scout", target: selected }) ? "scout" : null
    : null;
  const selectHex = (id: string) => {
    setSelected(id);
    if (game?.status !== "active" || game.submitted) return;
    if (["scout", "contest"].includes(order.type) && !validateOrder(game, game.you, { ...order, target: id })) return;
    if (!validateOrder(game, game.you, { type: "contest", target: id })) setOrder({ type: "contest" });
    else if (!validateOrder(game, game.you, { type: "scout", target: id })) setOrder({ type: "scout" });
  };
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
            setPage("observatory");
          }}
        >
          <img src="/mark.svg" />
          <span>
            OUTPOST<span className="subbrand">RIVALS</span>
          </span>
        </a>
        <nav>
          {[
            ["observatory", "Living world"],
            ["tactics", "Tactical match"],
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
        <button className="wallet" disabled={busy} onClick={() =>
          isConnected && activeAddress?.toLowerCase() === boot.profile.wallet?.toLowerCase()
            ? openAccountModal?.() : requestWallet()
        }>
          {isConnected && activeAddress && boot.profile.wallet?.toLowerCase() === activeAddress.toLowerCase()
            ? activeAddress.slice(0, 6) + "…" + activeAddress.slice(-4)
            : isConnected ? "Link active wallet" : "Connect wallet"}
          <span>↗</span>
        </button>
      </header>
      <div className="network">
        <span className="dot" />{" "}
        {boot.chain.id === 4663 ? "ROBINHOOD CHAIN" : "ROBINHOOD TESTNET"}
        <span>FREE TO PLAY · COSMETICS ONLY</span>
        <span className="network-end">SEASON 00 / THE FIRST FRONTIER</span>
      </div>
      {page === "observatory" && (
        <main className="living-shell">
          <section className="living-intro">
            <div>
              <div className="eyebrow">THE LIVING FRONTIER / LOCAL WORLD SIMULATION</div>
              <h1>The world moves <em>without you.</em></h1>
              <p>Watch rival outposts grow, follow agents as they choose, fight and remember, and make a captain your own. Your wallet saves your captain and tactical match record.</p>
            </div>
            <div className="living-actions">
              {!boot.profile.wallet ? <button className="primary" disabled={busy} onClick={requestWallet}>Connect & create captain ↗</button>
                : <button className="primary" onClick={() => setPage("captain")}>{boot.profile.name} · Captain profile ↗</button>}
              <button onClick={() => start("solo")} disabled={busy}>Play tactical match</button>
            </div>
          </section>
          {boot.profile.wallet && boot.profile.onboarded && (
            <section className="captain-pass" aria-label="Saved captain account">
              <div className="captain-pass-identity">
                <span className="captain-pass-sigil" style={{color:FACTIONS[boot.profile.faction].color}}>{FACTIONS[boot.profile.faction].symbol}</span>
                <div><small>WALLET LINKED · GAME ACCOUNT</small><h2>{boot.profile.name}</h2>
                  <span>{FACTIONS[boot.profile.faction].name} · {boot.profile.stance} stance</span></div>
              </div>
              <div className="captain-pass-stats" aria-label="Persisted tactical record">
                <span><b>{boot.profile.played}</b><small>Matches</small></span>
                <span><b>{boot.profile.wins}</b><small>Wins</small></span>
                <span><b>{boot.profile.xp}</b><small>XP</small></span>
                <span><b>{boot.inventory.length}</b><small>Cosmetics</small></span>
              </div>
              <div className="captain-pass-actions">
                {boot.history.some((h:any)=>["active","lobby"].includes(h.status))
                  ? <button className="primary" onClick={()=>{setMatch(boot.history.find((h:any)=>["active","lobby"].includes(h.status)).id);setPage("tactics")}}>Resume match →</button>
                  : <button className="primary" disabled={busy} onClick={()=>start("solo")}>Play a match →</button>}
                <button disabled={busy} onClick={()=>start("weekly")}>Daily challenge</button>
              </div>
              <p>These stats are saved by the game server. The island below runs locally in this browser.</p>
            </section>
          )}
          <div className="living-frame">
            <iframe ref={livingFrame} title="Outpost Rivals living isometric world" src="/observatory.html?embedded=1" onLoad={() => syncLivingCaptain()} />
          </div>
          <p className="living-caption">Your connected captain name and faction are projected into this local simulation. Agent decisions, PX, battles and world outcomes here are not server-persisted or onchain.</p>
        </main>
      )}
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
      {(page === "tactics" || page === "replay") && (
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
                        onClick={() => {
                          setSelected("");
                          setOrder({
                            type: type as any,
                            upgrade: "income",
                            partner: (game.you + 1) % 3,
                          });
                        }}
                      >
                        <span aria-hidden="true">{{scout:"◇",contest:"⚑",develop:"▣",pact:"↔",hold:"·"}[type]}</span> {type}
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
                      {game.tiles.filter((t: any) => legalTargets.includes(t.id)).map((t: any) => (
                        <option key={t.id} value={t.id}>
                          {t.id} · {t.kind === "flag" ? "banner" : t.kind === "cache" ? "supply post" : t.kind}
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
                    setPage("tactics");
                  }}
                >
                  Play your own frontier
                </button>
              </section>
            )}
          </div>
          <div className="map-wrap">
            <div className="map-heading">
              <span><span className="map-sigil">✥</span> THE FIRST FRONTIER</span>
              <span>
                {showGame ? "TACTICAL VIEW" : "37 HEXES · INFINITE RIVALRIES"}
              </span>
            </div>
            <World
              game={shown}
              cosmetic={boot.profile.skin}
              selected={selected}
              reachable={legalTargets}
              onSelect={selectHex}
            />
            {chosenTile && <div className="tile-intel" role="status">
              <div className="tile-intel-top"><span>HEX {selected}</span><button aria-label="Clear selected hex" onClick={() => setSelected("")}>×</button></div>
              <h3>{chosenTile.kind === "flag" ? "Banner point" : chosenTile.kind === "cache" ? "Supply post" : chosenTile.kind === "base" ? "Home outpost" : chosenTile.kind === "fog" ? "Uncharted terrain" : chosenTile.kind === "forest" ? "Forest passage" : chosenTile.kind === "rock" ? "Stone ridge" : "Open ground"}</h3>
              <p>{chosenTile.kind === "flag" ? "Held banners score each round." : chosenTile.kind === "cache" ? "Captured posts add Supply each round." : chosenTile.kind === "fog" ? "Scout this hex to reveal its ground." : chosenTile.kind === "base" ? "Home outposts cannot be captured." : "Terrain can be contested after it is explored."}</p>
              {chosenTile.owner >= 0 && <span className="owner-chip" style={{borderColor:FACTIONS[chosenTile.owner].color,color:FACTIONS[chosenTile.owner].color}}>◆ {FACTIONS[chosenTile.owner].name}</span>}
              {game?.status === "active" && <div className="tile-intel-action">{availableAction ? `Available: ${availableAction} · ${cost(game,game.you,{type:availableAction,target:selected})} Supply` : "Inspect only · no legal move this round"}</div>}
            </div>}
            <div className="map-caption">
              <span>◈ Scout. Develop. Contest.</span>
              <span>
                {showGame
                  ? "Tap a glowing hex to plan"
                  : "Drag to orbit · select to inspect"}
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
                {game.events.slice(-4).map((e: any, i: number) => (
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
                          : (setMatch(h.id), setPage("tactics"))
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
              : "RIVAL requires a fresh, bounded market-price feed."}
            {!walletConnectEnabled && " · Mobile QR connection requires a WalletConnect project ID."}
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
                  <b>{(item.priceCents / 100).toFixed(2)} USDG equivalent</b>
                  <span>{item.payment === "rival" ? "RIVAL EDITION" : "Cosmetic"}</span>
                </div>
                {item.minMatches && <p className="hint">Unlocked for purchase after {item.minMatches} tactical matches · your record: {boot.profile.played}</p>}
                {boot.inventory.includes(item.id) ? (
                  <button disabled>Owned · equip in Captain</button>
                ) : (
                  <div className="row">
                    {item.payment !== "rival" && <button
                      disabled={busy || !boot.shop.enabled || (item.minMatches && boot.profile.played < item.minMatches)}
                      onClick={() => run(async () => requestQuote(item.id, "stable"))}
                    >USDG</button>}
                    <button
                      disabled={busy || !boot.shop.rivalEnabled || (item.minMatches && boot.profile.played < item.minMatches)}
                      onClick={() => run(async () => requestQuote(item.id, "rival"))}
                    >
                      {boot.chain.id === 46630 ? "tRIVAL" : "RIVAL"}
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
            RIVAL powers optional seasonal visual editions alongside USDG checkout. New editions require real player interest; there are no promised returns,
            paid combat boosts, passive yield or inflationary play-to-earn
            rewards.
          </p>
          <div className="economy-grid">
            <section className="panel">
              <small>o1 MARKET · INDEXED DATA</small>
              {liquidity?.status === "live" ? <>
                <h2>${liquidity.priceUsd} / RIVAL</h2>
                {liquidity.previousPriceUsd !== undefined && <p>
                  Price since prior observation: <b>{Number(liquidity.priceUsd) >= Number(liquidity.previousPriceUsd) ? "+" : ""}{((Number(liquidity.priceUsd) / Number(liquidity.previousPriceUsd) - 1) * 100).toFixed(2)}%</b>
                </p>}
                <p>Reported pool liquidity: <b>${Number(liquidity.liquidityUsd).toLocaleString()}</b></p>
                {liquidity.previousLiquidityUsd !== undefined && <p>
                  Since the prior recorded observation: <b>{liquidity.liquidityUsd >= liquidity.previousLiquidityUsd ? "+" : ""}${(liquidity.liquidityUsd - liquidity.previousLiquidityUsd).toLocaleString()}</b>
                  {" "}· {new Date(liquidity.previousAsOf).toLocaleString()}
                </p>}
                <p className="hint">Observed {new Date(liquidity.asOf).toLocaleString()} · block {liquidity.observedBlock}. Indexer estimate, not executable sell depth or funds deposited by the game.</p>
              </> : <>
                <h2>Market data unavailable</h2>
                <p>{liquidity?.reason || "Connect an o1 read key and launched token address to show observed price and pool liquidity."}</p>
              </>}
            </section>
            <section className="panel">
              <small>{boot.chain.id === 46630 ? "TESTNET PURCHASES" : "CONFIRMED GAME PURCHASES"}</small>
              <h2>{boot.economyMetrics.rivalOrders + boot.economyMetrics.stableOrders} purchases</h2>
              <p>{boot.economyMetrics.rivalOrders} RIVAL orders · {boot.economyMetrics.stableOrders} USDG orders</p>
              <p>{boot.economyMetrics.rivalRetired} {boot.chain.id === 46630 ? "tRIVAL" : "RIVAL"} sent to the dead address through confirmed game checkouts.</p>
              <p className="hint">{boot.economyMetrics.scope}. Testnet totals are experimental and have no economic value.</p>
            </section>
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
      {boot.profile.wallet && !boot.profile.onboarded && (
        <div className="modal-backdrop onboarding-backdrop">
          <section className="modal onboarding" role="dialog" aria-modal="true" aria-label="Create your captain">
            <div className="eyebrow">WALLET VERIFIED · STEP {onboardingStep + 1} OF 3</div>
            <div className="onboarding-progress" aria-hidden="true"><i style={{width: `${(onboardingStep + 1) * 33.34}%`}} /></div>
            {onboardingStep === 0 && <>
              <h2>Your name in the frontier.</h2>
              <p>This captain profile is linked to {boot.profile.wallet.slice(0, 6)}…{boot.profile.wallet.slice(-4)}. Your wallet signature authorized account linking only.</p>
              <label>Captain name
                <input autoFocus maxLength={24} value={profile.name}
                  onChange={e => setProfile({...profile,name:e.target.value})}
                  placeholder="Choose a name" />
              </label>
            </>}
            {onboardingStep === 1 && <>
              <h2>Choose an outpost.</h2>
              <p>Your captain appears with this faction in the living world. Faction is identity, not a paid advantage.</p>
              <div className="onboarding-factions">
                {FACTIONS.map((f,i)=><button key={f.name}
                  type="button" className={profile.faction===i?"selected":""}
                  onClick={()=>setProfile({...profile,faction:i})}>
                  <b style={{color:f.color}}>{f.symbol}</b><span>{f.name}<small>{f.doctrine}</small></span>
                </button>)}
              </div>
            </>}
            {onboardingStep === 2 && <>
              <h2>Set your first mandate.</h2>
              <p>Your stance applies to tactical matches. The living world's agents remain autonomous.</p>
              <div className="onboarding-stances">
                {([["balanced","Balanced","Adapt to the frontier"],["bold","Bold","Take risks in contests"],["careful","Careful","Defend what you hold"]] as const)
                  .map(([id,label,description])=><button key={id} className={profile.stance===id?"selected":""}
                    onClick={()=>setProfile({...profile,stance:id})}><b>{label}</b><small>{description}</small></button>)}
              </div>
              <div className="onboarding-summary">{profile.name} · {FACTIONS[profile.faction].name} · {profile.stance}</div>
            </>}
            <div className="onboarding-controls">
              {onboardingStep>0 && <button disabled={busy} onClick={()=>setOnboardingStep(onboardingStep-1)}>← Back</button>}
              {onboardingStep<2
                ? <button className="primary" disabled={busy||(onboardingStep===0&&!/^[\w \-']{2,24}$/.test(profile.name.trim()))}
                  onClick={()=>setOnboardingStep(onboardingStep+1)}>Continue →</button>
                : <button className="primary" disabled={busy} onClick={()=>run(async()=>{
                    await api("/onboarding",{name:profile.name.trim(),faction:profile.faction,stance:profile.stance});
                    const b=await refresh();
                    setOnboardingStep(0);
                    setPage("observatory");
                    syncLivingCaptain(b.profile);
                    setNotice("Captain created. Enter the living world.");
                  })}>Create captain →</button>}
            </div>
          </section>
        </div>
      )}
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
              expires in {Math.max(0, Math.ceil((quote.order.expires * 1000 - clock) / 1000))} seconds. Source: {quote.quoteSource}.{" "}
              {quote.asset === "rival"
                ? "20% retirement / 80% treasury. A fresh signed price check is required at purchase; a fast move cancels this quote."
                : "100% treasury."}
            </p>
            <p className="hash">Contract: {quote.store}</p>
            <button
              disabled={busy || clock >= quote.order.expires * 1000 || !isConnected || boot.profile.wallet?.toLowerCase() !== activeAddress?.toLowerCase()}
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
const queryClient = new QueryClient();
createRoot(document.getElementById("root")!).render(
  <WagmiProvider config={walletConfig}>
    <QueryClientProvider client={queryClient}>
      <RainbowKitProvider theme={darkTheme({ accentColor: "#d8b478", accentColorForeground: "#14221a" })}>
        <App />
      </RainbowKitProvider>
    </QueryClientProvider>
  </WagmiProvider>,
);
