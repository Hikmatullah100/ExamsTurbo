// Announcement bar + Sale popup (Supabase: announcements, sale_popups)
// Agar database se kuch na aaye ya error ho, to purani HTML wali patti waisi hi rehti hai.
import { supabaseClient as sb } from "./supabase.js";

const POPUP_KEY_PREFIX = "examsturbo_popup_";

/* ---------- helpers ---------- */
function safeUrl(value) {
  if (!value) return "";
  const url = String(value).trim();
  // sirf http(s) ya site ke andar ke relative links allow
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z0-9_\-./#?=&%]+$/i.test(url) && !/^[a-z]+:/i.test(url)) return url;
  return "";
}

function pageKey() {
  const segments = window.location.pathname.split("/").filter(Boolean);
  const file = segments[segments.length - 1] || "index.html";
  const name = file.replace(/\.html$/i, "").toLowerCase();
  return name === "index" || name === "" ? "home" : name;
}

function injectStyles() {
  if (document.getElementById("promoStyles")) return;
  const style = document.createElement("style");
  style.id = "promoStyles";
  style.textContent = `
    .promo-bar[data-kind="sale"] { background: linear-gradient(90deg, #a83f00, #ff7a00) !important; }
    .promo-bar[data-kind="warning"] { background: #7a5b00 !important; }
    .promo-bar a.promo-code { text-decoration: none; color: inherit; }
    .et-popup-backdrop {
      position: fixed; inset: 0; z-index: 3000;
      display: grid; place-items: center; padding: 18px;
      background: rgba(3, 12, 22, 0.72);
    }
    .et-popup {
      position: relative; width: min(440px, 100%); overflow: hidden;
      border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 16px;
      background: var(--card-surface, #0d2742); color: #fff;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.5);
    }
    .et-popup img { width: 100%; max-height: 190px; object-fit: cover; display: block; }
    .et-popup-body { padding: 24px; text-align: center; }
    .et-popup h2 { font-size: 24px; font-weight: 800; margin: 0 0 8px; }
    .et-popup p { color: var(--secondary-text, #b8c7d8); font-size: 14px; line-height: 1.7; margin: 0 0 16px; }
    .et-popup-close {
      position: absolute; top: 10px; right: 10px; width: 34px; height: 34px;
      border: 0; border-radius: 50%; background: rgba(0, 0, 0, 0.45);
      color: #fff; font-size: 18px; line-height: 1; z-index: 1;
    }
    .et-popup-coupon {
      display: flex; align-items: center; justify-content: center; gap: 10px;
      margin: 0 auto 16px; padding: 10px 14px; width: fit-content; max-width: 100%;
      border: 2px dashed rgba(255, 122, 0, 0.8); border-radius: 10px;
    }
    .et-popup-coupon strong { font-size: 18px; letter-spacing: 1.5px; color: var(--orange-light, #ff9a2e); }
    .et-popup-coupon button {
      border: 0; border-radius: 6px; padding: 5px 10px;
      background: rgba(255, 255, 255, 0.12); color: #fff; font-size: 12px; font-weight: 700;
    }
    .et-popup-cta { display: inline-block; text-decoration: none; }
  `;
  document.head.appendChild(style);
}

/* ---------- announcement bar ---------- */
function showAnnouncement(bar, announcement) {
  const inner = bar.querySelector(".promo-inner");
  if (!inner) return;
  bar.dataset.kind = announcement.kind || "info";
  inner.replaceChildren();

  const message = document.createElement("span");
  const icon = document.createElement("i");
  icon.className = "fa-solid fa-bolt";
  message.append(icon, " ", announcement.message);
  inner.append(message);

  const url = safeUrl(announcement.link_url);
  if (url && announcement.link_text) {
    const link = document.createElement("a");
    link.className = "promo-code";
    link.href = url;
    const strong = document.createElement("strong");
    strong.textContent = announcement.link_text;
    link.append(strong);
    inner.append(link);
  }
}

async function initAnnouncements() {
  const bar = document.querySelector(".promo-bar");
  if (!bar) return;
  const { data, error } = await sb
    .from("announcements")
    .select("message,link_text,link_url,kind,sort_order,created_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Announcements load failed, keeping static bar:", error);
    return;
  }
  if (!data || !data.length) return; // koi active announcement nahi: purani patti rahe

  let index = 0;
  showAnnouncement(bar, data[0]);
  if (data.length > 1) {
    setInterval(() => {
      index = (index + 1) % data.length;
      showAnnouncement(bar, data[index]);
    }, 6000);
  }
}

/* ---------- sale popup ---------- */
// Rule: popup ek browser tab mein sirf EK baar aata hai (pages badalne par dobara nahi).
// Page refresh (F5 / Ctrl+R) karne par flag saaf ho jata hai, to popup dobara aa sakta hai.
// Admin ka "Show again after (days)" bhi chalta hai: days > 0 ho to utne din tak naye tab mein bhi nahi aayega.
function sessionKey(popup) {
  return POPUP_KEY_PREFIX + "session_" + popup.id;
}

(function resetOnReload() {
  try {
    const nav = performance.getEntriesByType("navigation")[0];
    const isReload = nav ? nav.type === "reload" : performance.navigation && performance.navigation.type === 1;
    if (!isReload) return;
    Object.keys(sessionStorage)
      .filter((k) => k.startsWith(POPUP_KEY_PREFIX + "session_"))
      .forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
})();

function wasShownRecently(popup) {
  try {
    if (sessionStorage.getItem(sessionKey(popup))) return true; // is tab mein pehle dikha chuka
  } catch {
    /* ignore */
  }
  try {
    const days = Number(popup.show_again_after_days) || 0;
    if (!days) return false; // 0 = har naye visit par
    const last = Number(localStorage.getItem(POPUP_KEY_PREFIX + popup.id));
    if (!last) return false;
    return Date.now() - last < days * 86400000;
  } catch {
    return false;
  }
}

function markShown(popup) {
  try {
    sessionStorage.setItem(sessionKey(popup), "1");
  } catch {
    /* ignore */
  }
  try {
    localStorage.setItem(POPUP_KEY_PREFIX + popup.id, String(Date.now()));
  } catch {
    /* storage band ho to koi masla nahi */
  }
}

function openPopup(popup) {
  const backdrop = document.createElement("div");
  backdrop.className = "et-popup-backdrop";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "etPopupTitle");

  const card = document.createElement("div");
  card.className = "et-popup";

  const close = document.createElement("button");
  close.type = "button";
  close.className = "et-popup-close";
  close.setAttribute("aria-label", "Close");
  close.textContent = "×";
  card.append(close);

  const imageUrl = safeUrl(popup.image_url);
  if (imageUrl) {
    const img = document.createElement("img");
    img.src = new URL(imageUrl, window.location.origin).href;
    img.alt = "";
    img.addEventListener("error", () => img.remove());
    card.append(img);
  }

  const body = document.createElement("div");
  body.className = "et-popup-body";
  const title = document.createElement("h2");
  title.id = "etPopupTitle";
  title.textContent = popup.title;
  body.append(title);

  if (popup.body) {
    const text = document.createElement("p");
    text.textContent = popup.body;
    body.append(text);
  }

  if (popup.coupon_code) {
    const box = document.createElement("div");
    box.className = "et-popup-coupon";
    const code = document.createElement("strong");
    code.textContent = popup.coupon_code;
    const copy = document.createElement("button");
    copy.type = "button";
    copy.textContent = "Copy";
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(popup.coupon_code);
        copy.textContent = "Copied!";
      } catch {
        copy.textContent = "Select & copy";
      }
    });
    box.append(code, copy);
    body.append(box);
  }

  const buttonUrl = safeUrl(popup.button_url);
  if (popup.button_text && buttonUrl) {
    const cta = document.createElement("a");
    cta.className = "btn btn-orange et-popup-cta";
    cta.href = buttonUrl;
    cta.textContent = popup.button_text;
    body.append(cta);
  }

  card.append(body);
  backdrop.append(card);
  document.body.append(backdrop);
  document.body.style.overflow = "hidden";
  close.focus();

  const dismiss = () => {
    backdrop.remove();
    document.body.style.overflow = "";
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (event) => {
    if (event.key === "Escape") dismiss();
  };
  close.addEventListener("click", dismiss);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) dismiss();
  });
  document.addEventListener("keydown", onKey);
  markShown(popup);
}

async function initPopup() {
  const { data, error } = await sb
    .from("sale_popups")
    .select(
      "id,title,body,image_url,button_text,button_url,coupon_code,delay_seconds,show_again_after_days,pages,created_at",
    )
    .order("created_at", { ascending: false });
  if (error) {
    console.warn("Sale popup load failed:", error);
    return;
  }
  const here = pageKey();
  const popup = (data || []).find(
    (item) =>
      (!item.pages || !item.pages.length || item.pages.includes(here)) &&
      !wasShownRecently(item),
  );
  if (!popup) return;
  setTimeout(() => openPopup(popup), (Number(popup.delay_seconds) || 0) * 1000);
}

/* ---------- start ---------- */
injectStyles();
initAnnouncements();
initPopup();