// Contact Messages (admin dashboard)
// Website ke Contact form se aaye messages (table: contact_messages) yahan dikhte hain.
// Ye module apna poora HTML #viewContactMessages ke andar khud banata hai.

const FILTERS = [
  ["unread", "New"],
  ["read", "Read"],
  ["all", "All"],
];

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

export function initContactMessages({ sb }) {
  const root = document.getElementById("viewContactMessages");
  let filter = "unread";

  root.innerHTML = `
    <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-3">
      <div>
        <h2 class="h4 mb-1">Contact Messages</h2>
        <p class="text-secondary mb-0">Messages sent from the website Contact form.</p>
      </div>
      <button type="button" class="btn btn-outline-light btn-sm" data-cm-refresh>Refresh</button>
    </div>
    <div class="d-flex flex-wrap gap-2 mb-3" data-cm-filters></div>
    <div class="small text-warning mb-2" data-cm-feedback role="status"></div>
    <div data-cm-list></div>`;

  const $ = (selector) => root.querySelector(selector);

  function feedback(message, ok = false) {
    const el = $("[data-cm-feedback]");
    el.textContent = message || "";
    el.className = `small mb-2 ${ok ? "text-success" : "text-warning"}`;
  }

  function renderFilters(unreadCount) {
    $("[data-cm-filters]").innerHTML = FILTERS.map(([key, label]) => {
      const badge =
        key === "unread" && unreadCount > 0
          ? ` <span class="badge text-bg-warning">${unreadCount}</span>`
          : "";
      return `<button type="button" class="btn btn-sm ${filter === key ? "btn-orange" : "btn-outline-light"}" data-cm-filter="${key}">${label}${badge}</button>`;
    }).join("");
  }

  function card(m) {
    const date = m.created_at ? new Date(m.created_at).toLocaleString() : "";
    const subject = m.subject || "";
    const replySubject = encodeURIComponent(`Re: ${subject || "Your message to ExamsTurbo"}`);
    const mailto = m.email ? `mailto:${encodeURIComponent(m.email).replace(/%40/g, "@")}?subject=${replySubject}` : "";
    const badge = m.is_read
      ? `<span class="badge text-bg-secondary">Read</span>`
      : `<span class="badge text-bg-warning">New</span>`;
    return `
      <div class="ec-item mb-3" data-cm-id="${esc(m.id)}">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
          <div>
            <strong>${esc(m.name)}</strong>
            <span class="text-secondary small"> · ${esc(date)}</span>
            <div class="small">${m.email ? `<a href="${esc(mailto)}">${esc(m.email)}</a>` : ""}${m.phone ? ` · ${esc(m.phone)}` : ""}</div>
          </div>
          ${badge}
        </div>
        ${subject ? `<h3 class="h6 mb-1">${esc(subject)}</h3>` : ""}
        <p class="mb-3" style="white-space:pre-line">${esc(m.message)}</p>
        <div class="d-flex flex-wrap gap-2">
          ${mailto ? `<a class="btn btn-sm btn-success" href="${esc(mailto)}">Reply by email</a>` : ""}
          <button type="button" class="btn btn-sm btn-outline-light" data-cm-toggle="${m.is_read ? "unread" : "read"}">${m.is_read ? "Mark as new" : "Mark as read"}</button>
          <button type="button" class="btn btn-sm btn-outline-danger ms-auto" data-cm-delete>Delete</button>
        </div>
      </div>`;
  }

  async function load() {
    feedback("Loading...", true);
    let query = sb
      .from("contact_messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(300);
    if (filter === "unread") query = query.eq("is_read", false);
    if (filter === "read") query = query.eq("is_read", true);

    const [list, unread] = await Promise.all([
      query,
      sb.from("contact_messages").select("id", { count: "exact", head: true }).eq("is_read", false),
    ]);
    if (list.error) {
      console.error("Contact messages load failed:", list.error);
      renderFilters(0);
      return feedback(`Could not load messages: ${list.error.message}`);
    }
    renderFilters(unread.count || 0);
    const rows = list.data || [];
    $("[data-cm-list]").innerHTML = rows.length
      ? rows.map(card).join("")
      : `<div class="ec-empty">No ${filter === "all" ? "" : (filter === "unread" ? "new " : "read ")}messages.</div>`;
    feedback("");
  }

  async function setRead(id, isRead) {
    const { error } = await sb.from("contact_messages").update({ is_read: isRead }).eq("id", id);
    if (error) {
      console.error("Message update failed:", error);
      return feedback(`Could not update: ${error.message}`);
    }
    await load();
  }

  async function remove(id) {
    if (!confirm("Delete this message permanently?")) return;
    const { error } = await sb.from("contact_messages").delete().eq("id", id);
    if (error) {
      console.error("Message delete failed:", error);
      return feedback(`Could not delete: ${error.message}`);
    }
    await load();
    feedback("Message deleted.", true);
  }

  root.addEventListener("click", (event) => {
    if (event.target.closest("[data-cm-refresh]")) return load();
    const f = event.target.closest("[data-cm-filter]");
    if (f) {
      filter = f.dataset.cmFilter;
      return load();
    }
    const item = event.target.closest("[data-cm-id]");
    if (!item) return;
    const id = item.dataset.cmId;
    const t = event.target.closest("[data-cm-toggle]");
    if (t) return setRead(id, t.dataset.cmToggle === "read");
    if (event.target.closest("[data-cm-delete]")) return remove(id);
    // mailto link par click = message ko read mark kar do
    if (event.target.closest('a[href^="mailto:"]')) setRead(id, true);
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
