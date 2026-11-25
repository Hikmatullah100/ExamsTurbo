// Admin dashboard: Supabase login + admin check + add/edit/delete screens.
// Real protection comes from the database RLS policies (is_admin()); this page is only the interface.
import { supabaseClient as sb } from "./supabase.js";
import { initExamContent } from "./exam-content.js";
import { initExamReviews } from "./exam-reviews.js";
import { initContactMessages } from "./contact-messages.js";
import { initDashboard } from "./dashboard.js";
import { initOrders } from "./orders.js";

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const BUCKET = "blog-covers";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const TOPICS = ["Study Tips", "Cloud", "Cybersecurity", "Career Advice"];
const KINDS = ["info", "sale", "warning"];

function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

const toggle = (field, onLabel, offLabel) => [
  { label: onLabel, when: (r) => !r[field], patch: { [field]: true } },
  { label: offLabel, when: (r) => !!r[field], patch: { [field]: false } },
];

// Typing in the source fields fills the target fields (like id/slug)
// until the admin edits a target by hand.
function autoFill(sources, targets, build) {
  const targetEls = targets.map((n) => $(`f_${n}`));
  const run = () => {
    const value = build(...sources.map((n) => $(`f_${n}`).value));
    targetEls.forEach((el) => {
      if (!el.dataset.touched) el.value = value;
    });
  };
  sources.forEach((n) => {
    const el = $(`f_${n}`);
    el.addEventListener("input", run);
    el.addEventListener("change", run);
  });
  targetEls.forEach((el) =>
    el.addEventListener("input", () => (el.dataset.touched = "1")),
  );
}

/* =====================================================
   SECTIONS: the layout of every screen is defined here
   fields: form inputs | cols: table columns
   ===================================================== */
const SECTIONS = [
  {
    key: "vendors",
    label: "Vendors",
    hint: "Certification vendors (for example, AACE International).",
    table: "vendors",
    order: ["name", true],
    canCreate: true,
    cols: [["name", "Name"], ["id", "ID"], ["categories", "Categories"], ["show_in_marquee", "Marquee"], ["official_url", "Website"]],
    fields: [
      { name: "name", label: "Vendor name", type: "text", required: true },
      { name: "id", label: "Vendor ID", type: "text", required: true, readonlyOnEdit: true, hint: "Lowercase letters and dashes, e.g. aace-international. Cannot be changed after creation." },
      { name: "sort_name", label: "Sort name", type: "text", hint: "Used for the A-Z filter. If empty, the name is used." },
      { name: "official_url", label: "Official website", type: "text", hint: "https://..." },
      { name: "logo_url", label: "Logo", type: "image", folder: "vendor" },
      { name: "logo_text", label: "Logo text", type: "text", hint: "Shown when the logo is missing or fails to load." },
      { name: "categories", label: "Categories", type: "array", hint: "Separate with commas." },
      { name: "description", label: "Description", type: "textarea", rows: 4 },
      { name: "show_in_marquee", label: "Show in home page marquee", type: "checkbox", hint: "Tick karne par ye vendor home page ke sliding marquee mein aayega." },
    ],
    onOpen: (row) => {
      if (!row) autoFill(["name"], ["id"], slugify);
    },
  },
  {
    key: "exams",
    label: "Exams",
    hint: "Add and manage exams here. They appear on the website automatically.",
    table: "exams",
    order: ["name", true],
    canCreate: true,
    cols: [["name", "Exam"], ["vendor_id", "Vendor"], ["exam_code", "Code"], ["price", "Price"], ["is_published", "Published"], ["updated_year", "Year"]],
    quick: toggle("is_published", "Publish", "Unpublish"),
    fields: [
      { name: "vendor_id", label: "Vendor", type: "select", required: true, optionsFrom: { table: "vendors", value: "id", label: "name" }, hint: "Create the vendor first in the Vendors screen." },
      { name: "exam_code", label: "Exam code", type: "text", required: true, hint: "For example PSP, CCP, SAA-C03." },
      { name: "name", label: "Exam title", type: "text", required: true, hint: "For example Planning & Scheduling Professional (PSP) Exam." },
      { name: "id", label: "Exam ID", type: "text", required: true, readonlyOnEdit: true, hint: "Generated from vendor + code. Cannot be changed after creation." },
      { name: "slug", label: "Slug", type: "text", hint: "If empty, the ID is used as the slug." },
      { name: "short_description", label: "Short description (shown on the card)", type: "textarea", rows: 2 },
      { name: "detail_description", label: "Detail description", type: "textarea", rows: 4 },
      { name: "question_count", label: "Question count", type: "text", hint: "For example 120+ Questions." },
      { name: "price", label: "Price ($)", type: "number", required: true, min: 0 },
      { name: "updated_year", label: "Updated year", type: "text", hint: "If empty, defaults to 2026." },
      { name: "access_type", label: "Access type", type: "text", hint: "If empty, defaults to Instant Access." },
      { name: "cover_image", label: "Cover image", type: "image", folder: "exam" },
      { name: "is_published", label: "Published (visible on the website)", type: "checkbox", default: true },
    ],
    onOpen: (row) => {
      if (!row)
        autoFill(["vendor_id", "exam_code"], ["id", "slug"], (v, c) =>
          slugify(`${v} ${c}`),
        );
    },
  },
  {
    key: "community_posts",
    label: "Community posts",
    hint: "Approve new posts, edit them, or delete them.",
    table: "community_posts",
    order: ["created_at", false],
    canCreate: false,
    cols: [["title", "Title"], ["topic", "Topic"], ["author_name", "Author"], ["is_approved", "Approved"], ["created_at", "Created"]],
    quick: toggle("is_approved", "Approve", "Unapprove"),
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 120 },
      { name: "topic", label: "Topic", type: "select", options: TOPICS, required: true },
      { name: "details", label: "Details", type: "textarea", rows: 5, required: true },
      { name: "is_approved", label: "Approved (visible to everyone)", type: "checkbox" },
    ],
  },
  {
    key: "community_replies",
    label: "Community replies",
    hint: "Hide wrong replies or delete them.",
    table: "community_replies",
    order: ["created_at", false],
    canCreate: false,
    cols: [["body", "Reply"], ["author_name", "Author"], ["is_approved", "Visible"], ["created_at", "Created"]],
    quick: toggle("is_approved", "Show", "Hide"),
    fields: [
      { name: "body", label: "Reply", type: "textarea", rows: 4, required: true },
      { name: "is_approved", label: "Visible (shown to everyone)", type: "checkbox" },
    ],
  },
  {
    key: "blog_posts",
    label: "Blog posts",
    hint: "Write articles, upload a cover image, publish or keep as a draft.",
    table: "blog_posts",
    order: ["published_at", false],
    canCreate: true,
    cols: [["title", "Title"], ["category", "Category"], ["is_published", "Published"], ["is_featured", "Featured"], ["published_at", "Date"]],
    quick: toggle("is_published", "Publish", "Unpublish"),
    fields: [
      { name: "title", label: "Title", type: "text", required: true },
      { name: "slug", label: "Slug (URL part)", type: "text", required: true, hint: "Lowercase letters with dashes, e.g. cloud-basics. Generated from the title." },
      { name: "excerpt", label: "Excerpt (short line on the card)", type: "textarea", rows: 2, required: true },
      { name: "content", label: "Content", type: "textarea", rows: 10, required: true, hint: "Leave an empty line between paragraphs." },
      { name: "category", label: "Category", type: "text", required: true, hint: "For example Cloud Computing. The filter pills are built from this." },
      { name: "cover_image", label: "Cover image", type: "image", folder: "blog" },
      { name: "author", label: "Author", type: "text", hint: "If empty, ExamsTurbo Team is used." },
      { name: "is_featured", label: "Featured", type: "checkbox" },
      { name: "is_published", label: "Published (visible on the website)", type: "checkbox", default: true },
      { name: "published_at", label: "Publish date", type: "datetime", omitEmpty: true, hint: "If empty, the current date is used." },
    ],
    onOpen: (row) => {
      if (!row) autoFill(["title"], ["slug"], slugify);
    },
  },
  {
    key: "coupons",
    label: "Coupons",
    hint: "Discount codes. Customers can only check their own code; the list is not public.",
    table: "coupons",
    order: ["created_at", false],
    canCreate: true,
    cols: [["code", "Code"], ["discount_type", "Type"], ["discount_value", "Value"], ["min_order_amount", "Min order"], ["used_count", "Used"], ["max_uses", "Max uses"], ["expires_at", "Expires"], ["is_active", "Active"]],
    quick: toggle("is_active", "Enable", "Disable"),
    fields: [
      { name: "code", label: "Code", type: "text", required: true, transform: "upper", hint: "Uppercase letters, numbers and dashes, 3 to 30 characters. For example EXAMS10." },
      { name: "description", label: "Description (internal note)", type: "text" },
      { name: "discount_type", label: "Discount type", type: "select", options: ["percent", "fixed"], required: true },
      { name: "discount_value", label: "Discount value", type: "number", required: true, hint: "For percent, 10 means 10%. For fixed, 5 means $5 off." },
      { name: "min_order_amount", label: "Minimum order amount", type: "number", omitEmpty: true, hint: "Empty means no minimum (0)." },
      { name: "max_uses", label: "Max uses", type: "number", hint: "Empty means unlimited." },
      { name: "starts_at", label: "Starts at", type: "datetime" },
      { name: "expires_at", label: "Expires at", type: "datetime" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "announcements",
    label: "Announcements",
    hint: "The bar at the top of the website. When one is active, it replaces the default bar text.",
    table: "announcements",
    order: ["sort_order", true],
    canCreate: true,
    cols: [["message", "Message"], ["kind", "Kind"], ["sort_order", "Order"], ["is_active", "Active"], ["starts_at", "Starts"], ["ends_at", "Ends"]],
    quick: toggle("is_active", "Enable", "Disable"),
    fields: [
      { name: "message", label: "Message", type: "text", required: true, max: 200 },
      { name: "kind", label: "Kind (color)", type: "select", options: KINDS, required: true },
      { name: "link_text", label: "Link text", type: "text", hint: "For example Shop Now (optional)." },
      { name: "link_url", label: "Link URL", type: "text", hint: "For example /vendors/ or https://..." },
      { name: "sort_order", label: "Order (lower number first)", type: "number", omitEmpty: true },
      { name: "starts_at", label: "Starts at", type: "datetime" },
      { name: "ends_at", label: "Ends at", type: "datetime" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
  {
    key: "sale_popups",
    label: "Sale popups",
    hint: "An offer popup shown a few seconds after the page loads.",
    table: "sale_popups",
    order: ["created_at", false],
    canCreate: true,
    cols: [["title", "Title"], ["coupon_code", "Coupon"], ["pages", "Pages"], ["is_active", "Active"], ["starts_at", "Starts"], ["ends_at", "Ends"]],
    quick: toggle("is_active", "Enable", "Disable"),
    fields: [
      { name: "title", label: "Title", type: "text", required: true, max: 100 },
      { name: "body", label: "Text", type: "textarea", rows: 3, hint: "Up to 300 characters." },
      { name: "image_url", label: "Image", type: "image", folder: "popup" },
      { name: "coupon_code", label: "Coupon code (shown in the popup)", type: "text", transform: "upper" },
      { name: "button_text", label: "Button text", type: "text" },
      { name: "button_url", label: "Button URL", type: "text" },
      { name: "delay_seconds", label: "Show after (seconds)", type: "number", omitEmpty: true },
      { name: "show_again_after_days", label: "Show again after (days)", type: "number", omitEmpty: true, hint: "0 means on every visit." },
      { name: "pages", label: "Pages", type: "array", lower: true, hint: "Comma separated: home, vendors, blog, community, about, contact. Empty means all pages." },
      { name: "starts_at", label: "Starts at", type: "datetime" },
      { name: "ends_at", label: "Ends at", type: "datetime" },
      { name: "is_active", label: "Active", type: "checkbox", default: true },
    ],
  },
];

/* ---------------- state ---------------- */
let currentUserId = null;
let section = SECTIONS[0];
let rows = [];
let editing = null;
let optionCache = {};
const formModal = new bootstrap.Modal($("formModal"));

// Left menu: Exam Content sits right after Exams
const NAV = [
  { key: "dashboard", label: "Dashboard" },
  { key: "orders", label: "Orders" },
  ...SECTIONS.slice(0, 2),
  { key: "exam_content", label: "Exam Content" },
  { key: "exam_reviews", label: "Customer Reviews" },
  { key: "contact_messages", label: "Contact Messages" },
  ...SECTIONS.slice(2),
];
let activeKey = "dashboard";
const examContent = initExamContent({ sb, bucket: BUCKET });
const examReviews = initExamReviews({ sb });
const contactMessages = initContactMessages({ sb });
const orders = initOrders({ sb });
const dashboard = initDashboard({ sb, go: (key) => selectSection(key) });

/* ---------------- helpers ---------------- */
const pad = (n) => String(n).padStart(2, "0");
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromLocalInput = (value) => (value ? new Date(value).toISOString() : null);

function notice(message) {
  $("pageNotice").textContent = message || "";
}

function showView(name) {
  $("viewLogin").hidden = name !== "login";
  $("viewDenied").hidden = name !== "denied";
  $("viewApp").hidden = name !== "app";
}

// Options for a select input (a static list, or rows from a table such as vendors)
async function resolveOptions(f) {
  if (f.optionsFrom) {
    const { table, value, label } = f.optionsFrom;
    if (!optionCache[table]) {
      const { data, error } = await sb.from(table).select(`${value},${label}`).order(label);
      if (error) throw error;
      optionCache[table] = (data || []).map((r) => ({
        value: r[value],
        label: `${r[label]} (${r[value]})`,
      }));
    }
    return optionCache[table];
  }
  return (f.options || []).map((o) => ({ value: o, label: o }));
}

/* ---------------- auth ---------------- */
async function checkAdmin() {
  const { data, error } = await sb.rpc("is_admin");
  if (error) {
    console.error("is_admin failed:", error);
    return false;
  }
  return data === true;
}

async function routeByAuth(user) {
  currentUserId = user?.id || null;
  if (!user) return showView("login");
  if (!(await checkAdmin())) return showView("denied");
  showView("app");
  buildNav();
  await selectSection(activeKey);
}

$("loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedback = $("loginFeedback");
  feedback.textContent = "Please wait...";
  const { error } = await sb.auth.signInWithPassword({
    email: $("loginEmail").value.trim(),
    password: $("loginPassword").value,
  });
  feedback.textContent = error ? error.message : "";
});

document.querySelectorAll("[data-logout]").forEach((button) => {
  button.addEventListener("click", () => sb.auth.signOut());
});

/* ---------------- navigation ---------------- */
function buildNav() {
  $("adminNav").innerHTML = NAV.map(
    (s) =>
      `<button type="button" data-section="${s.key}" class="${s.key === activeKey ? "active" : ""}">${esc(s.label)}</button>`,
  ).join("");
}

$("adminNav").addEventListener("click", (event) => {
  const button = event.target.closest("[data-section]");
  if (button) selectSection(button.dataset.section);
});

async function selectSection(key) {
  if (activeKey === "exam_content" && key !== "exam_content" && !examContent.canLeave()) {
    return; // stay on the editor (unsaved changes)
  }
  activeKey = key;
  document
    .querySelectorAll("#adminNav [data-section]")
    .forEach((b) => b.classList.toggle("active", b.dataset.section === key));

  if (key === "exam_content") {
    $("viewSection").hidden = true;
    examReviews.close();
    contactMessages.close();
    dashboard.close();
    orders.close();
    await examContent.open();
    return;
  }
  if (key === "exam_reviews") {
    $("viewSection").hidden = true;
    examContent.close();
    contactMessages.close();
    dashboard.close();
    orders.close();
    await examReviews.open();
    return;
  }
  if (key === "dashboard") {
    $("viewSection").hidden = true;
    examContent.close();
    examReviews.close();
    contactMessages.close();
    orders.close();
    await dashboard.open();
    return;
  }
  if (key === "orders") {
    $("viewSection").hidden = true;
    examContent.close();
    examReviews.close();
    contactMessages.close();
    dashboard.close();
    await orders.open();
    return;
  }
  if (key === "contact_messages") {
    $("viewSection").hidden = true;
    examContent.close();
    examReviews.close();
    dashboard.close();
    orders.close();
    await contactMessages.open();
    return;
  }
  examContent.close();
  examReviews.close();
  contactMessages.close();
  dashboard.close();
  orders.close();
  $("viewSection").hidden = false;
  section = SECTIONS.find((s) => s.key === key) || SECTIONS[0];
  $("sectionTitle").textContent = section.label;
  $("sectionHint").textContent = section.hint;
  $("addNew").hidden = !section.canCreate;
  await loadRows();
}

/* ---------------- table ---------------- */
async function loadRows() {
  notice("");
  $("tableBody").innerHTML = "";
  $("tableEmpty").hidden = true;
  const [orderBy, ascending] = section.order;
  const { data, error } = await sb
    .from(section.table)
    .select("*")
    .order(orderBy, { ascending });
  if (error) {
    console.error("Load failed:", error);
    notice(`Data could not be loaded: ${error.message}`);
    return;
  }
  rows = data || [];
  renderTable();
}

function cellText(key, value) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean")
    return value
      ? '<span class="badge text-bg-success">Yes</span>'
      : '<span class="badge text-bg-secondary">No</span>';
  if (Array.isArray(value)) return esc(value.join(", ")) || "—";
  if (key.endsWith("_at")) return esc(new Date(value).toLocaleString());
  return `<div class="adm-trunc" title="${esc(value)}">${esc(value)}</div>`;
}

function renderTable() {
  $("tableHead").innerHTML = `<tr>${section.cols.map(([, label]) => `<th>${esc(label)}</th>`).join("")}<th class="text-end">Actions</th></tr>`;
  $("tableEmpty").hidden = rows.length > 0;
  $("tableBody").innerHTML = rows
    .map((row) => {
      const quick = (section.quick || [])
        .map((q, i) => (q.when(row) ? `<button type="button" class="btn btn-sm btn-outline-light" data-quick="${i}">${esc(q.label)}</button>` : ""))
        .join(" ");
      return `<tr data-id="${esc(row.id)}">
        ${section.cols.map(([key]) => `<td>${cellText(key, row[key])}</td>`).join("")}
        <td class="text-end text-nowrap">
          ${quick}
          <button type="button" class="btn btn-sm btn-outline-info" data-edit>Edit</button>
          <button type="button" class="btn btn-sm btn-outline-danger" data-delete>Delete</button>
        </td>
      </tr>`;
    })
    .join("");
}

$("tableBody").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  const tr = event.target.closest("tr[data-id]");
  if (!button || !tr) return;
  const row = rows.find((r) => String(r.id) === tr.dataset.id);
  if (!row) return;

  if (button.hasAttribute("data-edit")) return openForm(row);

  if (button.hasAttribute("data-delete")) {
    if (!confirm("Delete this permanently? This cannot be undone.")) return;
    const { error } = await sb.from(section.table).delete().eq("id", row.id);
    if (error) return notice(`Delete failed: ${error.message}`);
    optionCache = {};
    return loadRows();
  }

  if (button.dataset.quick !== undefined) {
    const quick = section.quick[Number(button.dataset.quick)];
    const { error } = await sb.from(section.table).update(quick.patch).eq("id", row.id);
    if (error) return notice(`Update failed: ${error.message}`);
    return loadRows();
  }
});

$("addNew").addEventListener("click", () => openForm(null));

/* ---------------- form ---------------- */
function fieldHTML(f, value, ctx) {
  const id = `f_${f.name}`;
  const hint = f.hint ? `<div class="form-text">${esc(f.hint)}</div>` : "";
  const req = f.required ? "required" : "";
  const label = `<label class="form-label" for="${id}">${esc(f.label)}${f.required ? " *" : ""}</label>`;
  const v = value ?? "";
  const locked = ctx.isEdit && f.readonlyOnEdit ? "disabled" : "";

  switch (f.type) {
    case "checkbox":
      return `<div class="form-check form-switch mb-3">
        <input class="form-check-input" type="checkbox" id="${id}" ${value ? "checked" : ""}>
        <label class="form-check-label" for="${id}">${esc(f.label)}</label>${hint}</div>`;
    case "textarea":
      return `<div class="mb-3">${label}<textarea class="form-control" id="${id}" rows="${f.rows || 3}" ${req}>${esc(v)}</textarea>${hint}</div>`;
    case "select": {
      const options = ctx.opts[f.name] || [];
      const placeholder =
        f.optionsFrom && !v
          ? '<option value="" disabled selected hidden>Choose...</option>'
          : "";
      return `<div class="mb-3">${label}<select class="form-select" id="${id}" ${req}>${placeholder}${options
        .map(
          (o) =>
            `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? "selected" : ""}>${esc(o.label)}</option>`,
        )
        .join("")}</select>${hint}</div>`;
    }
    case "number":
      return `<div class="mb-3">${label}<input class="form-control" id="${id}" type="number" step="any" ${f.min !== undefined ? `min="${f.min}"` : ""} value="${esc(v)}" ${req}>${hint}</div>`;
    case "datetime":
      return `<div class="mb-3">${label}<input class="form-control" id="${id}" type="datetime-local" value="${esc(toLocalInput(value))}" ${req}>${hint}</div>`;
    case "array":
      return `<div class="mb-3">${label}<input class="form-control" id="${id}" type="text" value="${esc(Array.isArray(value) ? value.join(", ") : "")}">${hint}</div>`;
    case "image":
      return `<div class="mb-3">${label}
        <input class="form-control mb-2" id="${id}" type="text" value="${esc(v)}" placeholder="Image link, or upload a file below">
        <input class="form-control" type="file" accept="image/jpeg,image/png,image/webp" data-upload-for="${f.name}" data-folder="${f.folder || "misc"}">
        <img id="prev_${f.name}" class="mt-2 rounded" style="max-height:120px; ${v ? "" : "display:none"}" src="${esc(v)}" alt="">
        <div class="form-text" id="up_${f.name}">JPG, PNG or WebP, up to 2 MB.${f.hint ? " " + esc(f.hint) : ""}</div></div>`;
    default:
      return `<div class="mb-3">${label}<input class="form-control" id="${id}" type="text" value="${esc(v)}" ${f.max ? `maxlength="${f.max}"` : ""} ${req} ${locked}>${hint}</div>`;
  }
}

async function openForm(row) {
  editing = row;
  const opts = {};
  try {
    for (const f of section.fields) {
      if (f.type === "select") opts[f.name] = await resolveOptions(f);
    }
  } catch (error) {
    console.error("Options load failed:", error);
    return notice(`Could not load dropdown options: ${error.message}`);
  }
  const ctx = { isEdit: !!row, opts };
  $("formTitle").textContent = `${row ? "Edit" : "Add"}: ${section.label}`;
  $("formFeedback").textContent = "";
  $("formBody").innerHTML = section.fields
    .map((f) => fieldHTML(f, row ? row[f.name] : f.default, ctx))
    .join("");
  if (section.onOpen) section.onOpen(row);
  formModal.show();
}

// Image upload (Supabase Storage)
$("formBody").addEventListener("change", async (event) => {
  const input = event.target.closest("[data-upload-for]");
  if (!input || !input.files.length) return;
  const name = input.dataset.uploadFor;
  const status = $(`up_${name}`);
  const file = input.files[0];
  if (file.size > MAX_IMAGE_BYTES) {
    status.textContent = "Image is larger than 2 MB. Choose a smaller one.";
    input.value = "";
    return;
  }
  status.textContent = "Uploading...";
  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
  const path = `${input.dataset.folder}/${Date.now()}-${safeName}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) {
    console.error("Upload failed:", error);
    status.textContent = `Upload failed: ${error.message}`;
    return;
  }
  const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
  $(`f_${name}`).value = data.publicUrl;
  const preview = $(`prev_${name}`);
  preview.src = data.publicUrl;
  preview.style.display = "";
  status.textContent = "Upload complete. Now click Save.";
});

function collect() {
  const out = {};
  section.fields.forEach((f) => {
    const el = $(`f_${f.name}`);
    if (!el || el.disabled) return;
    if (f.type === "checkbox") {
      out[f.name] = el.checked;
      return;
    }
    let v = el.value.trim();
    if (v === "") {
      if (f.omitEmpty) return;
      out[f.name] = null;
      return;
    }
    if (f.type === "number") v = Number(v);
    else if (f.type === "datetime") v = fromLocalInput(v);
    else if (f.type === "array") {
      const list = v
        .split(",")
        .map((s) => (f.lower ? s.trim().toLowerCase() : s.trim()))
        .filter(Boolean);
      v = list.length ? list : null;
    } else if (f.transform === "upper") v = v.toUpperCase();
    out[f.name] = v;
  });
  return out;
}

$("recordForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const feedback = $("formFeedback");
  const saveBtn = $("saveBtn");
  feedback.textContent = "Saving...";
  saveBtn.disabled = true;
  try {
    const payload = collect();
    let result;
    if (editing) {
      result = await sb.from(section.table).update(payload).eq("id", editing.id);
    } else {
      // For new rows, leave empty (null) fields out so the database defaults apply
      const clean = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== null),
      );
      result = await sb.from(section.table).insert(clean);
    }
    if (result.error) throw result.error;
    optionCache = {};
    formModal.hide();
    await loadRows();
  } catch (error) {
    console.error("Save failed:", error);
    feedback.textContent = error.message || "Save failed.";
  } finally {
    saveBtn.disabled = false;
  }
});

/* ---------------- start ---------------- */
sb.auth.onAuthStateChange((_event, session) => {
  const id = session?.user?.id || null;
  if (id === currentUserId) return;
  // Do not await inside the Supabase auth callback
  setTimeout(() => routeByAuth(session?.user || null), 0);
});

const {
  data: { session },
} = await sb.auth.getSession();
await routeByAuth(session?.user || null);
