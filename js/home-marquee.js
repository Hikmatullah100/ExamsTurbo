// Home page: saare vendors ka marquee (window.VENDORS se). Hover/focus par ruk jata hai.
(function () {
  var box = document.getElementById("homeVendorMarquee");
  if (!box) return;

  // CSS isi file mein hai, taake style.css purani/cached ho tab bhi sahi dikhe
  if (!document.getElementById("home-vm-css")) {
    var st = document.createElement("style");
    st.id = "home-vm-css";
    st.textContent = "/* ===== Home: All-vendors marquee (js/home-marquee.js) ===== */\n.home-vm { position: relative; }\n.vm-rows { display: grid; gap: 14px; overflow: hidden;\n  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%);\n  mask-image: linear-gradient(90deg, transparent 0, #000 4%, #000 96%, transparent 100%); }\n.vm-track { display: flex; width: max-content; will-change: transform;\n  animation: vm-scroll var(--vm-duration, 300s) linear infinite; }\n.vm-row.is-reverse .vm-track { animation-direction: reverse; }\n.vm-set { display: flex; gap: 14px; padding-right: 14px; flex-shrink: 0; }\n.vm-chip { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; width: 250px; height: 72px;\n  padding: 10px 14px; border: 1px solid rgba(255,255,255,0.12); border-radius: 12px;\n  background: var(--card); color: #fff; text-decoration: none;\n  transition: border-color .2s, transform .2s; }\n.vm-chip:hover, .vm-chip:focus-visible { border-color: rgba(255,122,0,.6); transform: translateY(-2px); color: #fff; }\n.vm-logo { width: 48px; height: 48px; flex: 0 0 48px; display: grid; place-items: center; overflow: hidden;\n  border-radius: 10px; background: linear-gradient(135deg, var(--orange), var(--orange-light));\n  color: var(--primary-bg); font-size: 15px; font-weight: 800; }\n.vm-logo.has-img { background: #fff; padding: 4px; }\n.vm-logo img { max-width: 100%; max-height: 100%; object-fit: contain; }\n.vm-name { font-size: 16px; font-weight: 700; line-height: 1.25; overflow: hidden;\n  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; word-break: break-word; }\n@keyframes vm-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }\n@media (prefers-reduced-motion: reduce) {\n  .vm-track { animation: none; }\n  .vm-rows { overflow-x: auto; -webkit-mask-image: none; mask-image: none; }\n}\n@media (max-width: 575px) {\n  .vm-chip { width: 215px; height: 66px; }\n}\n";
    document.head.appendChild(st);
  }

  var ROWS = 3;      // 1 = ek hi row, 3 = teen rows (alternate direction)
  var SPEED = 55;    // px per second
  var timer;

  function initials(v) {
    var s = (v.logoText || v.name || "?").trim();
    var w = s.split(/\s+/).filter(Boolean);
    return (w.length > 1 ? w[0][0] + w[1][0] : s.slice(0, 3)).toUpperCase();
  }

  function chip(v) {
    var a = document.createElement("a");
    a.className = "vm-chip";
    a.href = "vendors.html?q=" + encodeURIComponent(v.name);
    var logo = document.createElement("span");
    logo.className = "vm-logo";
    if (v.logoUrl) {
      logo.classList.add("has-img");
      var img = document.createElement("img");
      img.width = 40; img.height = 40; img.style.cssText = "max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain";
      img.src = v.logoUrl; img.alt = ""; img.loading = "lazy"; img.decoding = "async";
      img.onerror = function () { logo.classList.remove("has-img"); logo.textContent = initials(v); };
      logo.appendChild(img);
    } else logo.textContent = initials(v);
    var name = document.createElement("span");
    name.className = "vm-name"; name.textContent = v.name;
    a.appendChild(logo); a.appendChild(name);
    return a;
  }

  function render() {
    var list = (window.VENDORS || []).filter(function (v) { return v && v.name; });
    // Admin mein jin vendors par "Show in home page marquee" tick hai sirf wahi; koi tick nahi to saare
    var picked = list.filter(function (v) { return v.showInMarquee; });
    if (picked.length) list = picked;
    if (!list.length) return; // fallback: HTML ke 4 cards rehne do
    // logo wale pehle
    list = list.slice().sort(function (a, b) { return (b.logoUrl ? 1 : 0) - (a.logoUrl ? 1 : 0); });

    var rowsN = Math.max(1, Math.min(ROWS, Math.ceil(list.length / 12)));
    var wrap = document.createElement("div");
    wrap.className = "vm-rows";
    var rows = [];
    for (var r = 0; r < rowsN; r++) {
      var row = document.createElement("div");
      row.className = "vm-row" + (r % 2 ? " is-reverse" : "");
      var track = document.createElement("div"); track.className = "vm-track";
      var set = document.createElement("div"); set.className = "vm-set";
      track.appendChild(set); row.appendChild(track); wrap.appendChild(row);
      rows.push({ set: set, track: track });
    }
    list.forEach(function (v, i) { rows[i % rowsN].set.appendChild(chip(v)); });

    box.innerHTML = "";
    box.appendChild(wrap);

    // seamless loop ke liye har set ki copy
    rows.forEach(function (o) {
      // set chhota ho to screen se chauda hone tak repeat karo (gap na dikhe)
      var base = o.set.innerHTML, guard = 0;
      while (o.set.scrollWidth < wrap.clientWidth && guard++ < 40) o.set.insertAdjacentHTML("beforeend", base);
      var clone = o.set.cloneNode(true);
      clone.setAttribute("aria-hidden", "true");
      clone.querySelectorAll("a").forEach(function (a) { a.tabIndex = -1; });
      o.track.appendChild(clone);
      o.track.style.setProperty("--vm-duration", Math.max(30, o.set.scrollWidth / SPEED) + "s");
    });
    box.classList.add("is-running");
  }

  render(); // vendors.js ka static data
  if (window.dataReady && window.dataReady.then) window.dataReady.then(render); // Supabase ka data aane par dobara
  window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(render, 250); });
})();
