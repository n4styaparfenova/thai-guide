(() => {
  "use strict";

  const CFG = window.APP_CONFIG;
  const tg = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData !== undefined
    ? window.Telegram.WebApp : null;
  const inTelegram = !!(tg && tg.platform && tg.platform !== "unknown");

  const CATEGORIES = [
    { id: "culture", name: "Культура и храмы", emoji: "🛕" },
    { id: "beach", name: "Пляжи", emoji: "🏖" },
    { id: "nature", name: "Природа", emoji: "🌿" },
    { id: "party", name: "Тусовки", emoji: "🎉" },
    { id: "kids", name: "С детьми", emoji: "👨‍👩‍👧" },
    { id: "food", name: "Еда и рынки", emoji: "🍜" },
    { id: "cafe", name: "Кафе и виды", emoji: "☕" },
    { id: "shopping", name: "Шопинг", emoji: "🛍" },
    { id: "spa", name: "Массаж и SPA", emoji: "💆" },
    { id: "active", name: "Активности", emoji: "🚤" },
  ];
  const TAGS = [
    { id: "free", name: "Бесплатно", emoji: "🆓" },
    { id: "rain", name: "Можно в дождь", emoji: "🌧" },
    { id: "kids", name: "С детьми", emoji: "👶" },
    { id: "night", name: "Вечером", emoji: "🌙" },
    { id: "sunset", name: "Закат и виды", emoji: "🌅" },
    { id: "romantic", name: "Романтично", emoji: "💑" },
  ];
  const catById = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

  const state = {
    cities: [],
    places: [],
    useful: [],
    favorites: new Set(),
    filters: {}, // city -> { cat, tags:Set, view }
    userPos: null,
  };

  const $app = document.getElementById("app");
  let map = null;

  // ---------- Утилиты ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const priceSigns = (lvl) => "฿".repeat(lvl || 1);
  const cityById = (id) => state.cities.find((c) => c.id === id);
  const placeById = (id) => state.places.find((p) => p.id === id);
  const placesIn = (cityId) => state.places.filter((p) => p.city === cityId);
  const firstPhoto = (p) => (p.photos && p.photos[0] && p.photos[0].url) || "";

  function haptic(type = "light") {
    try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(type); } catch (_) {}
  }

  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast.t);
    toast.t = setTimeout(() => el.classList.remove("show"), 1800);
  }

  function openExternal(url) {
    if (!url) return;
    if (tg && tg.openLink) tg.openLink(url);
    else window.open(url, "_blank", "noopener");
  }

  function distanceKm(a, b) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} м` : `${km < 10 ? km.toFixed(1) : Math.round(km)} км`);

  // ---------- Избранное: облако Telegram или localStorage ----------
  const FAV_KEY = "favorites";
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") ? tg.CloudStorage : null;

  function loadFavorites() {
    return new Promise((resolve) => {
      const apply = (raw) => {
        try { state.favorites = new Set(JSON.parse(raw || "[]")); } catch (_) {}
        resolve();
      };
      if (cloud) cloud.getItem(FAV_KEY, (err, val) => apply(err ? null : val));
      else { try { apply(localStorage.getItem(FAV_KEY)); } catch (_) { resolve(); } }
    });
  }

  function saveFavorites() {
    const raw = JSON.stringify([...state.favorites]);
    if (cloud) cloud.setItem(FAV_KEY, raw);
    else { try { localStorage.setItem(FAV_KEY, raw); } catch (_) {} }
  }

  function toggleFavorite(id) {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast("Убрано из избранного"); }
    else { state.favorites.add(id); toast("❤️ Сохранено в избранное"); }
    haptic("medium");
    saveFavorites();
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => (b.textContent = state.favorites.has(id) ? "❤️" : "🤍"));
  }

  // ---------- Геолокация ----------
  function locate() {
    return new Promise((resolve, reject) => {
      if (state.userPos) return resolve(state.userPos);
      const done = (lat, lng) => { state.userPos = { lat, lng }; resolve(state.userPos); };
      const lm = tg && tg.LocationManager;
      if (lm && tg.isVersionAtLeast("8.0")) {
        lm.init(() => {
          if (!lm.isLocationAvailable) return browserGeo();
          lm.getLocation((loc) => (loc ? done(loc.latitude, loc.longitude) : reject(new Error("denied"))));
        });
      } else browserGeo();
      function browserGeo() {
        if (!navigator.geolocation) return reject(new Error("unsupported"));
        navigator.geolocation.getCurrentPosition(
          (p) => done(p.coords.latitude, p.coords.longitude),
          reject,
          { enableHighAccuracy: false, timeout: 10000 }
        );
      }
    });
  }

  // ---------- Шаблоны ----------
  function imgTag(url, alt, cls = "") {
    return `<img class="${cls}" src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.classList.add('broken')">`;
  }

  function placeCard(p, { showCity = false, dist = null } = {}) {
    const cats = (p.categories || []).map((c) => catById[c] && catById[c].emoji).filter(Boolean).join(" ");
    const city = showCity && cityById(p.city) ? `${cityById(p.city).name} · ` : "";
    return `
      <article class="card" data-open="${esc(p.id)}" role="button" tabindex="0">
        <div class="media">
          ${imgTag(firstPhoto(p), p.name)}
          <div class="badges">
            ${p.hidden_gem ? `<span class="badge gem">💎 Секретное место</span>` : ""}
          </div>
          <button class="fav-btn" data-fav="${esc(p.id)}" aria-label="В избранное">${state.favorites.has(p.id) ? "❤️" : "🤍"}</button>
        </div>
        <div class="body">
          <div class="row1">
            <h3>${esc(p.name)}</h3>
            ${p.google_rating ? `<span class="rating"><span class="star">★</span> ${esc(p.google_rating)}</span>` : ""}
          </div>
          <div class="meta">${esc(city)}${esc(p.district || "")} · ${cats} · <span class="price">${priceSigns(p.price_level)}</span></div>
          <p class="short">${esc(p.short)}</p>
          ${dist != null ? `<div class="dist">📍 ${fmtKm(dist)} от вас</div>` : ""}
        </div>
      </article>`;
  }

  // ---------- Экраны ----------
  function screenHome() {
    const cities = state.cities.map((c) => `
      <button class="city-card" data-go="#/city/${esc(c.id)}">
        ${c.photo ? imgTag(c.photo.url, c.name) : ""}
        <span class="n">${placesIn(c.id).length} ${plural(placesIn(c.id).length, "место", "места", "мест")}</span>
        <span class="label">
          <div class="name">${esc(c.name)}</div>
          <div class="tagline">${esc(c.tagline || "")}</div>
        </span>
      </button>`).join("");

    return `
      <section class="screen">
        <header class="home-hero">
          <div class="kicker">🇹🇭 ТАИЛАНД: СВОИ МЕСТА</div>
          <div class="hello">
            <div class="avatar">${CFG.authorPhoto ? imgTag(CFG.authorPhoto, CFG.authorName) : esc(CFG.authorName.slice(0, 1))}</div>
            <h1>Привет, я ${esc(CFG.authorName)} 👋</h1>
          </div>
          ${CFG.intro.map((t) => `<p>${esc(t)}</p>`).join("")}
        </header>
        <div class="quick">
          <button data-action="random"><span class="ico">🎲</span>Удиви меня</button>
          <button data-go="#/near"><span class="ico">📍</span>Рядом со мной</button>
          <button data-go="#/favorites"><span class="ico">❤️</span>Избранное${state.favorites.size ? ` <span class="count">${state.favorites.size}</span>` : ""}</button>
        </div>
        ${state.useful.length ? `
        <button class="useful-banner" data-go="#/useful">
          <span class="ico">🧳</span>
          <span><b>Полезное в Таиланде</b><small>Сим-карты, такси, еда, деньги, въезд</small></span>
          <span class="arrow">›</span>
        </button>` : ""}
        <h2 class="section-title">Куда едем?</h2>
        <div class="city-grid">${cities}</div>
      </section>`;
  }

  function cityFilters(cityId) {
    if (!state.filters[cityId]) state.filters[cityId] = { cat: "all", tags: new Set(), view: "list" };
    return state.filters[cityId];
  }

  function filteredPlaces(cityId) {
    const f = cityFilters(cityId);
    return placesIn(cityId).filter((p) => {
      if (f.cat === "gem" && !p.hidden_gem) return false;
      if (f.cat !== "all" && f.cat !== "gem" && !(p.categories || []).includes(f.cat)) return false;
      for (const t of f.tags) if (!(p.tags || []).includes(t)) return false;
      return true;
    });
  }

  function screenCity(cityId) {
    const city = cityById(cityId);
    if (!city) return screenNotFound();
    const f = cityFilters(cityId);
    const all = placesIn(cityId);
    // Показываем только категории и теги, которые реально есть в городе — чтобы фильтр никогда не вёл в пустоту
    const cats = CATEGORIES.filter((c) => all.some((p) => (p.categories || []).includes(c.id)));
    const tags = TAGS.filter((t) => all.some((p) => (p.tags || []).includes(t.id)));
    const hasGems = all.some((p) => p.hidden_gem);
    const list = filteredPlaces(cityId);

    const catChips = [
      `<button class="chip ${f.cat === "all" ? "on" : ""}" data-cat="all">Все</button>`,
      ...cats.map((c) => `<button class="chip ${f.cat === c.id ? "on" : ""}" data-cat="${c.id}">${c.emoji} ${esc(c.name)}</button>`),
      hasGems ? `<button class="chip ${f.cat === "gem" ? "on" : ""}" data-cat="gem">💎 Секретные</button>` : "",
    ].join("");
    const tagChips = tags.map((t) => `<button class="chip small tag ${f.tags.has(t.id) ? "on" : ""}" data-tag="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join("");

    const content = list.length
      ? (f.view === "map" ? `<div id="map" class="map"></div>` : `<div class="list">${list.map((p) => placeCard(p)).join("")}</div>`)
      : `<div class="empty"><div class="big">🔍</div><b>Ничего не нашлось</b>Попробуйте убрать часть фильтров<br><button class="chip on" data-action="reset">Сбросить фильтры</button></div>`;

    return `
      <section class="screen">
        <button class="back-fab" data-action="back" aria-label="Назад">‹</button>
        <div class="city-hero">
          ${city.photo ? imgTag(city.photo.url, city.name) : ""}
          <div class="label"><h1>${esc(city.name)}</h1><p>${esc(city.tagline || "")}</p></div>
        </div>
        <div class="sticky-bar">
          <div class="chips">${catChips}</div>
          ${tagChips ? `<div class="chips">${tagChips}</div>` : ""}
        </div>
        <div class="toolbar">
          <span class="found">${list.length} ${plural(list.length, "место", "места", "мест")}</span>
          <div class="seg">
            <button class="${f.view === "list" ? "on" : ""}" data-view="list">Список</button>
            <button class="${f.view === "map" ? "on" : ""}" data-view="map">Карта</button>
          </div>
        </div>
        ${content}
      </section>`;
  }

  function screenPlace(id) {
    const p = placeById(id);
    if (!p) return screenNotFound();
    const city = cityById(p.city);
    const photos = (p.photos || []).filter((x) => x.url);
    const slides = photos.map((ph) => `<div class="slide">${imgTag(ph.url, p.name)}</div>`).join("");
    const dots = photos.length > 1 ? `<div class="dots">${photos.map((_, i) => `<i class="${i === 0 ? "on" : ""}"></i>`).join("")}</div>` : "";
    const cats = (p.categories || []).map((c) => catById[c]).filter(Boolean)
      .map((c) => `<span class="pill">${c.emoji} ${esc(c.name)}</span>`).join("");

    // Пустые поля не выводим вовсе
    const facts = [
      ["💰", "Стоимость", p.price_text],
      ["🕒", "Часы работы", p.hours],
      ["⏱", "Сколько заложить", p.duration],
      ["🌤", "Лучшее время", p.best_time],
      ["🚕", "Как добраться", p.how_to_get],
    ].filter(([, , v]) => v);
    const factsHtml = facts.map(([i, k, v]) => `<div class="fact"><span class="i">${i}</span><div><div class="k">${k}</div><div class="v">${esc(v)}</div></div></div>`).join("")
      + (p.nuances ? `<div class="fact warn"><span class="i">⚠️</span><div><div class="k">Важно знать</div><div class="v">${esc(p.nuances)}</div></div></div>` : "");

    const links = [
      p.instagram ? `<button data-link="${esc(p.instagram)}">📸 Instagram</button>` : "",
      p.website ? `<button data-link="${esc(p.website)}">🌐 Сайт</button>` : "",
    ].join("");

    const credits = photos.map((ph) => ph.credit).filter(Boolean);

    return `
      <section class="screen">
        <button class="back-fab" data-action="back" aria-label="Назад">‹</button>
        <div class="gallery">
          <div class="track">${slides}</div>
          ${dots}
          ${photos.length > 1 ? `<span class="counter">1 / ${photos.length}</span>` : ""}
        </div>
        <div class="detail">
          <h1>${esc(p.name)}</h1>
          <div class="en">${esc(p.name_en || "")}${city ? ` · ${esc(city.name)}, ${esc(p.district || "")}` : ""}</div>
          <div class="pills">
            ${p.hidden_gem ? `<span class="pill gem">💎 Секретное место</span>` : ""}
            ${p.google_rating ? `<span class="pill rate"><span class="star">★</span> ${esc(p.google_rating)} Google</span>` : ""}
            <span class="pill">${priceSigns(p.price_level)}</span>
            ${cats}
          </div>
          <p class="desc">${esc(p.description)}</p>
          ${p.tip ? `<div class="tip"><div class="t">💡 ${esc(CFG.tipTitle)}</div><p>${esc(p.tip)}</p></div>` : ""}
          <div class="facts">${factsHtml}</div>
          ${links ? `<div class="links">${links}</div>` : ""}
          ${credits.length ? `<div class="credits">Фото: ${credits.map(esc).join("; ")}</div>` : ""}
        </div>
        <div class="actions">
          <button class="btn-main" data-link="${esc(p.maps_url)}">📍 Построить маршрут</button>
          <button class="btn-ico" data-fav="${esc(p.id)}" aria-label="В избранное">${state.favorites.has(p.id) ? "❤️" : "🤍"}</button>
          <button class="btn-ico" data-share="${esc(p.id)}" aria-label="Поделиться">↗️</button>
        </div>
      </section>`;
  }

  function screenFavorites() {
    const list = state.places.filter((p) => state.favorites.has(p.id));
    return `
      <section class="screen">
        <button class="back-fab" data-action="back" aria-label="Назад">‹</button>
        <header class="page-head"><h1>❤️ Избранное</h1><p>Ваш список мест на поездку</p></header>
        ${list.length
          ? `<div class="list">${list.map((p) => placeCard(p, { showCity: true })).join("")}</div>`
          : `<div class="empty"><div class="big">🤍</div><b>Пока пусто</b>Нажимайте на сердечко в карточках — места соберутся здесь</div>`}
      </section>`;
  }

  function screenNear() {
    const head = `<button class="back-fab" data-action="back" aria-label="Назад">‹</button>
      <header class="page-head"><h1>📍 Рядом со мной</h1><p>Ближайшие места из путеводителя</p></header>`;
    if (!state.userPos) {
      locate().then(() => render()).catch(() => {
        $app.querySelector("#near-body").innerHTML = `<div class="empty"><div class="big">🧭</div><b>Не удалось определить местоположение</b>Разрешите доступ к геолокации и попробуйте ещё раз<br><button class="chip on" data-action="retry-geo">Попробовать снова</button></div>`;
      });
      return `<section class="screen">${head}<div id="near-body"><div class="skeleton"></div><div class="skeleton"></div></div></section>`;
    }
    const list = state.places
      .map((p) => ({ p, d: distanceKm(state.userPos, p) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 12);
    return `<section class="screen">${head}<div class="list">${list.map(({ p, d }) => placeCard(p, { showCity: true, dist: d })).join("")}</div></section>`;
  }

  function screenUseful() {
    const list = state.useful.map((s) => `
      <button class="useful-row" data-go="#/useful/${esc(s.id)}">
        <span class="ico">${esc(s.emoji)}</span>
        <span><b>${esc(s.title)}</b><small>${esc(s.short || "")}</small></span>
        <span class="arrow">›</span>
      </button>`).join("");
    return `
      <section class="screen">
        <button class="back-fab" data-action="back" aria-label="Назад">‹</button>
        <header class="page-head"><h1>🧳 Полезное</h1><p>Всё, что пригодится в первые дни в Таиланде</p></header>
        <div class="useful-list">${list}</div>
      </section>`;
  }

  function screenUsefulSection(id) {
    const s = state.useful.find((x) => x.id === id);
    if (!s) return screenNotFound();
    const items = (s.items || []).map((it) => `
      <div class="fact"><div><div class="k">${esc(it.title)}</div><div class="v">${esc(it.text)}</div></div></div>`).join("");
    const apps = (s.apps || []).map((a) => `
      <button class="app-chip" ${a.url ? `data-link="${esc(a.url)}"` : ""}><b>${esc(a.name)}</b><small>${esc(a.what || "")}</small></button>`).join("");
    return `
      <section class="screen">
        <button class="back-fab" data-action="back" aria-label="Назад">‹</button>
        <header class="page-head"><h1>${esc(s.emoji)} ${esc(s.title)}</h1>${s.short ? `<p>${esc(s.short)}</p>` : ""}</header>
        <div class="wrap">
          ${s.tip ? `<div class="tip"><div class="t">💡 ${esc(CFG.tipTitle)}</div><p>${esc(s.tip)}</p></div>` : ""}
          ${apps ? `<h2 class="section-title flush">Приложения</h2><div class="apps">${apps}</div>` : ""}
          <div class="facts plain">${items}</div>
        </div>
      </section>`;
  }

  function screenNotFound() {
    return `<section class="screen"><div class="empty"><div class="big">🧭</div><b>Страница не найдена</b><button class="chip on" data-go="#/">На главную</button></div></section>`;
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // ---------- Карта ----------
  function mountMap(cityId) {
    const el = document.getElementById("map");
    if (!el || !window.L) return;
    const list = filteredPlaces(cityId);
    map = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    const bounds = [];
    list.forEach((p) => {
      if (typeof p.lat !== "number") return;
      const emoji = (catById[(p.categories || [])[0]] || {}).emoji || "📍";
      const icon = L.divIcon({ className: "", html: `<div class="pin ${p.hidden_gem ? "gem" : ""}"><span>${emoji}</span></div>`, iconSize: [34, 34], iconAnchor: [17, 34], popupAnchor: [0, -30] });
      L.marker([p.lat, p.lng], { icon }).addTo(map)
        .bindPopup(`<div class="popup"><b>${esc(p.name)}</b>${esc(p.short)}<br><button data-open="${esc(p.id)}">Открыть карточку →</button></div>`);
      bounds.push([p.lat, p.lng]);
    });
    if (bounds.length === 1) map.setView(bounds[0], 13);
    else if (bounds.length) map.fitBounds(bounds, { padding: [40, 40] });
  }

  // ---------- Галерея ----------
  function mountGallery() {
    const track = document.querySelector(".gallery .track");
    if (!track) return;
    const dots = document.querySelectorAll(".gallery .dots i");
    const counter = document.querySelector(".gallery .counter");
    track.addEventListener("scroll", () => {
      const i = Math.round(track.scrollLeft / track.clientWidth);
      dots.forEach((d, k) => d.classList.toggle("on", k === i));
      if (counter) counter.textContent = `${i + 1} / ${dots.length}`;
    }, { passive: true });
  }

  // ---------- Поделиться ----------
  function share(id) {
    const p = placeById(id);
    if (!p) return;
    const text = `${p.name} — ${p.short}`;
    const link = CFG.appLink ? `${CFG.appLink}?startapp=place_${p.id}` : p.maps_url;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg && tg.openTelegramLink && inTelegram) tg.openTelegramLink(url);
    else if (navigator.share) navigator.share({ title: p.name, text, url: link }).catch(() => {});
    else openExternal(url);
  }

  // ---------- Роутер ----------
  function route() {
    const parts = (location.hash || "#/").slice(2).split("/");
    return { name: parts[0] || "home", id: parts[1] };
  }

  function render() {
    if (map) { map.remove(); map = null; }
    const r = route();
    let html;
    if (r.name === "home") html = screenHome();
    else if (r.name === "city") html = screenCity(r.id);
    else if (r.name === "place") html = screenPlace(r.id);
    else if (r.name === "favorites") html = screenFavorites();
    else if (r.name === "near") html = screenNear();
    else if (r.name === "useful") html = r.id ? screenUsefulSection(r.id) : screenUseful();
    else html = screenNotFound();
    $app.innerHTML = html;

    if (r.name === "city" && cityFilters(r.id).view === "map") mountMap(r.id);
    if (r.name === "place") mountGallery();

    if (tg && tg.BackButton) {
      if (r.name === "home") tg.BackButton.hide(); else tg.BackButton.show();
    }
  }

  function go(hash) {
    haptic();
    if (location.hash === hash) render();
    else location.hash = hash;
  }

  function back() {
    if (history.length > 1 && route().name !== "home") history.back();
    else go("#/");
  }

  // ---------- События ----------
  $app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-fav],[data-share],[data-link],[data-open],[data-go],[data-cat],[data-tag],[data-view],[data-action]");
    if (!t) return;
    const d = t.dataset;
    if (d.fav) { e.stopPropagation(); return toggleFavorite(d.fav); }
    if (d.share) return share(d.share);
    if (d.link) return openExternal(d.link);
    if (d.open) return go(`#/place/${d.open}`);
    if (d.go) return go(d.go);

    const r = route();
    if (r.name === "city") {
      const f = cityFilters(r.id);
      if (d.cat) { f.cat = d.cat; haptic(); return renderKeepScroll(); }
      if (d.tag) { f.tags.has(d.tag) ? f.tags.delete(d.tag) : f.tags.add(d.tag); haptic(); return renderKeepScroll(); }
      if (d.view) { f.view = d.view; haptic(); return renderKeepScroll(); }
    }
    if (d.action === "reset" && r.name === "city") { state.filters[r.id] = null; return render(); }
    if (d.action === "back") return back();
    if (d.action === "retry-geo") return render();
    if (d.action === "random") {
      const p = state.places[Math.floor(Math.random() * state.places.length)];
      if (p) { haptic("medium"); go(`#/place/${p.id}`); }
    }
  });

  $app.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset && e.target.dataset.open) go(`#/place/${e.target.dataset.open}`);
  });

  // Перерисовка фильтров без прыжка страницы наверх
  function renderKeepScroll() {
    const y = window.scrollY;
    const chipsX = [...document.querySelectorAll(".chips")].map((c) => c.scrollLeft);
    render();
    window.scrollTo(0, y);
    document.querySelectorAll(".chips").forEach((c, i) => (c.scrollLeft = chipsX[i] || 0));
  }

  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  // ---------- Старт ----------
  function applyTheme() {
    const dark = tg && inTelegram ? tg.colorScheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (tg && inTelegram) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); } catch (_) {}
    }
  }

  async function init() {
    $app.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    if (tg) {
      tg.ready();
      tg.expand();
      if (inTelegram) document.documentElement.classList.add("tg");
      tg.BackButton && tg.BackButton.onClick(back);
      tg.onEvent && tg.onEvent("themeChanged", applyTheme);
    }
    applyTheme();

    try {
      const [cities, places] = await Promise.all([
        fetch(CFG.citiesUrl, { cache: "no-cache", headers: { "ngrok-skip-browser-warning": "1" } }).then((r) => r.json()),
        fetch(CFG.placesUrl, { cache: "no-cache", headers: { "ngrok-skip-browser-warning": "1" } }).then((r) => r.json()),
        loadFavorites(),
      ]);
      state.cities = cities;
      state.places = places;
      // «Полезное» необязательно: если файла нет, раздел просто не показывается
      state.useful = await fetch(CFG.usefulUrl, { cache: "no-cache", headers: { "ngrok-skip-browser-warning": "1" } }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
    } catch (err) {
      $app.innerHTML = `<div class="empty"><div class="big">⚠️</div><b>Не удалось загрузить данные</b>Проверьте интернет и откройте приложение снова</div>`;
      return;
    }

    // Ссылка вида t.me/бот/приложение?startapp=place_<id> открывает сразу карточку места
    const start = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (start && start.startsWith("place_") && placeById(start.slice(6))) location.hash = `#/place/${start.slice(6)}`;
    else if (start && start.startsWith("city_") && cityById(start.slice(5))) location.hash = `#/city/${start.slice(5)}`;

    render();
  }

  init();
})();
