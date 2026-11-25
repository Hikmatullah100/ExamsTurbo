// Orders (admin dashboard): PayPal se aaye orders. Table: orders + order_items.
// Ye module apna HTML #viewOrders ke andar khud banata hai.

const FILTERS = [
  ["paid", "Paid"],
  ["pending", "Pending"],
  ["failed", "Failed"],
  ["refunded", "Refunded"],
  ["all", "All"],
];

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const money = (n, cur = "USD") => `${cur === "USD" ? "$" : cur + " "}${Number(n || 0).toFixed(2)}`;

export function initOrders({ sb }) {
  const root = document.getElementById("viewOrders");
  let filter = "paid";

  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <div>
        <h2 class="h4 mb-1">Orders</h2>
        <p class="text-secondary mb-0">Customer orders paid through PayPal.</p>
      </div>
      <button type="button" class="btn btn-outline-light btn-sm" data-o-refresh>Refresh</button>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3" data-o-filters></div>
    <div class="small text-warning mb-2" data-o-feedback role="status"></div>
    <div data-o-list></div>`;

  const $ = (s) => root.querySelector(s);

  function feedback(message, ok = false) {
    const el = $("[data-o-feedback]");
    el.textContent = message || "";
    el.className = `small mb-2 ${ok ? "text-success" : "text-warning"}`;
  }

  function renderFilters() {
    $("[data-o-filters]").innerHTML = FILTERS.map(
      ([key, label]) =>
        `<button type="button" class="btn btn-sm ${filter === key ? "btn-orange" : "btn-outline-light"}" data-o-filter="${key}">${label}</button>`,
    ).join("");
  }

  const badge = (s) =>
    ({
      paid: `<span class="badge text-bg-success">Paid</span>`,
      pending: `<span class="badge text-bg-warning">Pending</span>`,
      failed: `<span class="badge text-bg-danger">Failed</span>`,
      refunded: `<span class="badge text-bg-secondary">Refunded</span>`,
    })[s] || esc(s);

  function card(o) {
    const items = (o.order_items || [])
      .map((i) => `<li>${esc(i.exam_name)}${i.vendor_name ? ` <span class="text-secondary">(${esc(i.vendor_name)})</span>` : ""} × ${i.quantity} — ${money(i.unit_price * i.quantity, o.currency)}</li>`)
      .join("");
    const mailto = `mailto:${encodeURIComponent(o.customer_email).replace(/%40/g, "@")}?subject=${encodeURIComponent("Your ExamsTurbo order " + o.order_number)}`;
    return `
      <div class="ec-item mb-3" data-o-id="${esc(o.id)}">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
          <div>
            <strong>${esc(o.order_number)}</strong>
            <span class="text-secondary small"> · ${esc(new Date(o.created_at).toLocaleString())}</span>
            <div class="small"><a href="${esc(mailto)}">${esc(o.customer_email)}</a>${o.payer_email && o.payer_email !== o.customer_email ? ` · PayPal: ${esc(o.payer_email)}` : ""}</div>
          </div>
          <div class="text-end">${badge(o.status)}<div class="fw-bold mt-1">${money(o.total, o.currency)}</div></div>
        </div>
        <ul class="small mb-2">${items || "<li>No items</li>"}</ul>
        ${o.paypal_capture_id ? `<div class="small text-secondary mb-2">PayPal capture: ${esc(o.paypal_capture_id)}</div>` : ""}
        <div class="d-flex flex-wrap gap-2">
          <a class="btn btn-sm btn-success" href="${esc(mailto)}">Email customer</a>
          ${o.status === "paid" ? `<button type="button" class="btn btn-sm btn-outline-warning" data-o-status="refunded">Mark refunded</button>` : ""}
          ${o.status !== "paid" ? `<button type="button" class="btn btn-sm btn-outline-light" data-o-status="paid">Mark paid</button>` : ""}
          <button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-o-delete>Delete</button>
        </div>
      </div>`;
  }

  async function load() {
    feedback("Loading...", true);
    renderFilters();
    let q = sb.from("orders").select("*, order_items(*)").order("created_at", { ascending: false }).limit(200);
    if (filter !== "all") q = q.eq("status", filter);
    const { data, error } = await q;
    if (error) {
      console.error("Orders load failed:", error);
      return feedback(`Could not load orders: ${error.message}`);
    }
    $("[data-o-list]").innerHTML = (data || []).length
      ? data.map(card).join("")
      : `<div class="ec-empty">No ${filter === "all" ? "" : filter + " "}orders yet.</div>`;
    feedback("");
  }

  async function setStatus(id, status) {
    if (status === "paid" && !confirm("Mark this order as paid manually? Do this only if you confirmed the payment in PayPal.")) return;
    const patch = { status };
    if (status === "paid") patch.paid_at = new Date().toISOString();
    const { error } = await sb.from("orders").update(patch).eq("id", id);
    if (error) return feedback(`Could not update: ${error.message}`);
    await load();
    feedback("Order updated.", true);
  }

  async function remove(id) {
    if (!confirm("Delete this order permanently?")) return;
    const { error } = await sb.from("orders").delete().eq("id", id);
    if (error) return feedback(`Could not delete: ${error.message}`);
    await load();
    feedback("Order deleted.", true);
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-o-refresh]")) return load();
    const f = event.target.closest("[data-o-filter]");
    if (f) {
      filter = f.dataset.oFilter;
      return load();
    }
    const item = event.target.closest("[data-o-id]");
    if (!item) return;
    const id = item.dataset.oId;
    const s = event.target.closest("[data-o-status]");
    if (s) return setStatus(id, s.dataset.oStatus);
    if (event.target.closest("[data-o-delete]")) return remove(id);
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
