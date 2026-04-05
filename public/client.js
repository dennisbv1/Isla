const API = "";

let currentUser = null;
let hooks = [];

function $(id){ return document.getElementById(id); }

async function api(path, method="GET", body=null){
  const opts = { method, headers: { "Content-Type":"application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch("/api" + path, opts);
  return res.json();
}

async function init(){
  // Capturar usuario desde Telegram
  const tg = window.Telegram.WebApp;
  const user = tg.initDataUnsafe?.user;

  let id, username;
  if (user) {
    id = String(user.id);
    username = user.username || (user.first_name + "_" + user.id);
  } else {
    // fallback si pruebas en navegador fuera de Telegram
    id = localStorage.getItem("isla_user_id") || "demo_" + Math.random().toString(36).slice(2,10);
    localStorage.setItem("isla_user_id", id);
    username = "jug_" + id.slice(-4);
  }

  const r = await api("/user/get-or-create", "POST", { id, username });
  currentUser = r.user;
  hooks = r.hooks;
  renderStatus();
  renderHooks();
  loadInventory();
  loadMarket();
}


function renderStatus(){
  $("coin").innerText = "Coin: " + (currentUser.coin || 0).toFixed(3);
  $("ton").innerText = "TON: " + (currentUser.ton || 0).toFixed(3);
  $("xp").innerText = "XP: " + (currentUser.xp || 0);
  $("level").innerText = "Nivel: " + (currentUser.level || 1);
}

function renderHooks(){
  const container = $("hooksList");
  container.innerHTML = "";
  hooks.forEach(h => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div>Anzuelo L${h.lvl} (${h.type}) - ${h.coin} Coin</div>
      <div><button onclick="buyHook(${h.lvl})">Comprar</button></div>`;
    container.appendChild(div);
  });
}

async function buyHook(lvl){
  const id = localStorage.getItem("isla_user_id");
  const res = await api("/store/buy-hook", "POST", { userId: id, level: lvl, payWith: "Coin" });
  if (res.error) return alert("Error: " + res.error);
  alert("Anzuelo comprado: " + res.itemId);
  loadInventory();
  refreshUser();
}

async function loadInventory(){
  $("inventoryList").innerHTML = "<div>Inventario cargando... (usa API real para listar)</div>";
}

async function loadMarket(){
  const r = await api("/market/listings");
  const container = $("marketList");
  container.innerHTML = "";
  if (!r.listings || r.listings.length === 0) {
    container.innerHTML = "<div>No hay ofertas</div>";
    return;
  }
  r.listings.forEach(l => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `<div>${l.item_type} ${l.item_subtype} - ${l.price} Coin<br><small>Vendedor: ${l.username || l.seller_id}</small></div>
      <div><button onclick="buyListing('${l.id}')">Comprar</button></div>`;
    container.appendChild(div);
  });
}

async function buyListing(listingId){
  const id = localStorage.getItem("isla_user_id");
  const res = await api("/market/buy", "POST", { buyerId: id, listingId });
  if (res.error) return alert("Error: " + res.error);
  alert("Compra OK. Recibido: " + JSON.stringify(res));
  refreshUser();
  loadMarket();
}

async function fish(){
  const id = localStorage.getItem("isla_user_id");
  const anzueloId = prompt("Pega el ID del anzuelo (usa compras previas) o escribe 'demo' para usar uno temporal");
  if (!anzueloId) return;
  if (anzueloId === "demo") {
    const buy = await api("/store/buy-hook", "POST", { userId: id, level: 1, payWith: "Coin" });
    if (buy.error) return alert("Error compra demo: " + buy.error);
    const fishRes = await api("/fish", "POST", { userId: id, anzueloId: buy.itemId });
    if (fishRes.error) return alert("Error pesca: " + fishRes.error);
    $("fishResult").innerText = `Has pescado: ${fishRes.fish.rarity} - sugerido ${fishRes.fish.suggestedSell} Coin`;
    refreshUser();
    loadMarket();
    return;
  }
  const fishRes = await api("/fish", "POST", { userId: id, anzueloId });
  if (fishRes.error) return alert("Error pesca: " + fishRes.error);
  $("fishResult").innerText = `Has pescado: ${fishRes.fish.rarity} - sugerido ${fishRes.fish.suggestedSell} Coin`;
  refreshUser();
  loadMarket();
}

async function openCoco(){
  const id = localStorage.getItem("isla_user_id");
  const res = await api("/coco/open", "POST", { userId: id });
  if (res.error) return alert("Error: " + res.error);
  $("cocoMsg").innerText = "Coco: " + JSON.stringify(res.reward);
  refreshUser();
}

async function refreshUser(){
  const id = localStorage.getItem("isla_user_id");
  const r = await api("/user/get-or-create", "POST", { id, username: "jug" });
  currentUser = r.user;
  renderStatus();
}

window.addEventListener("load", () => {
  init();
  $("btnFish").addEventListener("click", fish);
  $("openCoco").addEventListener("click", openCoco);
});
