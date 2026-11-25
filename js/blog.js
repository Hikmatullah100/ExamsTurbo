// Blog: posts Supabase (blog_posts table) se aate hain.
// blog.html par list + category filter, blog-post.html par poora article.
import { supabaseClient as sb } from "./supabase.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

function iconFor(category = "") {
  const c = category.toLowerCase();
  if (c.includes("cloud")) return "fa-cloud";
  if (c.includes("secur")) return "fa-shield-halved";
  if (c.includes("career")) return "fa-briefcase";
  if (c.includes("study")) return "fa-book-open";
  return "fa-compass";
}

const fallbackCover = (post) =>
  `<div class="blogx-cover-art"><i class="fa-solid ${iconFor(post.category)}"></i></div>`;

const coverHTML = (post) =>
  post.cover_image
    ? `<img src="${esc(post.cover_image)}" alt="${esc(post.title)}" loading="lazy" decoding="async" data-cover>`
    : fallbackCover(post);

const metaLine = (post) =>
  `<time datetime="${esc(post.published_at)}">${esc(fmtDate(post.published_at))}</time>${
    post.author ? ` · ${esc(post.author)}` : ""
  }`;

/* ---------------- LIST PAGE ---------------- */
async function initList() {
  const grid = document.getElementById("blogGrid");
  const filters = document.getElementById("blogFilters");
  if (!grid || !filters) return;

  let posts = [];
  let active = "All";

  function renderFilters() {
    const categories = ["All", ...new Set(posts.map((p) => p.category))];
    filters.innerHTML = categories
      .map(
        (c) =>
          `<button type="button" class="category-filter-btn ${c === active ? "active" : ""}" data-category="${esc(c)}" aria-pressed="${c === active}">${esc(c)}</button>`,
      )
      .join("");
  }

  function renderGrid() {
    const shown =
      active === "All" ? posts : posts.filter((p) => p.category === active);
    grid.innerHTML = shown.length
      ? shown
          .map(
            (p) => `
        <a class="blogx-card" href="blog-post.html?slug=${encodeURIComponent(p.slug)}" aria-label="Read ${esc(p.title)}">
          <div class="blogx-cover">${coverHTML(p)}<span class="blogx-tag">${esc(p.category)}</span></div>
          <div class="blogx-body">
            <h3>${esc(p.title)}</h3>
            <p>${esc(p.excerpt)}</p>
            <div class="blogx-meta">${metaLine(p)}</div>
          </div>
        </a>`,
          )
          .join("")
      : `<p class="blogx-status">No articles in this category yet.</p>`;
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    active = button.dataset.category;
    renderFilters();
    renderGrid();
  });

  // Agar cover image load na ho to default art dikhao
  grid.addEventListener(
    "error",
    (event) => {
      const img = event.target;
      if (img.tagName !== "IMG" || img.dataset.cover === undefined) return;
      const art = document.createElement("div");
      art.className = "blogx-cover-art";
      art.innerHTML = '<i class="fa-solid fa-book-open"></i>';
      img.replaceWith(art);
    },
    true,
  );

  const { data, error } = await sb
    .from("blog_posts")
    .select("slug,title,excerpt,category,cover_image,author,published_at")
    .eq("is_published", true)
    .order("published_at", { ascending: false });

  if (error) {
    console.error("Blog load failed:", error);
    grid.innerHTML = `<p class="blogx-status">Articles could not be loaded right now. Please try again later.</p>`;
    return;
  }
  posts = data || [];
  renderFilters();
  renderGrid();
}

/* ---------------- ARTICLE PAGE ---------------- */
async function initPost() {
  const root = document.getElementById("postContent");
  if (!root) return;

  const slug = new URLSearchParams(window.location.search).get("slug");
  const notFound = () => {
    document.title = "Article Not Found | ExamsTurbo";
    root.innerHTML = `
      <div class="blogx-status">
        <h1 style="font-size:28px">Article not found</h1>
        <p>This article may have been moved or is not published.</p>
        <a class="btn btn-orange" href="blog.html">Back to all articles</a>
      </div>`;
  };
  if (!slug) return notFound();

  const { data: post, error } = await sb
    .from("blog_posts")
    .select("*")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Article load failed:", error);
    root.innerHTML = `<p class="blogx-status">The article could not be loaded right now. Please try again later.</p>`;
    return;
  }
  if (!post) return notFound();

  document.title = `${post.title} | ExamsTurbo`;
  const description = document.querySelector('meta[name="description"]');
  if (description) description.content = post.excerpt;

  const paragraphs = String(post.content)
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p)}</p>`)
    .join("");

  root.innerHTML = `
    <a class="text-link" href="blog.html"><i class="fa-solid fa-arrow-left me-1"></i> All articles</a>
    <div class="blogx-article-head">
      <span class="blogx-tag static">${esc(post.category)}</span>
      <h1>${esc(post.title)}</h1>
      <div class="blogx-meta">${metaLine(post)}</div>
    </div>
    ${post.cover_image ? `<img class="blogx-article-cover" src="${esc(post.cover_image)}" alt="${esc(post.title)}" decoding="async">` : ""}
    <div class="blogx-article-body">${paragraphs}</div>
    <p class="blogx-disclaimer">Articles are general guidance; verify program specifics with official providers.</p>`;
}

initList();
initPost();
