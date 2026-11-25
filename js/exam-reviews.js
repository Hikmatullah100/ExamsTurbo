// Customer Reviews moderation (admin dashboard)
// Customers website se review bhejte hain (status = pending). Admin yahan approve / reject / delete karta hai.
// Table: exam_reviews. Ye module apna poora HTML #viewExamReviews ke andar khud banata hai.

const FILTERS = [
  ["pending", "Pending"],
  ["approved", "Approved"],
  ["rejected", "Rejected"],
  ["all", "All"],
];

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const stars = (n) => "★".repeat(n) + "☆".repeat(5 - n);

export function initExamReviews({ sb }) {
  const root = document.getElementById("viewExamReviews");
  let filter = "pending";
  let opened = false;

  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <div>
        <h2 class="h4 mb-1">Customer Reviews</h2>
        <p class="text-secondary mb-0">Approve only genuine, purchase-verified submissions.</p>
      </div>
      <button type="button" class="btn btn-outline-light btn-sm" data-rv-refresh>Refresh</button>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3" data-rv-filters></div>
    <div class="small text-warning mb-2" data-rv-feedback role="status"></div>
    <div data-rv-list></div>`;

  const $ = (selector) => root.querySelector(selector);

  function feedback(message, ok = false) {
    const el = $("[data-rv-feedback]");
    el.textContent = message || "";
    el.className = `small mb-2 ${ok ? "text-success" : "text-warning"}`;
  }

  function renderFilters(pendingCount) {
    $("[data-rv-filters]").innerHTML = FILTERS.map(([key, label]) => {
      const badge =
        key === "pending" && pendingCount > 0
          ? ` <span class="badge text-bg-warning">${pendingCount}</span>`
          : "";
      return `<button type="button" class="btn btn-sm ${filter === key ? "btn-orange" : "btn-outline-light"}" data-rv-filter="${key}">${label}${badge}</button>`;
    }).join("");
  }

  const statusBadge = (status) =>
    ({
      pending: `<span class="badge text-bg-warning">Pending</span>`,
      approved: `<span class="badge text-bg-success">Approved</span>`,
      rejected: `<span class="badge text-bg-secondary">Rejected</span>`,
    })[status] || "";

  function card(r) {
    const exam = r.exams || {};
    const examLabel = [exam.exam_code, exam.name].filter(Boolean).join(" - ") || r.exam_id;
    const contact = r.order_ref
      ? `Order: <strong>${esc(r.order_ref)}</strong>`
      : r.reviewer_email
        ? `Email: <strong>${esc(r.reviewer_email)}</strong>`
        : "";
    const date = new Date(r.created_at).toLocaleString();
    const buttons = [
      r.status !== "approved"
        ? `<button type="button" class="btn btn-sm btn-success" data-rv-action="approved">Approve</button>`
        : "",
      r.status !== "rejected"
        ? `<button type="button" class="btn btn-sm btn-outline-warning" data-rv-action="rejected">Reject</button>`
        : "",
      r.status !== "pending"
        ? `<button type="button" class="btn btn-sm btn-outline-light" data-rv-action="pending">Move to pending</button>`
        : "",
      `<button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-rv-delete>Delete</button>`,
    ].join("");
    return `
      <div class="ec-item mb-3" data-rv-id="${esc(r.id)}">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
          <div>
            <div class="text-warning" aria-label="${r.rating} out of 5 stars">${stars(r.rating)}</div>
            <strong>${esc(r.reviewer_name)}</strong>
            <span class="text-secondary small"> · ${esc(date)}</span>
          </div>
          ${statusBadge(r.status)}
        </div>
        <div class="small text-secondary mb-2">Exam: ${esc(examLabel)}</div>
        ${r.title ? `<h3 class="h6 mb-1">${esc(r.title)}</h3>` : ""}
        <p class="mb-2" style="white-space:pre-line">${esc(r.body)}</p>
        <div class="small mb-2">${contact}</div>
        <div class="d-flex flex-wrap gap-2">${buttons}</div>
      </div>`;
  }

  async function load() {
    feedback("Loading...", true);
    let query = sb
      .from("exam_reviews")
      .select("*, exams(name, exam_code)")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") query = query.eq("status", filter);

    const [list, pending] = await Promise.all([
      query,
      sb
        .from("exam_reviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
    ]);
    if (list.error) {
      console.error("Reviews load failed:", list.error);
      renderFilters(0);
      return feedback(`Could not load reviews: ${list.error.message}`);
    }
    renderFilters(pending.count || 0);
    const rows = list.data || [];
    $("[data-rv-list]").innerHTML = rows.length
      ? rows.map(card).join("")
      : `<div class="ec-empty">No ${filter === "all" ? "" : filter + " "}customer review submissions.</div>`;
    feedback("");
  }

  async function setStatus(id, status) {
    const { error } = await sb
      .from("exam_reviews")
      .update({ status, reviewed_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("Review update failed:", error);
      return feedback(`Could not update: ${error.message}`);
    }
    await load();
    feedback(
      status === "approved"
        ? "Review approved. It is now live on the website."
        : status === "rejected"
          ? "Review rejected."
          : "Review moved to pending.",
      true,
    );
  }

  async function remove(id) {
    if (!confirm("Delete this review permanently?")) return;
    const { error } = await sb.from("exam_reviews").delete().eq("id", id);
    if (error) {
      console.error("Review delete failed:", error);
      return feedback(`Could not delete: ${error.message}`);
    }
    await load();
    feedback("Review deleted.", true);
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-rv-refresh]")) return load();
    const f = event.target.closest("[data-rv-filter]");
    if (f) {
      filter = f.dataset.rvFilter;
      return load();
    }
    const item = event.target.closest("[data-rv-id]");
    if (!item) return;
    const id = item.dataset.rvId;
    const action = event.target.closest("[data-rv-action]");
    if (action) return setStatus(id, action.dataset.rvAction);
    if (event.target.closest("[data-rv-delete]")) return remove(id);
  });

  return {
    async open() {
      root.hidden = false;
      if (!opened) opened = true;
      await load();
    },
    close() {
      root.hidden = true;
    },
    canLeave: () => true,
  };
}
