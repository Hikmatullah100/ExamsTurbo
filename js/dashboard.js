// Admin Dashboard: poori site ka overview (counts + naye messages/reviews + quick actions).
// Ye module apna HTML #viewDashboard ke andar khud banata hai.

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// [kya dikhana hai, table, extra filter, kis section par jaana hai, icon]
const STATS = [
  { id: "ordersAll", label: "Total Orders", sub: "All recorded orders", table: "orders", go: "orders", icon: "fa-bag-shopping" },
  { id: "ordersPaid", label: "Paid Orders", sub: "Successfully paid", table: "orders", eq: ["status", "paid"], go: "orders", icon: "fa-circle-check" },
  { id: "ordersPending", label: "Pending Orders", sub: "Awaiting payment", table: "orders", eq: ["status", "pending"], go: "orders", icon: "fa-clock", warn: true },
  { id: "exams", label: "Total Exams", sub: "Exams in your catalog", table: "exams", go: "exams", icon: "fa-graduation-cap" },
  { id: "vendors", label: "Total Vendors", sub: "Vendors listed", table: "vendors", go: "vendors", icon: "fa-building" },
  { id: "certs", label: "Certifications", sub: "Across all vendors", table: "certifications", go: "vendors", icon: "fa-certificate" },
  { id: "content", label: "Exam Content", sub: "Published exam articles", table: "exam_content", eq: ["status", "published"], go: "exam_content", icon: "fa-file-lines" },
  { id: "reviews", label: "Customer Reviews", sub: "Approved reviews", table: "exam_reviews", eq: ["status", "approved"], go: "exam_reviews", icon: "fa-star" },
  { id: "pendingReviews", label: "Pending Reviews", sub: "Waiting for approval", table: "exam_reviews", eq: ["status", "pending"], go: "exam_reviews", icon: "fa-hourglass-half", warn: true },
  { id: "messages", label: "Contact Messages", sub: "All messages received", table: "contact_messages", go: "contact_messages", icon: "fa-envelope" },
  { id: "unread", label: "New Messages", sub: "Not read yet", table: "contact_messages", eq: ["is_read", false], go: "contact_messages", icon: "fa-envelope-open-text", warn: true },
  { id: "blog", label: "Blog Posts", sub: "All posts", table: "blog_posts", go: "blog_posts", icon: "fa-pen-nib" },
  { id: "posts", label: "Community Posts", sub: "Discussions", table: "community_posts", go: "community_posts", icon: "fa-comments" },
  { id: "subs", label: "Newsletter", sub: "Subscribers", table: "newsletter_subscribers", icon: "fa-paper-plane" },
  { id: "coupons", label: "Coupons", sub: "All coupons", table: "coupons", go: "coupons", icon: "fa-ticket" },
];

const ACTIONS = [
  ["exam_content", "Manage Exam Content", "Create and publish exam articles", "fa-file-lines"],
  ["exam_reviews", "Moderate Reviews", "Approve or reject customer reviews", "fa-star"],
  ["contact_messages", "Contact Messages", "Read and reply to messages", "fa-envelope"],
  ["vendors", "Manage Vendors", "Add or edit vendors and marquee", "fa-building"],
];

export function initDashboard({ sb, go }) {
  const root = document.getElementById("viewDashboard");

  if (!document.getElementById("dash-css")) {
    const st = document.createElement("style");
    st.id = "dash-css";
    st.textContent = `
      .dash-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fill,minmax(210px,1fr))}
      .dash-card{display:block;width:100%;text-align:left;color:inherit;padding:16px 18px;border-radius:14px;
        border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04);transition:border-color .2s,transform .2s}
      button.dash-card{cursor:pointer}
      button.dash-card:hover{border-color:rgba(255,122,0,.6);transform:translateY(-2px)}
      .dash-ico{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;margin-bottom:12px;
        background:rgba(255,122,0,.15);color:#ff9a2e;font-size:17px}
      .dash-card.is-warn .dash-ico{background:rgba(251,191,36,.15);color:#fbbf24}
      .dash-label{font-size:15px;color:#cbd5e1}
      .dash-num{font-size:32px;font-weight:800;line-height:1.15;margin:2px 0}
      .dash-sub{font-size:14px;color:#94a3b8}
      .dash-panel{border:1px solid rgba(255,255,255,.12);border-radius:14px;background:rgba(255,255,255,.04);padding:16px 18px;height:100%}
      .dash-row{padding:10px 0;border-top:1px solid rgba(255,255,255,.08)}
      .dash-row:first-of-type{border-top:0}
    `;
    document.head.appendChild(st);
  }

  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <div>
        <div class="small text-uppercase" style="color:#ff9a2e;letter-spacing:.12em">Overview</div>
        <h2 class="h3 mb-1">Dashboard</h2>
        <p class="text-secondary mb-0">A quick look at everything on your site.</p>
      </div>
      <button type="button" class="btn btn-orange btn-sm" data-d-refresh>Refresh Data</button>
    </div>
    <div class="dash-grid mb-4" data-d-stats></div>
    <div class="row g-3">
      <div class="col-lg-7"><div class="dash-panel">
        <div class="d-flex justify-content-between mb-2"><h3 class="h6 mb-0">Latest Contact Messages</h3>
          <a href="#" class="small" data-d-go="contact_messages">View all</a></div>
        <div data-d-messages class="small text-secondary">Loading...</div>
      </div></div>
      <div class="col-lg-5"><div class="dash-panel">
        <h3 class="h6 mb-2">Quick Actions</h3>
        <div class="d-grid gap-2" data-d-actions></div>
      </div></div>
      <div class="col-12"><div class="dash-panel">
        <div class="d-flex justify-content-between mb-2"><h3 class="h6 mb-0">Reviews Waiting for Approval</h3>
          <a href="#" class="small" data-d-go="exam_reviews">View all</a></div>
        <div data-d-reviews class="small text-secondary">Loading...</div>
      </div></div>
    </div>`;

  const $ = (s) => root.querySelector(s);

  $("[data-d-actions]").innerHTML = ACTIONS.map(
    ([key, title, sub, icon]) => `
      <button type="button" class="dash-card d-flex align-items-center gap-3" data-d-go="${key}">
        <span class="dash-ico mb-0"><i class="fa-solid ${icon}"></i></span>
        <span><strong class="d-block">${esc(title)}</strong><span class="dash-sub">${esc(sub)}</span></span>
      </button>`,
  ).join("");

  async function count(s) {
    let q = sb.from(s.table).select("*", { count: "exact", head: true });
    if (s.eq) q = q.eq(s.eq[0], s.eq[1]);
    const { count: n, error } = await q;
    if (error) {
      console.warn(`Dashboard: ${s.table} count failed:`, error.message);
      return null;
    }
    return n ?? 0;
  }

  function renderStats(values) {
    $("[data-d-stats]").innerHTML = STATS.map((s, i) => {
      const v = values[i];
      const shown = v === null ? "—" : v.toLocaleString();
      const warn = s.warn && v > 0 ? " is-warn" : "";
      const tag = s.go ? "button type=\"button\"" : "div";
      const close = s.go ? "button" : "div";
      return `<${tag} class="dash-card${warn}" ${s.go ? `data-d-go="${s.go}"` : ""}>
        <div class="dash-ico"><i class="fa-solid ${s.icon}"></i></div>
        <div class="dash-label">${esc(s.label)}</div>
        <div class="dash-num">${shown}</div>
        <div class="dash-sub">${esc(s.sub)}</div></${close}>`;
    }).join("");
  }

  async function load() {
    $("[data-d-stats]").innerHTML = `<div class="text-secondary">Loading...</div>`;
    const [values, msgs, revs] = await Promise.all([
      Promise.all(STATS.map(count)),
      sb.from("contact_messages").select("id,name,email,subject,message,created_at,is_read").order("created_at", { ascending: false }).limit(5),
      sb.from("exam_reviews").select("id,reviewer_name,rating,title,body,created_at").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
    ]);
    renderStats(values);

    $("[data-d-messages]").innerHTML = msgs.error
      ? `<span class="text-warning">Could not load messages.</span>`
      : (msgs.data || []).length
        ? msgs.data.map((m) => `
            <div class="dash-row">
              <div><strong class="text-light">${esc(m.name)}</strong> ${m.is_read ? "" : '<span class="badge text-bg-warning ms-1">New</span>'}
                <span class="ms-2">${m.created_at ? esc(new Date(m.created_at).toLocaleDateString()) : ""}</span></div>
              <div class="text-truncate">${esc(m.subject || m.message)}</div>
            </div>`).join("")
        : "No messages yet.";

    $("[data-d-reviews]").innerHTML = revs.error
      ? `<span class="text-warning">Could not load reviews.</span>`
      : (revs.data || []).length
        ? revs.data.map((r) => `
            <div class="dash-row">
              <div><strong class="text-light">${esc(r.reviewer_name)}</strong>
                <span class="text-warning ms-2">${"★".repeat(r.rating || 0)}</span></div>
              <div class="text-truncate">${esc(r.title || r.body)}</div>
            </div>`).join("")
        : "No reviews waiting. All caught up.";
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-d-refresh]")) return load();
    const g = event.target.closest("[data-d-go]");
    if (g) {
      event.preventDefault();
      go(g.dataset.dGo);
    }
  });

  return {
    async open() {
      root.hidden = false;
      await load();
    },
    close() {
      root.hidden = true;
    },
    canLeave: () => true,
  };
}
