# Frontend experience review — v1.2

## Post-wallet experience and isometric island

The landing page now embeds the autonomous pixel-art island from the provided reference. It has three outposts, agents with memory, world activity, a feed, observation panels, controls and minimap. The app frames it as a local simulation. After an EVM wallet verifies, a new user names a captain, chooses the same faction names/colors as the island, and selects a tactical stance. The saved account summary shows matches, wins, XP and cosmetics, with entry points to resume a match or play the daily challenge. The name/faction projection is visual; island resources and PX do not persist.

The island is a separate canvas runtime loaded in a same-origin iframe. The existing Three.js hex board remains the server-owned tactical mode. This is a two-mode product, so test whether players understand the distinction before public launch. If the intended final product is a shared persistent island, the local runtime must be moved behind an authoritative service.

## Honest assessment of v1.0

The first build did have a Three.js renderer, but it was a static low-poly board. Tile selection tore down and recreated the entire scene; there was no camera control, hover information, legal target highlighting, planned route, or clear explanation of what a selected banner or supply post did. The match panel felt like a form alongside a decorative map. It was not ready to call a standout game presentation.

## Changes in v1.1

- Camera: drag to orbit, mouse wheel and on-screen zoom, reset, keyboard arrow/zoom keys. Mobile uses touch drag and explicit buttons. Camera angle persists between rounds.
- Planning: legal destinations pulse on the world; selecting a tile shows a clear marker and route from the current captain. A tile card names its terrain, ownership, objective value and available action/cost. Clicking a legal tile chooses Contest or Scout as appropriate. The order selector lists only legal destinations, while server validation remains authoritative.
- Visual world: layered hex island, atmospheric perimeter, lighting, shadow, forest clusters, ridges, banners, fortified homes, supply crystals, squad formations and subtle motion. The cosmetic moonlit palette and captain effects remain visual only.
- Smoothness: selections and hover update materials instead of rebuilding WebGL. Squads animate toward new positions. Reduced-motion setting cuts nonessential motion; WebGL failure shows a selectable text grid. Scene resources are disposed on round changes.
- Layout: larger framed world, in-world controls and field information, clearer order choice and cost feedback, mobile layout. Wallet code now loads only when it is needed. A fresh Linux `npm ci` also succeeds after removing stray lockfile entries.

## Still to check with a real browser

1. Compare landing and active match at 1440×900, 1024×768 and 390×844. Verify board fills the frame and the tile card never blocks the chosen objective.
2. Mouse and touch: rotate, zoom, inspect a hex, change order, commit, wait for movement. Check the mobile page can still scroll when the finger begins outside the canvas.
3. Browser GPU on integrated graphics and low-memory phones: check frame rate, WebGL context loss, resizing, tab background/restore, reduced motion.
4. Three-faction color distinction, ownership/target distinction, contrast, keyboard fallback, and the 37-tile text grid when WebGL is unavailable.
5. Real injected-wallet browser flow and transaction rejection/recovery on Robinhood testnet.

The automated checks cover code compilation, gameplay and payments; they do not prove visual quality or measured frame rate. Do not claim the experience is 10/10 from a source review alone. Have a player complete three matches and observe where they misread the map or lose time.
