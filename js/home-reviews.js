// Home page: "User Reviews" sliding section (approved reviews, exam_reviews_public view).
// Jab tak kam az kam MIN_REVIEWS approved reviews na hon, section chhupa rehta hai.
(function () {
  var sec = document.getElementById("homeReviews");
  if (!sec) return;

  var MIN_REVIEWS = 3;
  var SPEED = 45; // px per second

  if (!document.getElementById("home-rv-css")) {
    var st = document.createElement("style");
    st.id = "home-rv-css";
    st.textContent =
      ".hrv-head{display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px;margin-bottom:28px}" +
      ".hrv-score{text-align:right}" +
      ".hrv-score-num{font-size:34px;font-weight:800;line-height:1;color:#fff}" +
      ".hrv-score-num span{font-size:20px;color:#fbbf24;margin-left:6px}" +
      ".hrv-score-sub{font-size:15px;color:#cbd5e1;margin-top:4px}" +
      ".hrv-viewport{overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 4%,#000 96%,transparent 100%)}" +
      ".hrv-track{display:flex;width:max-content;will-change:transform;animation:hrv-scroll var(--hrv-duration,60s) linear infinite}" +
      ".hrv-viewport:hover .hrv-track,.hrv-viewport:focus-within .hrv-track{animation-play-state:paused}" +
      ".hrv-set{display:flex;gap:16px;padding-right:16px;flex-shrink:0}" +
      ".hrv-card{flex:0 0 320px;width:320px;display:flex;flex-direction:column;padding:20px;border-radius:14px;border:1px solid rgba(255,255,255,.12);background:#102f4f}" +
      ".hrv-stars{color:#fbbf24;font-size:17px;letter-spacing:2px}" +
      ".hrv-title{font-size:17px;font-weight:700;color:#fff;margin:8px 0 6px;line-height:1.3}" +
      ".hrv-body{font-size:15px;line-height:1.7;color:#dbe6f2;margin:0 0 16px;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}" +
      ".hrv-who{display:flex;align-items:center;gap:10px;margin-top:auto}" +
      ".hrv-av{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;flex:0 0 38px;background:linear-gradient(135deg,#ff7a00,#ff9a2e);color:#071a2f;font-weight:800;font-size:14px}" +
      ".hrv-name{font-size:15px;font-weight:700;color:#fff;line-height:1.2}" +
      ".hrv-exam{font-size:14px;color:#94a3b8;line-height:1.3}" +
      "@keyframes hrv-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}" +
      "@media (prefers-reduced-motion:reduce){.hrv-track{animation:none}.hrv-viewport{overflow-x:auto;-webkit-mask-image:none;mask-image:none}}" +
      "@media (max-width:575px){.hrv-card{flex-basis:275px;width:275px}.hrv-score{text-align:left}}";
    document.head.appendChild(st);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function shortName(n) {
    var p = String(n || "").trim().split(/\s+/).filter(Boolean);
    if (!p.length) return "Learner";
    return p.length > 1 ? p[0] + " " + p[p.length - 1][0].toUpperCase() + "." : p[0];
  }
  function examLabel(id) {
    var ex = (window.EXAMS || []).find(function (e) { return e.id === id; });
    if (!ex) return "";
    return [ex.vendor, ex.examCode || ex.examTitle].filter(Boolean).join(" ");
  }
  function card(r) {
    var n = Math.max(0, Math.min(5, Number(r.rating) || 0));
    var nm = shortName(r.reviewer_name);
    return '<article class="hrv-card"><div class="hrv-stars" aria-label="' + n + ' out of 5 stars">' +
      "★".repeat(n) + "☆".repeat(5 - n) + "</div>" +
      (r.title ? '<h3 class="hrv-title">' + esc(r.title) + "</h3>" : "") +
      '<p class="hrv-body">' + esc(r.body) + "</p>" +
      '<div class="hrv-who"><span class="hrv-av">' + esc(nm[0].toUpperCase()) + "</span><div>" +
      '<div class="hrv-name">' + esc(nm) + "</div>" +
      (examLabel(r.exam_id) ? '<div class="hrv-exam">' + esc(examLabel(r.exam_id)) + "</div>" : "") +
      "</div></div></article>";
  }

  function render(rows, total) {
    var avg = rows.reduce(function (a, r) { return a + (Number(r.rating) || 0); }, 0) / rows.length;
    sec.querySelector("[data-hrv-score]").innerHTML =
      '<div class="hrv-score-num">' + avg.toFixed(1) + '<span>★</span></div>' +
      '<div class="hrv-score-sub">Based on ' + total + " approved review" + (total === 1 ? "" : "s") + "</div>";
    var track = sec.querySelector("[data-hrv-track]");
    var html = rows.map(card).join("");
    var set = document.createElement("div");
    set.className = "hrv-set";
    set.innerHTML = html;
    track.innerHTML = "";
    track.appendChild(set);
    sec.hidden = false;
    var view = sec.querySelector(".hrv-viewport"), guard = 0;
    while (set.scrollWidth < view.clientWidth && guard++ < 20) set.insertAdjacentHTML("beforeend", html);
    var clone = set.cloneNode(true);
    clone.setAttribute("aria-hidden", "true");
    track.appendChild(clone);
    track.style.setProperty("--hrv-duration", Math.max(25, set.scrollWidth / SPEED) + "s");
  }

  async function load() {
    try {
      if (window.dataReady) await window.dataReady;
      var sb = window.supabaseClient;
      if (!sb) return;
      var res = await sb
        .from("exam_reviews_public")
        .select("id,exam_id,reviewer_name,rating,title,body,created_at", { count: "exact" })
        .order("created_at", { ascending: false })
        .limit(30);
      if (res.error || !res.data || res.data.length < MIN_REVIEWS) return;
      render(res.data, res.count || res.data.length);
    } catch (e) {
      console.warn("Home reviews failed:", e);
    }
  }
  load();
})();
