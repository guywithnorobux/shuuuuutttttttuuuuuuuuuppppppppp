# Shuttlemon multiplayer

A walkable 3D moor with six towns, a campsite, trails and lookouts. Players who open the same
room see each other as coloured figures with name tags, and doors opened by one player open for all.

The server has no dependencies. It serves the game page and a WebSocket endpoint at `/ws`.
The world is generated in each browser from a fixed seed, so the server only relays who is
where and which doors are open.

## Deploy on Render

1. Put this folder in a new GitHub repository (the files in this folder at the top level).
2. In the Render dashboard choose **New > Blueprint**, pick the repository, and apply.
   Render reads `render.yaml` and creates a web service called `shuttlemon`.
   (Or choose **New > Web Service** and set Build Command `npm install`, Start Command `npm start`,
   Health Check Path `/health`.)
3. When the deploy is live, open `https://YOUR-SERVICE.onrender.com`.

WebSockets work on Render with no extra settings, and the page switches to `wss://` on its own over HTTPS.

## Rooms

- `https://YOUR-SERVICE.onrender.com/` joins the room `public`.
- Add `?room=friends` (letters, digits, `-`, `_`, up to 24 characters) to play in a private room.
  Anyone with that exact link joins the same room. Rooms are created on demand and removed when empty.
- Each room holds 16 players. A 17th player gets "Room full" and plays solo.

## Things to know

- The free plan puts the service to sleep after about 15 minutes with no traffic. The first visit
  after that takes up to a minute to wake it, and the page keeps retrying the connection while it does.
- Rooms live in memory. Restarting or redeploying the service clears them, including open doors.
- Changing the world code (terrain, towns, houses) changes what every player sees, so redeploy for everyone at once.
  Players on an old cached page should reload.

## Run locally

```
node server.js
```

Then open http://localhost:3000 in two browser windows. Settings (optional environment variables):
`PORT` (default 3000), `MAX_PLAYERS` (default 16), `MAX_ROOMS` (default 200).

## Creature battles

Wild creatures roam the world: walk up and press F to battle. Press C for your creature card, where you can switch between any of the 19 partner lines. Progress is saved in each player's own browser (localStorage), so battles do not need the server.

## Types and Poké Balls

Damage follows the official type chart (press J for a guide to weaknesses and resistances). Wild creatures that roam the moor can be fought for wins but not caught. To catch one: forage ingredients in the woods around Ember Camp (walk onto them; 3 make a stew), stand at the camp fire and press F to cook, then beat the creatures the stew draws to the camp. Each catch uses one Poké Ball (you start with 3; more lie inside houses) and unlocks their line as a partner. Everything is saved per player in the browser.

## Accounts

Players must create an account or sign in before they can play, and progress (creature levels, wins, caught partners, Poké Balls, foraged ingredients) is saved to the account after every change and loaded on sign-in, on any device. The in-game name is the account name.

- Accounts and saves are stored in `DATA_DIR/accounts.json` (default `./data`). Passwords are hashed with scrypt and a per-user salt; session tokens are random and only their hash is stored. Sign-in attempts are rate limited per IP.
- **Persistence on Render:** a free web service has an ephemeral disk, so `accounts.json` is lost whenever the service restarts, redeploys or spins down. To keep accounts, use a paid plan, add a disk (see the commented `disk:` block in `render.yaml`) and keep `DATA_DIR=/var/data`.
- The HTTP API is `POST /api/register`, `POST /api/login`, `GET /api/me`, `PUT /api/save`, `POST /api/logout`. There is no password reset: back up `accounts.json` if you need to recover accounts.
- If the page is opened without this server (for example the standalone `index.html`), accounts are kept in that browser only.

## Battle animations

Every move has its own canvas animation (flames, bolts, rock falls, tornadoes, claw slashes, drains, auras and so on), generated in the browser with no assets. Wild creature levels are weighted towards the low end (28% Lv1 down to 1% Lv9).

## Starter

A new player (an account with no progress) must choose one of the 19 evolution lines as their starter before anything else; only that line is owned at first and the rest are caught with the Ember Camp stew. Saves from before this feature keep their original two lines and skip the choice.

## Shops and coins

Every town has a shop stall with a gold coin sign (shown as a gold dot on the map). Walk up and press F.

- **Coins** are saved with the account. New players start with 20.
- **Sell ingredients:** Glowcap 4, Emberberry 4, Moss Hyssop 3, Stone Truffle 5.
- **Sell creatures:** 30 coins plus 20 per level above 1 (Lv1 30 ... Lv9 190). The creature leaves your team and its level resets; the last partner cannot be sold.
- **Buy:** Poké Ball 20 (5 for 90), rice 15 (5 for 70), camp upgrade kit 200 (one time).
- **Rice stew:** with the kit, cooking at the camp fire uses one rice automatically and the stew draws 6 creatures over 240 s instead of 3 over 170 s.

## Quests and villagers

Every village has three quest-giving villagers (a Camp Cook, a Village Warden, a Traveling Trader or a Trail Scout; the warden is always there). Walk up and press **F** to talk. Each villager runs a chain of six tasks ("cook a stew", "win 3 battles", "defeat a Fire-type", "sell 10 ingredients", "catch a creature" and so on) and then keeps offering repeatable work. Rewards are coins, Poké Balls and rice. A marker over each villager shows whether they have a new task (gold), are waiting on you (grey) or you can claim a reward (green). Active quests show under your creature chip, and progress is saved with your account. Talk to any villager and use **Clear all quests** to drop your active quests (finished ones stay finished).

## XP drinks

Village shops sell **XP Drinks** (50 coins, +2 wins) and **Super XP Drinks** (140 coins, +6 wins). Open your creature card (C) and drink one to add wins to the current partner's battles-won counter. Enough wins level the partner up, with evolutions and new moves, exactly like winning battles. Drinks do not count toward the Mega Stone, which needs real battle wins.

The admin console (signed in as the admin account, press the backquote key) can hand them out with `give xpdrink <n>` and `give superdrink <n>`. `give everything` also grants 99 of each. `super pokemon` unlocks every creature line at Lv 100.

## Mega Evolution

Win 25 battles to earn the Mega Stone. In battle a partner of Lv 5 or higher can Mega Evolve once per fight. The Mega form gets its own painting (final forms with a Mega sheet), and its moves gain **+10 damage per level** instead of the normal +5. Metadrake uses the Mega Ferrosteam sheet. Voidsoar-style middle stages and Aetherwing keep their normal art with the Mega glow.


## 3D creature models
Every wild creature in the world has its own detailed 3D model (all 56 forms, 19 lines), built in code with no image files: fur and feather layers, toes and claws, fangs, brows, wing bones and membranes, scale rows and body bands. A creature shows the form its level gives it (Lv 1-2 first form, Lv 3-4 second, Lv 5+ third). Models are built when you are within about 80 metres and swap to a simple blob beyond that. Wings flap, tails sway and floaters bob.

## three.js

The game needs three.js r128. The server serves it at `/three.min.js` itself, so nothing is loaded from a CDN when it is available:

- `npm install` (Render's build step does this) installs the pinned `three@0.128.0` package, and the server serves `node_modules/three/build/three.min.js`.
- Or commit your own copy to `public/three.min.js` and the server will prefer that. The file is at https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js

If the local file is missing the page falls back to cdnjs, jsDelivr and unpkg in turn. If you still see "requires WebGL and the three.js library", check the message under it: it says whether the library failed to download or WebGL could not start (turn on hardware acceleration in your browser).

## Chopping minigame (stew quality)

Pressing F at the Ember Camp pot with enough ingredients opens a knife minigame: one cut per ingredient. A knife sweeps across a bar and you stop it (Space, Enter, F, the Cut! button or a tap on the bar) on the green mark. The closer to the middle, the better the cut, and the knife gets faster with each cut. Escape cancels without spending anything. The ingredients are only used up once you start cooking.

The average accuracy sets the stew quality:

| Stew | Accuracy | Extra creatures | Arrive faster | Scent of your ingredients |
|---|---|---|---|---|
| Rough | under 30% | +0 | no | none |
| Good | 30% and up | +1 | 15% | a little stronger |
| Great | 60% and up | +2 | 30% | stronger |
| Perfect | 85% and up | +3 | 45% | much stronger |

A plain stew draws 3 creatures and a rice stew draws 6, before the bonus. "Scent" means creatures whose types match the ingredients you used are more likely to turn up.


## Admin movement panel (speed and flight)

Logged in as `aura_farming_sam`, press `\` (or the **Fly/Speed** button) to open the Movement panel: a speed slider (1x to 20x, presets 1/2/4/8/16) and a Flight toggle. Flight: Space rises, X sinks, and W/S also climb or dive where you look. Console commands: `speed <1-20>`, `fly [on|off]`, `move`. Like the console, this is a client-side gate only.
