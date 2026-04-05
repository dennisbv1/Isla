// client.js

// URL base de tu backend en Render
const API_BASE = "https://isla-12ho.onrender.com/api";

// Función genérica para llamar a la API
async function api(path, method = "GET", body = null) {
  const options = { method, headers: { "Content-Type": "application/json" } };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, options);
  return res.json();
}

// Inicializar Telegram WebApp
const tg = window.Telegram.WebApp;
tg.ready();

// Capturar usuario de Telegram
async function initUser() {
  const user = tg.initDataUnsafe?.user;
  if (!user) {
    console.log("No se encontró usuario de Telegram. Abre la miniapp desde tu bot, no desde el navegador.");
    return;
  }

  const id = String(user.id);
  const username = user.username || user.first_name;

  try {
    const r = await api("/user/get-or-create", "POST", { id, username });
    window.currentUser = r.user;
    console.log("Usuario inicializado:", window.currentUser);
    renderUser(window.currentUser);
  } catch (err) {
    console.error("Error inicializando usuario:", err);
  }
}

// Renderizar datos del usuario en la interfaz
function renderUser(user) {
  document.getElementById("username").textContent = user.username;
  document.getElementById("coins").textContent = user.coin;
  document.getElementById("ton").textContent = user.ton;
  document.getElementById("xp").textContent = user.xp;
  document.getElementById("level").textContent = user.level;
}

// Ejemplo de acción: recolectar coco
async function recolectarCoco() {
  const r = await api("/game/coco", "POST", { id: window.currentUser.id });
  window.currentUser = r.user;
  renderUser(window.currentUser);
}

// Llamar a initUser al cargar la página
initUser();
