require("dotenv").config();
const express = require("express");
const bodyParser = require("body-parser");
const sqlite3 = require("sqlite3").verbose();
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

const DB_FILE = process.env.DB_FILE || path.join(__dirname, "db.sqlite3");
const MIGRATION = fs.readFileSync(path.join(__dirname, "migrations", "init.sql"), "utf8");

const db = new sqlite3.Database(DB_FILE);
db.exec(MIGRATION);

const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

const limiter = rateLimit({ windowMs: 1000, max: 10 });
app.use(limiter);

const GAME = {
  conversionTONtoCoin: 1.5,
  marketCommissionPct: 0.05,
  commissionBurnPct: 0.60,
  commissionFundPct: 0.40,
  energyMax: 100,
  energyPerFish: 5,
  cooldownCocoSec: 24 * 3600
};

const HOOKS = [
  { lvl:1, coin:0.003, ton:0.002, type:"comun", sell:0.004, sellProfit:0.001, eatXP:4, eatCoin:0.003, cooldown:10 },
  { lvl:2, coin:0.03, ton:0.02, type:"comun+", sell:0.04, sellProfit:0.01, eatXP:10, eatCoin:0.03, cooldown:15 },
  { lvl:3, coin:0.09, ton:0.06, type:"poco raro", sell:0.117, sellProfit:0.027, eatXP:25, eatCoin:0.06, cooldown:30 },
  { lvl:4, coin:0.27, ton:0.18, type:"raro", sell:0.343, sellProfit:0.073, eatXP:60, eatCoin:0.18, cooldown:45 },
  { lvl:5, coin:0.81, ton:0.54, type:"raro+", sell:1.005, sellProfit:0.195, eatXP:150, eatCoin:0.405, cooldown:60 },
  { lvl:6, coin:2.43, ton:1.62, type:"epico", sell:2.943, sellProfit:0.513, eatXP:380, eatCoin:1.215, cooldown:120 },
  { lvl:7, coin:7.29, ton:4.86, type:"epico+", sell:8.599, sellProfit:1.309, eatXP:900, eatCoin:3.645, cooldown:180 },
  { lvl:8, coin:21.87, ton:14.58, type:"legendario menor", sell:25.151, sellProfit:3.281, eatXP:2200, eatCoin:10.935, cooldown:300 },
  { lvl:9, coin:65.61, ton:43.74, type:"legendario", sell:73.444, sellProfit:7.834, eatXP:5400, eatCoin:32.805, cooldown:600 },
  { lvl:10, coin:196.83, ton:131.22, type:"artefacto", sell:216.513, sellProfit:19.683, eatXP:13000, eatCoin:98.415, cooldown:900 },
  { lvl:11, coin:590.49, ton:393.66, type:"mitico", sell:637.733, sellProfit:47.243, eatXP:32000, eatCoin:295.245, cooldown:1200 }
];

const getUser = (id) => db.prepare("SELECT * FROM users WHERE id = ?").get(id);
const createUser = (id, username) => {
  const stmt = db.prepare("INSERT INTO users (id, username, coin, ton, xp, level, energy, last_coco) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
  stmt.run(id, username || ("u_"+id.slice(0,6)), 1.0, 0, 0, 1, GAME.energyMax, 0);
  return getUser(id);
};

const initParam = (k, v) => {
  const p = db.prepare("SELECT value FROM game_params WHERE key = ?").get(k);
  if (!p) db.prepare("INSERT INTO game_params (key, value) VALUES (?, ?)").run(k, String(v));
};
initParam("fund_balance", "0");
initParam("total_burned", "0");

app.get("/api/ping", (req, res) => res.json({ ok: true }));

app.post("/api/user/get-or-create", (req, res) => {
  const { id, username } = req.body;
  if (!id) return res.status(400).json({ error: "id required" });
  let user = getUser(id);
  if (!user) user = createUser(id, username);
  res.json({ user, hooks: HOOKS, game: GAME });
});

app.get("/api/store/hooks", (req, res) => {
  res.json({ hooks: HOOKS });
});

app.post("/api/store/buy-hook", (req, res) => {
  const { userId, level, payWith } = req.body;
  if (!userId || !level) return res.status(400).json({ error: "userId and level required" });
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: "user not found" });
  const hook = HOOKS.find(h => h.lvl === Number(level));
  if (!hook) return res.status(400).json({ error: "invalid level" });

  if (payWith === "TON") {
    const costTON = hook.ton;
    if (user.ton < costTON) return res.status(400).json({ error: "insufficient TON" });
    db.prepare("UPDATE users SET ton = ton - ? WHERE id = ?").run(costTON, userId);
  } else {
    const cost = hook.coin;
    if (user.coin < cost) return res.status(400).json({ error: "insufficient Coin" });
    db.prepare("UPDATE users SET coin = coin - ? WHERE id = ?").run(cost, userId);
  }

  const itemId = uuidv4();
  db.prepare("INSERT INTO inventory (id, user_id, item_type, item_subtype, quantity, meta) VALUES (?, ?, ?, ?, ?, ?)")
    .run(itemId, userId, "anzuelo", `lvl${hook.lvl}`, 1, JSON.stringify({ lvl: hook.lvl }));
  res.json({ ok: true, itemId });
});

app.post("/api/fish", (req, res) => {
  const { userId, anzueloId } = req.body;
  if (!userId || !anzueloId) return res.status(400).json({ error: "userId and anzueloId required" });
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: "user not found" });

  if (user.energy < GAME.energyPerFish) return res.status(400).json({ error: "insufficient energy" });

  const an = db.prepare("SELECT * FROM inventory WHERE id = ? AND user_id = ? AND item_type = ?").get(anzueloId, userId, "anzuelo");
  if (!an) return res.status(400).json({ error: "anzuelo not found" });
  const meta = JSON.parse(an.meta || "{}");
  const hook = HOOKS.find(h => h.lvl === Number(meta.lvl));
  if (!hook) return res.status(400).json({ error: "invalid anzuelo meta" });

  db.prepare("UPDATE users SET energy = energy - ? WHERE id = ?").run(GAME.energyPerFish, userId);

  if (an.quantity > 1) {
    db.prepare("UPDATE inventory SET quantity = quantity - 1 WHERE id = ?").run(anzueloId);
  } else {
    db.prepare("DELETE FROM inventory WHERE id = ?").run(anzueloId);
  }

  const roll = Math.random();
  let fishRarity = "common";
  if (hook.lvl <= 2) {
    fishRarity = roll < 0.9 ? "common" : "uncommon";
  } else if (hook.lvl <= 4) {
    fishRarity = roll < 0.7 ? "common" : (roll < 0.95 ? "uncommon" : "rare");
  } else if (hook.lvl <= 7) {
    fishRarity = roll < 0.5 ? "uncommon" : (roll < 0.85 ? "rare" : "epic");
  } else {
    fishRarity = roll < 0.4 ? "rare" : (roll < 0.85 ? "epic" : "legendary");
  }

  const fishId = uuidv4();
  const fishName = `${hook.type} fish lvl${hook.lvl}`;
  db.prepare("INSERT INTO inventory (id, user_id, item_type, item_subtype, quantity, meta) VALUES (?, ?, ?, ?, ?, ?)")
    .run(fishId, userId, "pez", fishRarity, 1, JSON.stringify({ hookLvl: hook.lvl, sellSuggested: hook.sell, eatXP: hook.eatXP, eatCoin: hook.eatCoin }));

  res.json({ ok: true, fish: { id: fishId, name: fishName, rarity: fishRarity, suggestedSell: hook.sell, eatXP: hook.eatXP, eatCoin: hook.eatCoin } });
});

app.post("/api/eat", (req, res) => {
  const { userId, itemId } = req.body;
  if (!userId || !itemId) return res.status(400).json({ error: "userId and itemId required" });
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: "user not found" });

  const item = db.prepare("SELECT * FROM inventory WHERE id = ? AND user_id = ? AND item_type = ?").get(itemId, userId, "pez");
  if (!item) return res.status(400).json({ error: "pez not found" });
  const meta = JSON.parse(item.meta || "{}");

  const xpGain = meta.eatXP || 1;
  const coinGain = meta.eatCoin || 0;
  db.prepare("UPDATE users SET xp = xp + ?, coin = coin + ? WHERE id = ?").run(xpGain, coinGain, userId);

  db.prepare("DELETE FROM inventory WHERE id = ?").run(itemId);

  const u = getUser(userId);
  const nextLevelXP = Math.floor(300 * Math.pow(1.12, Math.max(0, u.level - 1)));
  if (u.xp >= nextLevelXP) {
    db.prepare("UPDATE users SET level = level + 1 WHERE id = ?").run(userId);
  }

  res.json({ ok: true, xpGain, coinGain });
});

app.post("/api/market/list", (req, res) => {
  const { userId, itemId, price } = req.body;
  if (!userId || !itemId || !price) return res.status(400).json({ error: "userId, itemId, price required" });
  const item = db.prepare("SELECT * FROM inventory WHERE id = ? AND user_id = ?").get(itemId, userId);
  if (!item) return res.status(400).json({ error: "item not found" });

  const listingId = uuidv4();
  db.prepare("INSERT INTO market_listings (id, seller_id, item_id, item_type, item_subtype, price, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(listingId, userId, itemId, item.item_type, item.item_subtype, price, Date.now());
  res.json({ ok: true, listingId });
});

app.get("/api/market/listings", (req, res) => {
  const listings = db.prepare("SELECT m.*, u.username FROM market_listings m LEFT JOIN users u ON u.id = m.seller_id ORDER BY created_at DESC LIMIT 200").all();
  res.json({ listings });
});

app.post("/api/market/buy", (req, res) => {
  const { buyerId, listingId } = req.body;
  if (!buyerId || !listingId) return res.status(400).json({ error: "buyerId and listingId required" });
  const listing = db.prepare("SELECT * FROM market_listings WHERE id = ?").get(listingId);
  if (!listing) return res.status(404).json({ error: "listing not found" });
  const buyer = getUser(buyerId);
  if (!buyer) return res.status(404).json({ error: "buyer not found" });
  const seller = getUser(listing.seller_id);
  if (!seller) return res.status(404).json({ error: "seller not found" });

  const price = Number(listing.price);
  if (buyer.coin < price) return res.status(400).json({ error: "insufficient coin" });

  db.prepare("UPDATE users SET coin = coin - ? WHERE id = ?").run(price, buyerId);

  const commission = price * GAME.marketCommissionPct;
  const burn = commission * GAME.commissionBurnPct;
  const fund = commission * GAME.commissionFundPct;
  const sellerReceives = price - commission;

  db.prepare("UPDATE users SET coin = coin + ? WHERE id = ?").run(sellerReceives, seller.id);

  const prevFund = Number(db.prepare("SELECT value FROM game_params WHERE key = ?").get("fund_balance").value);
  db.prepare("UPDATE game_params SET value = ? WHERE key = ?").run(String(prevFund + fund), "fund_balance");
  const prevBurn = Number(db.prepare("SELECT value FROM game_params WHERE key = ?").get("total_burned").value);
  db.prepare("UPDATE game_params SET value = ? WHERE key = ?").run(String(prevBurn + burn), "total_burned");

  db.prepare("UPDATE inventory SET user_id = ? WHERE id = ?").run(buyerId, listing.item_id);
  db.prepare("DELETE FROM market_listings WHERE id = ?").run(listingId);

  db.prepare("INSERT INTO transactions (id, user_id, type, amount, created_at, meta) VALUES (?, ?, ?, ?, ?, ?)")
    .run(uuidv4(), buyerId, "market_buy", -price, Date.now(), JSON.stringify({ listingId }));

  res.json({ ok: true, sellerReceives, commission, burn, fund });
});

app.post("/api/coco/open", (req, res) => {
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const user = getUser(userId);
  if (!user) return res.status(404).json({ error: "user not found" });

  const now = Math.floor(Date.now() / 1000);
  if (now - user.last_coco < GAME.cooldownCocoSec) {
    return res.status(400).json({ error: "coco not ready" });
  }

  const roll = Math.random();
  let reward = { type: "coin", amount: 1 };
  if (roll < 0.60) {
    reward = { type: "coin", amount: +(Math.random() * 4 + 0.5).toFixed(3) };
  } else if (roll < 0.85) {
    reward = { type: "coin", amount: +(Math.random() * 15 + 5).toFixed(3) };
  } else if (roll < 0.95) {
    reward = { type: "xp", amount: Math.floor(Math.random() * 400 + 100) };
  } else if (roll < 0.99) {
    const hook = HOOKS[Math.floor(Math.random() * Math.min(6, HOOKS.length))];
    reward = { type: "anzuelo", lvl: hook.lvl };
  } else {
    const hook = HOOKS[HOOKS.length - 1];
    reward = { type: "anzuelo", lvl: hook.lvl };
  }

  if (reward.type === "coin") {
    db.prepare("UPDATE users SET coin = coin + ?, last_coco = ? WHERE id = ?").run(reward.amount, now, userId);
  } else if (reward.type === "xp") {
    db.prepare("UPDATE users SET xp = xp + ?, last_coco = ? WHERE id = ?").run(reward.amount, now, userId);
  } else if (reward.type === "anzuelo") {
    const itemId = uuidv4();
    db.prepare("INSERT INTO inventory (id, user_id, item_type, item_subtype, quantity, meta) VALUES (?, ?, ?, ?, ?, ?)")
      .run(itemId, userId, "anzuelo", `lvl${reward.lvl}`, 1, JSON.stringify({ lvl: reward.lvl }));
    db.prepare("UPDATE users SET last_coco = ? WHERE id = ?").run(now, userId);
    return res.json({ ok: true, reward: { type: "anzuelo", lvl: reward.lvl, itemId } });
  }

  res.json({ ok: true, reward });
});

app.get("/api/admin/stats", (req, res) => {
  const fund = db.prepare("SELECT value FROM game_params WHERE key = ?").get("fund_balance").value;
  const burned = db.prepare("SELECT value FROM game_params WHERE key = ?").get("total_burned").value;
  const totalCoin = db.prepare("SELECT SUM(coin) as total FROM users").get().total || 0;
  const totalListings = db.prepare("SELECT COUNT(*) as c FROM market_listings").get().c;
  res.json({ fund: Number(fund), burned: Number(burned), totalCoin: Number(totalCoin), totalListings });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
