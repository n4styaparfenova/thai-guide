(() => {
  "use strict";

  const CFG = window.APP_CONFIG;
  const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
  const inTelegram = !!(tg && tg.platform && tg.platform !== "unknown");

  const CATEGORIES = {
    culture: { name: "Достопримечательности", emoji: "🛕" },
    beach: { name: "Пляжи", emoji: "🏝" },
    nature: { name: "Природа", emoji: "🌿" },
    park: { name: "Парки", emoji: "🌳" },
    cafe: { name: "Кофейни", emoji: "☕" },
    sweets: { name: "Сладкое", emoji: "🍰" },
    art: { name: "Арт", emoji: "🎨" },
    events: { name: "События", emoji: "🎟" },
    view: { name: "Виды сверху", emoji: "🏙" },
    restaurant: { name: "Рестораны", emoji: "🍽" },
    bar: { name: "Бары и руфтопы", emoji: "🍸" },
    food: { name: "Еда и рынки", emoji: "🍜" },
    daytrip: { name: "На день из города", emoji: "🚗" },
    shopping: { name: "Шопинг", emoji: "🛍" },
    party: { name: "Вечеринки", emoji: "🎉" },
    kids: { name: "С детьми", emoji: "👨‍👩‍👧" },
    spa: { name: "Массаж", emoji: "💆" },
    active: { name: "Активности", emoji: "🚤" },
  };
  const TAGS = [
    { id: "instagram", name: "инстаграмно", emoji: "📸" },
    { id: "laptop", name: "можно поработать", emoji: "💻" },
    { id: "free", name: "бесплатно", emoji: "🆓" },
    { id: "sunset", name: "закат", emoji: "🌅" },
    { id: "rain", name: "в дождь", emoji: "🌧" },
    { id: "night", name: "вечером", emoji: "🌙" },
    { id: "kids", name: "с детьми", emoji: "👶" },
    { id: "romantic", name: "на свидание", emoji: "🥂" },
  ];
  // Темы на главной: «что я люблю». Показываются только те, где есть места.
  const THEMES = [
    { id: "cafe", name: "Кофейни", emoji: "☕", cats: ["cafe"], c: "#e0531f" },
    { id: "eat", name: "Где поесть", emoji: "🍽", cats: ["restaurant", "food"], c: "#7a3b2e" },
    { id: "bar", name: "Бары и руфтопы", emoji: "🍸", cats: ["bar", "party"], c: "#1f1d1b" },
    { id: "art", name: "Арт и события", emoji: "🎨", cats: ["art", "events"], c: "#3a4a6b" },
    { id: "park", name: "Парки и природа", emoji: "🌳", cats: ["park", "nature"], c: "#2f5d50" },
    { id: "sweets", name: "Сладкое", emoji: "🍰", cats: ["sweets"], c: "#d8c7a6", t: "#161514" },
    { id: "shopping", name: "Шопинг", emoji: "🛍", cats: ["shopping"], c: "#8a7a62" },
    { id: "beach", name: "Пляжи и острова", emoji: "🏝", cats: ["beach"], c: "#2c6e8f" },
    { id: "daytrip", name: "На день из Бангкока", emoji: "🚗", cats: ["daytrip"], c: "#5b6b3a" },
    { id: "classic", name: "Достопримечательности", emoji: "🛕", cats: ["culture"], c: "#4a4440" },
  ];
  const STAMP_COLORS = {
    "мой фаворит": "#e0531f", "must see": "#3a4a6b", "для души": "#2f5d50",
    "на закат": "#b5651d", "для работы": "#161514", "сладкое": "#8a5a44",
  };
  const CITY_META = {
    bangkok: { code: "BKK", coords: "13.75°N 100.50°E" },
    pattaya: { code: "PTY", coords: "12.93°N 100.88°E" },
    phuket: { code: "HKT", coords: "7.88°N 98.39°E" },
    rayong: { code: "RYG", coords: "12.68°N 101.28°E" },
    chiangmai: { code: "CNX", coords: "18.79°N 98.98°E" },
    chiangrai: { code: "CEI", coords: "19.91°N 99.83°E" },
  };
  const LOCAL_CATS = ["cafe", "sweets", "park", "art"];

  const state = { cities: [], places: [], useful: [], personal: { cities: {}, places: {} }, favorites: new Set(), filters: {}, userPos: null };
  const $app = document.getElementById("app");
  let map = null;

  // ---------- Утилиты ----------
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const priceSigns = (lvl) => "฿".repeat(lvl || 1);
  const cityById = (id) => state.cities.find((c) => c.id === id);
  const placeById = (id) => state.places.find((p) => p.id === id);
  // Заметка и штамп: из личного файла, иначе из самой карточки места
  const mine = (p) => ({ note: p.note, stamp: p.stamp, ...(state.personal.places[p.id] || {}) });
  const isLocal = (p) => (typeof p.local === "boolean" ? p.local : p.hidden_gem || (p.categories || []).some((c) => LOCAL_CATS.includes(c)));
  const pad = (n) => String(n).padStart(2, "0");
  const plural = (n, one, few, many) => {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  };
  const placesWord = (n) => `${n} ${plural(n, "место", "места", "мест")}`;

  function haptic(type = "light") { try { tg && tg.HapticFeedback && tg.HapticFeedback.impactOccurred(type); } catch (_) {} }
  function toast(text) {
    const el = document.getElementById("toast");
    el.textContent = text; el.classList.add("show");
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove("show"), 1800);
  }
  function openExternal(url) { if (!url) return; if (tg && inTelegram) tg.openLink(url); else window.open(url, "_blank", "noopener"); }
  function distanceKm(a, b) {
    const R = 6371, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtKm = (km) => (km < 1 ? `${Math.round(km * 1000)} м` : `${km < 10 ? km.toFixed(1) : Math.round(km)} км`);
  // pos — какую часть фото показывать в кадре (для вертикальных фото), например "50% 62%"
  const imgTag = (url, alt, pos) => `<img src="${esc(url)}" alt="${esc(alt)}" loading="lazy" referrerpolicy="no-referrer"${pos ? ` style="object-position:${esc(pos)}"` : ""} onerror="this.classList.add('broken')">`;

  // ---------- Избранное ----------
  const cloud = tg && tg.CloudStorage && tg.isVersionAtLeast && tg.isVersionAtLeast("6.9") && inTelegram ? tg.CloudStorage : null;
  function loadFavorites() {
    return new Promise((resolve) => {
      const apply = (raw) => { try { state.favorites = new Set(JSON.parse(raw || "[]")); } catch (_) {} resolve(); };
      if (cloud) cloud.getItem("favorites", (err, v) => apply(err ? null : v));
      else { try { apply(localStorage.getItem("favorites")); } catch (_) { resolve(); } }
    });
  }
  function toggleFavorite(id) {
    if (state.favorites.has(id)) { state.favorites.delete(id); toast("Убрано из списка"); }
    else { state.favorites.add(id); toast("Добавлено в мой список"); }
    haptic("medium");
    const raw = JSON.stringify([...state.favorites]);
    if (cloud) cloud.setItem("favorites", raw); else { try { localStorage.setItem("favorites", raw); } catch (_) {} }
    document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => (b.textContent = state.favorites.has(id) ? "♥" : "♡"));
  }

  // ---------- Геолокация ----------
  function locate() {
    return new Promise((resolve, reject) => {
      if (state.userPos) return resolve(state.userPos);
      const done = (lat, lng) => { state.userPos = { lat, lng }; resolve(state.userPos); };
      const browserGeo = () => navigator.geolocation
        ? navigator.geolocation.getCurrentPosition((p) => done(p.coords.latitude, p.coords.longitude), reject, { timeout: 10000 })
        : reject(new Error("unsupported"));
      const lm = tg && tg.LocationManager;
      if (lm && inTelegram && tg.isVersionAtLeast("8.0")) {
        lm.init(() => (lm.isLocationAvailable ? lm.getLocation((l) => (l ? done(l.latitude, l.longitude) : reject(new Error("denied")))) : browserGeo()));
      } else browserGeo();
    });
  }

  // ---------- Шаблоны ----------
  function stamp(text, cls = "") {
    if (!text) return "";
    return `<span class="stamp ${cls}" style="--sc:${STAMP_COLORS[text] || "#e0531f"}">${esc(text)}</span>`;
  }

  // Обложка для мест без фото: цвет темы, эмодзи категории и название
  function coverArt(p) {
    const cat = (p.categories || [])[0];
    const theme = THEMES.find((t) => t.cats.includes(cat));
    const emoji = (CATEGORIES[cat] || {}).emoji || "📍";
    return `<div class="cover-art" style="--c:${theme ? theme.c : "#4a4440"};--t:${theme && theme.t ? theme.t : "#fff"}">
      <span class="e">${emoji}</span><span class="t">${esc(p.name_en || p.name)}</span></div>`;
  }

  function frame(p, i, { showCity = false, dist = null } = {}) {
    const m = mine(p);
    const photo = p.photos && p.photos[0] && p.photos[0].url;
    const city = cityById(p.city);
    const where = showCity && city ? `${CITY_META[p.city] ? CITY_META[p.city].code : city.name} · ${p.district || ""}` : p.district || "";
    const cats = (p.categories || []).map((c) => CATEGORIES[c] && CATEGORIES[c].emoji).filter(Boolean).join(" ");
    return `
      <article class="frame" data-open="${esc(p.id)}" role="button" tabindex="0">
        <div class="img">
          ${photo ? imgTag(photo, p.name, p.photos[0].pos) : coverArt(p)}
          ${isLocal(p) ? `<span class="local-label">как местная</span>` : ""}
          ${stamp(m.stamp)}
          <button class="fav" data-fav="${esc(p.id)}" aria-label="В мой список">${state.favorites.has(p.id) ? "♥" : "♡"}</button>
        </div>
        <div class="strip"><span>№${pad(i + 1)} · ${esc(where)}</span><span>${cats} · <span class="price">${priceSigns(p.price_level)}</span></span></div>
        <h3>${esc(p.name)}</h3>
        <p class="note">${esc(m.note || p.short)}</p>
        ${dist != null ? `<div class="dist">◎ ${fmtKm(dist)} от тебя</div>` : ""}
      </article>`;
  }

  const feed = (list, opts) => `<div class="feed">${list.map((p, i) => frame(p, i, opts)).join("")}</div>`;
  const backBtn = `<button class="back" data-action="back" aria-label="Назад">←</button>`;

  // ---------- Экраны ----------
  const inTheme = (p, t) => (p.categories || []).some((c) => t.cats.includes(c));

  function screenHome() {
    const cities = state.cities.map((c) => {
      const meta = CITY_META[c.id] || { code: c.name.slice(0, 3).toUpperCase(), coords: "" };
      const n = state.places.filter((p) => p.city === c.id).length;
      return `
        <button class="city" data-go="#/city/${esc(c.id)}">
          ${c.photo ? imgTag(c.photo.url, c.name) : ""}
          <span class="in">
            <span class="coords"><span>${esc(meta.coords)}</span><span>${n ? placesWord(n) : "скоро"}</span></span>
            <span><span class="code">${esc(meta.code)}</span><div class="nm">${esc(c.name)}</div><div class="tl">${esc(state.personal.cities[c.id] || c.tagline || "")}</div></span>
          </span>
        </button>`;
    }).join("");

    return `
      <section class="screen">
        <header class="cover">
          <div class="kicker"><span>Field notes / Thailand</span><span>${placesWord(state.places.length)}</span></div>
          <h1>Мой<br>Таиланд<span>не из путеводителя</span></h1>
        </header>
        <div class="intro">
          <div class="me">${CFG.authorPhoto ? imgTag(CFG.authorPhoto, CFG.authorName) : esc(CFG.authorName.slice(0, 1))}</div>
          <div>${CFG.intro.map((t) => `<p>${esc(t)}</p>`).join("")}<div class="sign">${esc(CFG.signature)}</div></div>
        </div>

        <div class="sec"><h2>Куда едешь?</h2><span>${pad(state.cities.length)} городов</span></div>
        <div class="cities">${cities}</div>

        <div class="sec"><h2>Ещё</h2><span>инструменты</span></div>
        <div class="tools">
          <button class="tool" data-action="random"><span class="e">🎲</span><span><b>Куда сегодня?</b><small>случайное место</small></span></button>
          <button class="tool" data-go="#/near"><span class="e">◎</span><span><b>Рядом</b><small>по геолокации</small></span></button>
          <button class="tool" data-go="#/favorites"><span class="e">♥</span><span><b>Мой список</b><small>${pad(state.favorites.size)} сохранено</small></span></button>
          ${state.useful.length ? `<button class="tool" data-go="#/useful"><span class="e">🧳</span><span><b>Полезное</b><small>сим, такси, деньги</small></span></button>` : ""}
        </div>
      </section>`;
  }

  function filtersFor(key) {
    if (!state.filters[key]) state.filters[key] = { cat: "all", tags: new Set(), view: "list" };
    return state.filters[key];
  }

  // f.cat: "all" | "local" | "classic" | "t:<тема>" | "<категория>"
  function applyFilters(list, f) {
    const theme = f.cat.startsWith("t:") ? THEMES.find((t) => t.id === f.cat.slice(2)) : null;
    return list.filter((p) => {
      if (f.cat === "local" && !isLocal(p)) return false;
      if (f.cat === "classic" && isLocal(p)) return false;
      if (theme && !inTheme(p, theme)) return false;
      if (!theme && !["all", "local", "classic"].includes(f.cat) && !(p.categories || []).includes(f.cat)) return false;
      for (const t of f.tags) if (!(p.tags || []).includes(t)) return false;
      return true;
    });
  }

  function filterBar(all, f, { withLocal = true, withCats = true } = {}) {
    const themes = THEMES.filter((t) => all.some((p) => inTheme(p, t)));
    const tags = TAGS.filter((t) => all.some((p) => (p.tags || []).includes(t.id)));
    const chip = (val, label) => `<button class="chip ${f.cat === val ? "on" : ""}" data-cat="${val}">${label}</button>`;
    const catChips = withCats ? [
      chip("all", "Все"),
      withLocal && all.some(isLocal) ? chip("local", "Как местная") : "",
      withLocal && all.some((p) => !isLocal(p)) ? chip("classic", "Как турист") : "",
      ...themes.map((t) => chip(`t:${t.id}`, `${t.emoji} ${esc(t.name)}`)),
    ].join("") : "";
    const tagChips = tags.map((t) => `<button class="chip small ${f.tags.has(t.id) ? "on" : ""}" data-tag="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join("");
    if (!catChips && !tagChips) return "";
    return `<div class="filters">${catChips ? `<div class="chips">${catChips}</div>` : ""}${tagChips ? `<div class="chips">${tagChips}</div>` : ""}</div>`;
  }

  function listOrMap(list, f, opts) {
    const bar = `<div class="bar"><span class="count">${placesWord(list.length)}</span><div class="seg"><button class="${f.view === "list" ? "on" : ""}" data-view="list">Список</button><button class="${f.view === "map" ? "on" : ""}" data-view="map">Карта</button></div></div>`;
    const filtered = f.cat !== "all" || f.tags.size || f.city;
    if (!list.length && !filtered) return `<div class="empty"><div class="e">✎</div><b>Скоро здесь появятся мои места</b>Я добавляю их по одному, только проверенные</div>`;
    if (!list.length) return bar + `<div class="empty"><div class="e">∅</div><b>Ничего не нашлось</b>Убери часть фильтров<br><button class="chip on" data-action="reset">Сбросить</button></div>`;
    return bar + (f.view === "map" ? `<div id="map" class="map"></div>` : feed(list, opts));
  }

  function screenCity(id) {
    const city = cityById(id);
    if (!city) return screenNotFound();
    const meta = CITY_META[id] || { code: "", coords: "" };
    const all = state.places.filter((p) => p.city === id);
    const f = filtersFor(`city:${id}`);
    const list = applyFilters(all, f);
    const local = all.filter(isLocal).length;
    // Плитки тем — только по этому городу и только непустые; нажатие фильтрует ленту ниже
    const themes = THEMES.map((t) => ({ ...t, n: all.filter((p) => inTheme(p, t)).length })).filter((t) => t.n > 0)
      .map((t) => `
        <button class="theme" style="--c:${t.c};${t.t ? `--t:${t.t}` : ""}" data-cat="t:${t.id}" data-jump="1">
          <span class="e">${t.emoji}</span><span class="cnt">${pad(t.n)}</span><b>${esc(t.name)}</b>
        </button>`).join("");
    const ways = local && local < all.length ? `
        <div class="sec"><h2>Два взгляда</h2><span>выбери свой</span></div>
        <div class="ways">
          <button class="way" data-cat="classic" data-jump="1"><span class="n">01 / ${pad(all.length - local)}</span><span><b>Как турист</b><small>Главное, что стоит увидеть хотя бы раз</small></span></button>
          <button class="way local" data-cat="local" data-jump="1"><span class="n">02 / ${pad(local)}</span><span><b>Как местная</b><small>Куда хожу я сама, когда не вожу гостей</small></span></button>
        </div>` : "";
    return `
      <section class="screen">
        ${backBtn}
        <div class="hero">
          ${city.photo ? imgTag(city.photo.url, city.name) : ""}
          <div class="in"><div class="coords">${esc(meta.coords)}</div><div><div class="code">${esc(meta.code)}</div><h1>${esc(city.name)}</h1><p>${esc(state.personal.cities[id] || city.tagline || "")}</p></div></div>
        </div>
        ${ways}
        ${themes && all.length > 6 ? `<div class="sec"><h2>Что я люблю</h2><span>в этом городе</span></div><div class="themes">${themes}</div>` : ""}
        <div id="list-top"></div>
        ${filterBar(all, f)}
        ${listOrMap(list, f)}
      </section>`;
  }

  function moodSource(id) {
    if (id === "local") return { title: "Как местная", sub: "Куда хожу я сама: кофейни, парки, арт и тихие места без толп.", list: state.places.filter(isLocal), cats: true };
    if (id === "classic-all") return { title: "Как турист", sub: "Классика, которую стоит увидеть хотя бы раз. Я сама была во всех этих местах и советую их.", list: state.places.filter((p) => !isLocal(p)), cats: true };
    const t = THEMES.find((x) => x.id === id);
    if (!t) return null;
    return { title: `${t.emoji} ${t.name}`, sub: "Подборка по всем городам. Отфильтруй по нужному.", list: state.places.filter((p) => (p.categories || []).some((c) => t.cats.includes(c))), cats: false };
  }

  function screenMood(id) {
    const src = moodSource(id);
    if (!src) return screenNotFound();
    const f = filtersFor(`mood:${id}`);
    // В подборках по всем городам первым рядом фильтров идут города
    const cityChips = state.cities.filter((c) => src.list.some((p) => p.city === c.id))
      .map((c) => `<button class="chip ${f.city === c.id ? "on" : ""}" data-city="${c.id}">${esc(c.name)}</button>`).join("");
    const byCity = f.city ? src.list.filter((p) => p.city === f.city) : src.list;
    const list = applyFilters(byCity, f);
    const tags = TAGS.filter((t) => byCity.some((p) => (p.tags || []).includes(t.id)))
      .map((t) => `<button class="chip small ${f.tags.has(t.id) ? "on" : ""}" data-tag="${t.id}">${t.emoji} ${esc(t.name)}</button>`).join("");
    return `
      <section class="screen">
        ${backBtn}
        <header class="page-title"><div class="kicker">подборка</div><h1>${esc(src.title)}</h1><p>${esc(src.sub)}</p></header>
        <div class="filters" style="margin-top:14px">
          <div class="chips"><button class="chip ${!f.city ? "on" : ""}" data-city="">Все города</button>${cityChips}</div>
          ${tags ? `<div class="chips">${tags}</div>` : ""}
        </div>
        ${listOrMap(list, f, { showCity: true })}
      </section>`;
  }

  function screenPlace(id) {
    const p = placeById(id);
    if (!p) return screenNotFound();
    const m = mine(p);
    const city = cityById(p.city);
    const meta = CITY_META[p.city] || { code: "", coords: "" };
    const photos = (p.photos || []).filter((x) => x.url);
    const slides = photos.length ? photos.map((ph) => `<div class="slide">${imgTag(ph.url, p.name, ph.pos)}</div>`).join("") : `<div class="slide">${coverArt(p)}</div>`;
    const cats = (p.categories || []).map((c) => CATEGORIES[c]).filter(Boolean).map((c) => `${c.emoji} ${c.name}`).join(" · ");
    const facts = [["Цена", p.price_text], ["Часы", p.hours], ["Сколько нужно", p.duration], ["Лучшее время", p.best_time], ["Как добраться", p.how_to_get]]
      .filter(([, v]) => v).map(([k, v]) => `<div class="fact"><div class="k">${k}</div><div class="v">${esc(v)}</div></div>`).join("")
      + (p.nuances ? `<div class="fact warn"><div class="k">Важно</div><div class="v">${esc(p.nuances)}</div></div>` : "");
    const links = [p.instagram && `<button data-link="${esc(p.instagram)}">Instagram ↗</button>`, p.website && `<button data-link="${esc(p.website)}">Сайт ↗</button>`].filter(Boolean).join("");
    const credits = photos.map((x) => x.credit).filter(Boolean);
    // Связанные места: например, ресторан в том же здании
    const related = (p.related || []).map(placeById).filter(Boolean).map((r) => {
      const rp = r.photos && r.photos[0] && r.photos[0].url;
      const re = (CATEGORIES[(r.categories || [])[0]] || {}).emoji || "📍";
      return `<button class="rel" data-open="${esc(r.id)}">
          <span class="th">${rp ? imgTag(rp, r.name, r.photos[0].pos) : `<span class="e">${re}</span>`}</span>
          <span><b>${esc(r.name)}</b><small>${esc(mine(r).note || r.short)}</small></span><span class="arr">→</span>
        </button>`;
    }).join("");
    return `
      <section class="screen">
        ${backBtn}
        <div class="gallery"><div class="track">${slides}</div>${photos.length > 1 ? `<span class="counter">01 / ${pad(photos.length)}</span>` : ""}</div>
        <div class="d-body">
          <div class="strip"><span>${esc(meta.code)} · ${esc(meta.coords)}</span><span class="price">${priceSigns(p.price_level)}</span></div>
          <h1>${esc(p.name)}</h1>
          <div class="en">${esc(p.name_en || "")}${city ? ` / ${esc(city.name)}, ${esc(p.district || "")}` : ""}</div>
          <div class="stamps">${stamp(m.stamp, "inline")}${isLocal(p) ? `<span class="stamp inline" style="--sc:#161514">как местная</span>` : ""}</div>
          ${m.note ? `<div class="fieldnote"><div class="k">${esc(CFG.noteTitle || "Заметка автора")}</div><p>${esc(m.note)}</p></div>` : ""}
          <p class="desc">${esc(p.description)}</p>
          ${p.tip ? `<div class="tipbox"><div class="k">${esc(CFG.tipTitle)}</div><p>${esc(p.tip)}</p></div>` : ""}
          <div class="facts">${facts}<div class="fact"><div class="k">Категории</div><div class="v">${esc(cats)}</div></div></div>
          ${links ? `<div class="links">${links}</div>` : ""}
          ${related ? `<div class="related"><div class="k">${esc(p.related_title || "Связано")}</div>${related}</div>` : ""}
          ${credits.length ? `<div class="credits">Фото: ${credits.map(esc).join("; ")}</div>` : ""}
        </div>
        <div class="actions">
          <button class="btn-main" data-link="${esc(p.maps_url)}">Построить маршрут →</button>
          <button class="btn-ico" data-fav="${esc(p.id)}" aria-label="В мой список">${state.favorites.has(p.id) ? "♥" : "♡"}</button>
          <button class="btn-ico" data-share="${esc(p.id)}" aria-label="Поделиться">↗</button>
        </div>
      </section>`;
  }

  function screenFavorites() {
    const list = state.places.filter((p) => state.favorites.has(p.id));
    return `
      <section class="screen">${backBtn}
        <header class="page-title"><div class="kicker">сохранено: ${pad(list.length)}</div><h1>Мой список</h1><p>Собери свой маршрут на поездку: нажимай ♡ на карточках.</p></header>
        ${list.length ? feed(list, { showCity: true }) : `<div class="empty"><div class="e">♡</div><b>Пока пусто</b>Сохраняй места, и они появятся здесь</div>`}
      </section>`;
  }

  function screenNear() {
    const head = `${backBtn}<header class="page-title"><div class="kicker">геолокация</div><h1>Рядом с тобой</h1><p>Ближайшие места из моего списка.</p></header>`;
    if (!state.userPos) {
      locate().then(render).catch(() => {
        const el = document.getElementById("near-body");
        if (el) el.innerHTML = `<div class="empty"><div class="e">◎</div><b>Не получилось определить, где ты</b>Разреши доступ к геолокации<br><button class="chip on" data-action="retry">Ещё раз</button></div>`;
      });
      return `<section class="screen">${head}<div id="near-body"><div class="skeleton"></div></div></section>`;
    }
    const list = state.places.map((p) => ({ p, d: distanceKm(state.userPos, p) })).sort((a, b) => a.d - b.d).slice(0, 12);
    return `<section class="screen">${head}<div class="feed">${list.map(({ p, d }, i) => frame(p, i, { showCity: true, dist: d })).join("")}</div></section>`;
  }

  function screenUseful() {
    return `
      <section class="screen">${backBtn}
        <header class="page-title"><div class="kicker">шпаргалка</div><h1>Полезное</h1><p>Всё, что пригодится в первые дни. Проверено на себе.</p></header>
        <div class="index">${state.useful.map((s, i) => `
          <button class="idx" data-go="#/useful/${esc(s.id)}"><span class="n">${pad(i + 1)}</span><span><b>${esc(s.title)}</b><small>${esc(s.short || "")}</small></span><span class="e">${esc(s.emoji)}</span></button>`).join("")}
        </div>
      </section>`;
  }

  function screenUsefulSection(id) {
    const i = state.useful.findIndex((x) => x.id === id);
    const s = state.useful[i];
    if (!s) return screenNotFound();
    const apps = (s.apps || []).map((a) => `<button class="app" ${a.url ? `data-link="${esc(a.url)}"` : ""}><b>${esc(a.name)}</b><small>${esc(a.what || "")}</small></button>`).join("");
    return `
      <section class="screen">${backBtn}
        <header class="page-title"><div class="kicker">полезное / ${pad(i + 1)}</div><h1>${esc(s.title)}</h1>${s.short ? `<p>${esc(s.short)}</p>` : ""}</header>
        <div class="d-body">
          ${s.tip ? `<div class="tipbox"><div class="k">${esc(CFG.tipTitle)}</div><p>${esc(s.tip)}</p></div>` : ""}
          ${apps ? `<div class="apps">${apps}</div>` : ""}
          <div class="facts solo">${(s.items || []).map((it) => `<div class="fact"><div class="k">${esc(it.title)}</div><div class="v">${esc(it.text)}</div></div>`).join("")}</div>
        </div>
      </section>`;
  }

  function screenNotFound() {
    return `<section class="screen">${backBtn}<div class="empty" style="padding-top:90px"><div class="e">∅</div><b>Такой страницы нет</b><button class="chip on" data-go="#/">На главную</button></div></section>`;
  }

  // ---------- Карта и галерея ----------
  function mountMap(list) {
    const el = document.getElementById("map");
    if (!el || !window.L) return;
    map = L.map(el, { zoomControl: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    const pts = [];
    list.forEach((p) => {
      if (typeof p.lat !== "number") return;
      const emoji = (CATEGORIES[(p.categories || [])[0]] || {}).emoji || "•";
      const icon = L.divIcon({ className: "", html: `<div class="pin ${isLocal(p) ? "local" : ""}">${emoji}</div>`, iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -14] });
      L.marker([p.lat, p.lng], { icon }).addTo(map).bindPopup(`<div class="popup"><b>${esc(p.name)}</b><span class="m">→ ${esc(mine(p).note || p.short)}</span><button data-open="${esc(p.id)}">Открыть →</button></div>`);
      pts.push([p.lat, p.lng]);
    });
    if (pts.length === 1) map.setView(pts[0], 13); else if (pts.length) map.fitBounds(pts, { padding: [36, 36] });
  }

  function mountGallery() {
    const track = document.querySelector(".gallery .track");
    const counter = document.querySelector(".gallery .counter");
    if (!track || !counter) return;
    const total = track.children.length;
    track.addEventListener("scroll", () => { counter.textContent = `${pad(Math.round(track.scrollLeft / track.clientWidth) + 1)} / ${pad(total)}`; }, { passive: true });
  }

  function share(id) {
    const p = placeById(id);
    if (!p) return;
    const text = `${p.name} — ${mine(p).note || p.short}`;
    const link = CFG.appLink ? `${CFG.appLink}?startapp=place_${p.id}` : p.maps_url;
    const url = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
    if (tg && inTelegram) tg.openTelegramLink(url);
    else if (navigator.share) navigator.share({ title: p.name, text, url: link }).catch(() => {});
    else openExternal(url);
  }

  // ---------- Роутер ----------
  const route = () => { const [name, id] = (location.hash || "#/").slice(2).split("/"); return { name: name || "home", id }; };

  function currentList() {
    const r = route();
    if (r.name === "city") return applyFilters(state.places.filter((p) => p.city === r.id), filtersFor(`city:${r.id}`));
    if (r.name === "mood") {
      const src = moodSource(r.id); const f = filtersFor(`mood:${r.id}`);
      return src ? applyFilters(f.city ? src.list.filter((p) => p.city === f.city) : src.list, f) : [];
    }
    return [];
  }
  const filterKey = () => { const r = route(); return r.name === "city" ? `city:${r.id}` : r.name === "mood" ? `mood:${r.id}` : null; };

  function render() {
    if (map) { map.remove(); map = null; }
    const r = route();
    const screens = {
      home: screenHome, city: () => screenCity(r.id), mood: () => screenMood(r.id), place: () => screenPlace(r.id),
      favorites: screenFavorites, near: screenNear, useful: () => (r.id ? screenUsefulSection(r.id) : screenUseful()),
    };
    $app.innerHTML = (screens[r.name] || screenNotFound)();
    const key = filterKey();
    if (key && filtersFor(key).view === "map") mountMap(currentList());
    if (r.name === "place") mountGallery();
    if (tg && tg.BackButton) { if (r.name === "home") tg.BackButton.hide(); else tg.BackButton.show(); }
  }

  function go(hash) { haptic(); if (location.hash === hash) render(); else location.hash = hash; }
  function back() { if (history.length > 1 && route().name !== "home") history.back(); else go("#/"); }

  function renderKeepScroll() {
    const y = window.scrollY;
    const xs = [...document.querySelectorAll(".chips")].map((c) => c.scrollLeft);
    render();
    window.scrollTo(0, y);
    document.querySelectorAll(".chips").forEach((c, i) => (c.scrollLeft = xs[i] || 0));
  }

  $app.addEventListener("click", (e) => {
    const t = e.target.closest("[data-fav],[data-share],[data-link],[data-open],[data-go],[data-cat],[data-tag],[data-view],[data-city],[data-action]");
    if (!t) return;
    const d = t.dataset;
    if (d.fav) { e.stopPropagation(); return toggleFavorite(d.fav); }
    if (d.share) return share(d.share);
    if (d.link) return openExternal(d.link);
    if (d.open) return go(`#/place/${d.open}`);
    if (d.go) return go(d.go);
    const key = filterKey();
    if (key) {
      const f = filtersFor(key);
      if (d.cat !== undefined) {
        f.cat = d.cat; haptic(); renderKeepScroll();
        // С плиток прокручиваем сразу к отфильтрованной ленте
        if (d.jump) {
          const on = document.querySelector(".filters .chip.on");
          if (on) on.parentElement.scrollLeft = on.offsetLeft - 16;
          const el = document.getElementById("list-top");
          if (el) window.scrollTo({ top: el.offsetTop - 4, behavior: "smooth" });
        }
        return;
      }
      if (d.tag) { f.tags.has(d.tag) ? f.tags.delete(d.tag) : f.tags.add(d.tag); haptic(); return renderKeepScroll(); }
      if (d.view) { f.view = d.view; haptic(); return renderKeepScroll(); }
      if (d.city !== undefined) { f.city = d.city || null; haptic(); return renderKeepScroll(); }
      if (d.action === "reset") { state.filters[key] = null; return render(); }
    }
    if (d.action === "back") return back();
    if (d.action === "retry") return render();
    if (d.action === "random") {
      const p = state.places[Math.floor(Math.random() * state.places.length)];
      if (p) { haptic("medium"); go(`#/place/${p.id}`); }
    }
  });
  $app.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.dataset && e.target.dataset.open) go(`#/place/${e.target.dataset.open}`); });
  window.addEventListener("hashchange", () => { render(); window.scrollTo(0, 0); });

  // ---------- Старт ----------
  function applyTheme() {
    const dark = tg && inTelegram ? tg.colorScheme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    if (tg && inTelegram) {
      const bg = getComputedStyle(document.documentElement).getPropertyValue("--paper").trim();
      try { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); } catch (_) {}
    }
  }

  // Заголовок нужен только для временной ссылки ngrok: без него вместо данных приходит страница-предупреждение
  const getJSON = (url, fallback) => fetch(url, { cache: "no-cache", headers: { "ngrok-skip-browser-warning": "1" } }).then((r) => (r.ok ? r.json() : fallback)).catch(() => fallback);

  async function init() {
    $app.innerHTML = `<div class="skeleton"></div><div class="skeleton"></div>`;
    if (tg) {
      tg.ready(); tg.expand();
      if (inTelegram) document.documentElement.classList.add("tg");
      tg.BackButton && tg.BackButton.onClick(back);
      tg.onEvent && tg.onEvent("themeChanged", applyTheme);
    }
    applyTheme();

    const extraUrls = CFG.extraPlacesUrls || [];
    const [cities, places, useful, ...rest] = await Promise.all([
      getJSON(CFG.citiesUrl, null), getJSON(CFG.placesUrl, null), getJSON(CFG.usefulUrl, []),
      ...extraUrls.map((u) => getJSON(u, [])), ...CFG.personalUrls.map((u) => getJSON(u, {})), loadFavorites(),
    ]);
    const extra = rest.slice(0, extraUrls.length).flat().filter((p) => p && p.id && !p.closed);
    const personal = rest.slice(extraUrls.length);
    if (!cities || !places) {
      $app.innerHTML = `<div class="empty" style="padding-top:90px"><div class="e">⚠</div><b>Не удалось загрузить данные</b>Проверь интернет и открой снова</div>`;
      return;
    }
    state.cities = cities;
    // Если место есть в нескольких файлах, побеждает последнее (личные списки важнее базовых)
    const byId = new Map();
    [...places, ...extra].forEach((p) => byId.set(p.id, { ...(byId.get(p.id) || {}), ...p }));
    state.places = [...byId.values()];
    state.useful = Array.isArray(useful) ? useful : [];
    // Личный слой: файл может быть {cities, places} или просто {id: {note, stamp}}
    personal.forEach((obj) => {
      if (!obj || typeof obj !== "object") return;
      if (obj.places || obj.cities) { Object.assign(state.personal.places, obj.places || {}); Object.assign(state.personal.cities, obj.cities || {}); }
      else Object.assign(state.personal.places, obj);
    });

    const start = tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param;
    if (start && start.startsWith("place_") && placeById(start.slice(6))) location.hash = `#/place/${start.slice(6)}`;
    else if (start && start.startsWith("city_") && cityById(start.slice(5))) location.hash = `#/city/${start.slice(5)}`;
    render();
  }

  init();
})();
