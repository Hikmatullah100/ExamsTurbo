import { createRequire } from "node:module";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const buildExamArticle = require("../js/exam-article.js");
const examRoutes = require("../js/exam-routes.js");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Local convenience: read SUPABASE_URL / SUPABASE_ANON_KEY from a ".env.local"
// file in the project root (KEY=value per line). Real environment variables
// (for example the GitHub Actions ones) always win. Only public keys belong here.
function loadLocalEnv() {
  let raw;
  try {
    raw = fsSync.readFileSync(path.join(root, ".env.local"), "utf8");
  } catch {
    return;
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || match[1].startsWith("#")) continue;
    const value = match[2].replace(/^(['"])(.*)\1$/, "$2");
    if (value && !process.env[match[1]]) process.env[match[1]] = value;
  }
}
loadLocalEnv();

const baseUrl = "https://examsturbo.com";
const supabaseUrl =
  process.env.SUPABASE_URL || "https://zfmjphrmmomqetwybnvf.supabase.co";
const anonKey = process.env.SUPABASE_ANON_KEY;
const manifestName = "exam-pages-manifest.json";
const generatedPages = new Set();
const sitemapPaths = new Set([
  "/",
  "/about/",
  "/blog/",
  "/community/",
  "/contact/",
  "/vendors/",
]);

function assertPublicKey(value) {
  if (!value) {
    throw new Error(
      "SUPABASE_ANON_KEY is required. Set it to the Supabase anon/public key.",
    );
  }
  if (/^(APNI|YOUR|PASTE|YAHAN|REPLACE)/i.test(value) || /[^\x21-\x7e]/.test(value)) {
    throw new Error(
      "SUPABASE_ANON_KEY still contains placeholder text. Paste the real anon/public key (it starts with eyJ or sb_publishable_).",
    );
  }
  if (value.startsWith("sb_secret_")) {
    throw new Error("SUPABASE_ANON_KEY must not contain a Supabase secret key.");
  }
  if (!value.startsWith("sb_publishable_")) {
    const parts = value.split(".");
    if (parts.length !== 3) {
      throw new Error("SUPABASE_ANON_KEY is not a valid public anon key.");
    }
    let payload;
    try {
      payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8"),
      );
    } catch {
      throw new Error("SUPABASE_ANON_KEY is not a valid public anon key.");
    }
    if (payload.role === "service_role") {
      throw new Error(
        "SUPABASE_ANON_KEY must not contain a service_role key.",
      );
    }
    if (payload.role !== "anon") {
      throw new Error("SUPABASE_ANON_KEY must have the anon role.");
    }
  }
  if (!/^https:\/\/[^/]+\.supabase\.co$/.test(supabaseUrl)) {
    throw new Error("SUPABASE_URL must be a Supabase project HTTPS URL.");
  }
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[char],
  );
}

function jsonForHtml(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function assetUrl(value, fallback) {
  const url = String(value || "").trim();
  if (!url) return fallback;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) return url;
  return `/${url.replace(/^(?:\.\.\/|\.\/)+/, "")}`;
}

function absoluteUrl(value) {
  return new URL(value, baseUrl).href;
}

async function fetchAll(
  client,
  table,
  configure = (query) => query,
  columns = "*",
) {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await configure(
      client.from(table).select(columns),
    ).range(offset, offset + pageSize - 1);
    if (error) {
      throw new Error(`Could not load ${table} from Supabase: ${error.message}`);
    }
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

function normalizeVendor(row) {
  const id = String(row.id || "").trim();
  const name = String(row.name || "").trim();
  const slug = examRoutes.vendorSlug({
    id,
    slug: row.slug || id || name,
  });
  if (!id || !name || !slug) {
    throw new Error(`Vendor row is missing a usable id, name, or slug: ${id}`);
  }
  return { id, name, slug };
}

function normalizeExam(row, vendorsById) {
  const id = String(row.id || "").trim();
  const vendorId = String(row.vendor_id || "").trim();
  const vendor = vendorsById.get(vendorId);
  if (!id || !vendor) {
    throw new Error(
      `Published exam ${id || "(missing id)"} has no matching vendor (${vendorId || "missing vendor_id"}).`,
    );
  }
  const sourceSlug = String(row.slug || id);
  const examCode = String(row.exam_code || "").trim();
  const price = Number(row.price);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`Published exam ${id} has an invalid price.`);
  }
  const article = buildExamArticle(vendor.name);
  return {
    id,
    slug: sourceSlug,
    sourceSlug,
    vendorId,
    vendorSlug: vendor.slug,
    vendor: vendor.name,
    examCode,
    examTitle: String(row.name || "").trim(),
    shortDescription: String(row.short_description || "").trim(),
    detailDescription: String(
      row.detail_description || row.short_description || "",
    ).trim(),
    questionCount: String(row.question_count || ""),
    updatedYear: String(
      row.updated_year ||
        (row.updated_at ? String(row.updated_at).slice(0, 4) : "") ||
        "2026",
    ),
    price,
    accessType: String(row.access_type || "Instant Access"),
    coverImage: assetUrl(
      row.cover_image,
      "/assets/exam-covers/aace-psp.jpeg",
    ),
    benefits: article.benefits,
    article,
  };
}

function renderArticle(article) {
  const list = (items) =>
    `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
  return `<h2>${escapeHtml(article.heading)}</h2>
    <p>${escapeHtml(article.introduction)}</p>
    <h3>Benefits of ${escapeHtml(article.label)} Certification</h3>
    ${list(article.benefits)}
    <h3>How to Prepare for ${escapeHtml(article.label)} Exams</h3>
    <p>${escapeHtml(article.preparation)}</p>
    <h3>Why Choose Our ${escapeHtml(article.label)} Preparation Resources?</h3>
    ${list(article.whyChoose)}
    <p>${escapeHtml(article.final)}</p>`;
}

function pageHtml(exam, content) {
  const title =
    String(content?.meta_title || "").trim() ||
    `${exam.examCode || exam.examTitle} Exam Preparation | ExamsTurbo`;
  const description =
    String(content?.meta_description || "").trim() ||
    exam.detailDescription ||
    `Independent ${exam.vendor} ${exam.examCode} exam preparation resources and digital study materials on ExamsTurbo.`;
  const examPath = examRoutes.pagePath(exam, [
    { id: exam.vendorId, slug: exam.vendorSlug },
  ]);
  const canonical = `${baseUrl}${examPath}`;
  const cover = absoluteUrl(exam.coverImage);
  const price = `$${exam.price.toFixed(2)}`;
  const breadcrumb = [
    { name: "Home", item: `${baseUrl}/` },
    { name: "Vendors", item: `${baseUrl}/vendors/` },
    {
      name: exam.vendor,
      item: `${baseUrl}/vendors/?vendor=${encodeURIComponent(exam.vendorId)}#vendors`,
    },
    { name: exam.examCode || exam.examTitle },
  ];
  const pageData = { exam, content: content || null };
  const keywords = content?.meta_keywords
    ? `<meta name="keywords" content="${escapeHtml(content.meta_keywords)}" />`
    : "";
  const questionCount = exam.questionCount || "Not specified";
  const updatedYear = exam.updatedYear ? `Updated ${exam.updatedYear}` : "";
  const benefits = exam.benefits
    .map((benefit) => `<li>${escapeHtml(benefit)}</li>`)
    .join("");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#071A2F" />
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}" />
    ${keywords}
    <link rel="canonical" href="${escapeHtml(canonical)}" />
    <meta property="og:type" content="product" />
    <meta property="og:title" content="${escapeHtml(title)}" />
    <meta property="og:description" content="${escapeHtml(description)}" />
    <meta property="og:url" content="${escapeHtml(canonical)}" />
    <meta property="og:image" content="${escapeHtml(cover)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escapeHtml(title)}" />
    <meta name="twitter:description" content="${escapeHtml(description)}" />
    <meta name="twitter:image" content="${escapeHtml(cover)}" />
    <link rel="icon" type="image/png" href="/assets/images/exams-turbo-icon.png" />
    <link rel="apple-touch-icon" href="/assets/images/exams-turbo-icon.png" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css" rel="stylesheet" />
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css" rel="stylesheet" />
    <link rel="stylesheet" href="/css/style.css" />
    <link rel="stylesheet" href="/css/exam-content.css" />
    <link rel="stylesheet" href="/css/exam-page.css" />
    <script type="application/ld+json">${jsonForHtml({
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: breadcrumb.map((item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        ...(item.item ? { item: item.item } : {}),
      })),
    })}</script>
  </head>
  <body class="exam-page">
    <div class="promo-bar">
      <div class="container promo-inner">
        <span><i class="fa-solid fa-bolt"></i> SPECIAL OFFER: GET 25% OFF YOUR FIRST ORDER</span>
        <span class="promo-code">USE CODE <strong>WELCOME25</strong></span>
      </div>
    </div>
    <header class="site-header">
      <nav class="navbar navbar-expand-xl container">
        <a class="navbar-brand brand" href="/" aria-label="ExamsTurbo home">
          <span class="brand-mark"><img src="/assets/images/exams-turbo-icon.png" alt="" aria-hidden="true"></span>
          <span><span class="brand-exams">EXAMS</span><span class="brand-turbo">TURBO</span></span>
        </a>
        <div class="nav-actions">
          <a class="nav-link" href="/">Home</a>
          <a class="nav-link" href="/vendors/">Vendors</a>
          <button class="cart-button" id="openCart" aria-label="Open shopping cart">
            <i class="fa-solid fa-cart-shopping"></i><span class="cart-label">Cart</span>
            <span class="cart-count" id="cartCount">0</span>
          </button>
        </div>
      </nav>
    </header>
    <main class="container exam-page-content">
      <nav class="exam-breadcrumb" aria-label="Breadcrumb">
        <ol>
          <li><a href="/">Home</a></li>
          <li><a href="/vendors/">Vendors</a></li>
          <li><a href="/vendors/?vendor=${encodeURIComponent(exam.vendorId)}#vendors">${escapeHtml(exam.vendor)}</a></li>
          <li aria-current="page">${escapeHtml(exam.examCode || exam.examTitle)}</li>
        </ol>
      </nav>
      <section class="vendor-exam-detail" aria-labelledby="vendorExamDetailTitle">
        <div class="vendor-exam-detail-grid">
          <div class="vendor-exam-cover-panel">
            <img id="vendorExamCover" class="vendor-exam-cover" src="${escapeHtml(exam.coverImage)}" alt="${escapeHtml(`${exam.vendor} ${exam.examCode} exam preparation study guide cover`)}" />
            <button class="btn btn-outline-light btn-sm w-100" id="previewExamCover" type="button">Look Inside (Preview)</button>
          </div>
          <div class="vendor-exam-information">
            <div class="section-kicker">${escapeHtml(exam.vendor)}</div>
            <h1 id="vendorExamDetailTitle">${escapeHtml(exam.examTitle)}</h1>
            <div class="vendor-exam-metrics">
              <div><span>Exam code</span><strong>${escapeHtml(exam.examCode || "Not specified")}</strong></div>
              <div><span>Question count</span><strong>${escapeHtml(questionCount)}</strong></div>
              <div><span>Updated</span><strong>${escapeHtml(exam.updatedYear || "2026")}</strong></div>
            </div>
            <p class="vendor-exam-description">${escapeHtml(exam.detailDescription)}</p>
            <h2 class="exam-page-subheading">Study Guide Information</h2>
            <p>This independent digital study resource is designed for exam preparation and readiness review. It does not provide access to the official examination.</p>
            <h2 class="exam-page-subheading">Preparation Benefits</h2>
            <ul class="vendor-exam-benefits">${benefits}</ul>
          </div>
          <aside class="vendor-exam-purchase" id="examPurchasePanel">
            <div class="section-kicker">DIGITAL STUDY RESOURCE</div>
            <h2>Get Exam Study Guide</h2>
            <div class="vendor-exam-price">${price}</div>
            <p class="vendor-exam-access"><i class="fa-solid fa-bolt"></i><span>${escapeHtml(exam.accessType)}</span></p>
            <button class="btn btn-orange w-100" id="buyExamNow" type="button">Buy Now for ${price}</button>
            <button class="btn btn-outline-light w-100" id="addExamToCart" type="button"><i class="fa-solid fa-cart-plus me-2"></i>Add to Cart</button>
            <p class="vendor-exam-disclaimer">Independent educational resource. Payment is processed through the existing cart checkout.</p>
            <div class="vendor-exam-action-status" id="vendorExamActionStatus" role="status" aria-live="polite"></div>
          </aside>
        </div>
        <article class="vendor-exam-article" id="vendorExamArticle">${renderArticle(exam.article)}</article>
      </section>
    </main>
    <div id="drawerBackdrop" class="drawer-backdrop"></div>
    <aside class="cart-drawer" id="cartDrawer" aria-label="Shopping cart" aria-hidden="true">
      <div class="drawer-header">
        <div><div class="section-kicker">YOUR SELECTION</div><h2>Shopping Cart <span id="drawerCount">(0)</span></h2></div>
        <button id="closeCart" class="drawer-close" aria-label="Close cart"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="drawer-items" id="cartItems"></div>
      <div class="drawer-empty" id="cartEmpty">
        <i class="fa-solid fa-cart-shopping"></i><h3>Your cart is empty</h3>
        <p>Explore a vendor library and add a product to get started.</p>
        <a class="btn btn-orange" href="/vendors/">Browse Vendors</a>
      </div>
      <div class="drawer-checkout" id="checkoutPanel">
        <div class="subtotal-row"><span>Subtotal</span><strong id="cartSubtotal">$0.00</strong></div>
        <form id="checkoutForm">
          <label for="checkoutEmail">Email for delivery</label>
          <input id="checkoutEmail" type="email" placeholder="you@example.com" required />
          <button type="submit" class="btn btn-orange w-100">Continue to Demo Checkout <i class="fa-solid fa-arrow-right ms-2"></i></button>
          <small>Secure payment by PayPal when checkout is enabled.</small>
        </form>
        <div id="checkoutMessage" class="checkout-message" role="status"></div>
      </div>
    </aside>
    <dialog class="exam-cover-preview" id="examCoverPreview" aria-label="Exam cover preview">
      <button class="exam-cover-preview-close" id="closeExamCoverPreview" type="button" aria-label="Close preview"><i class="fa-solid fa-xmark"></i></button>
      <img id="examCoverPreviewImage" src="${escapeHtml(exam.coverImage)}" alt="${escapeHtml(`Preview of the ${exam.examCode} study guide cover`)}" />
    </dialog>
    <div class="toast-container position-fixed bottom-0 end-0 p-3">
      <div id="siteToast" class="toast custom-toast" role="status" aria-live="polite">
        <div class="toast-body"><i class="fa-solid fa-circle-check"></i><span id="toastMessage">Added to cart</span></div>
      </div>
    </div>
    <script>window.dataReady = new Promise((resolve) => { window.__resolveData = resolve; setTimeout(resolve, 4000); });</script>
    <script>window.EXAM_PAGE_DATA = ${jsonForHtml(pageData)};</script>
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"></script>
    <script src="/js/exam-routes.js"></script>
    <script src="/js/exam-article.js"></script>
    <script src="/js/cart.js"></script>
    <script src="/js/exam-public.js"></script>
    <script src="/js/site.js"></script>
    <script type="module" src="/js/exam-page.js"></script>
  </body>
</html>`;
}

async function readPreviousManifest() {
  try {
    const raw = await fs.readFile(path.join(root, manifestName), "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.files)) {
      throw new Error(`${manifestName} must contain a files array.`);
    }
    for (const relativePath of parsed.files) {
      if (!/^vendors\/[a-z0-9-]+\/[a-z0-9-]+\/index\.html$/.test(relativePath)) {
        throw new Error(`Unsafe generated page path in ${manifestName}: ${relativePath}`);
      }
    }
    return parsed.files;
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function removePreviousPages(previousFiles) {
  for (const relativePath of previousFiles) {
    const absolutePath = path.resolve(root, relativePath);
    if (!absolutePath.startsWith(`${path.join(root, "vendors")}${path.sep}`)) {
      throw new Error(`Refusing to remove a page outside vendors/: ${relativePath}`);
    }
    await fs.rm(absolutePath, { force: true });
    const examDirectory = path.dirname(absolutePath);
    const vendorDirectory = path.dirname(examDirectory);
    for (const directory of [examDirectory, vendorDirectory]) {
      try {
        await fs.rmdir(directory);
      } catch (error) {
        if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error;
      }
    }
  }
}

async function main() {
  assertPublicKey(anonKey);
  const cname = (await fs.readFile(path.join(root, "CNAME"), "utf8")).trim();
  if (cname !== "examsturbo.com") {
    throw new Error("CNAME must contain examsturbo.com for the Pages deployment.");
  }

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [vendorRows, examRows, contentRows] = await Promise.all([
    fetchAll(client, "vendors"),
    fetchAll(client, "exams", (query) =>
      query.eq("is_published", true).order("name"),
    ),
    fetchAll(client, "exam_content", (query) =>
      query.eq("status", "published"),
      "exam_id, meta_title, meta_description, meta_keywords, faqs, demo_questions, scenarios, article_html",
    ),
  ]);
  if (!vendorRows.length) throw new Error("Supabase returned no vendors.");
  if (!examRows.length) throw new Error("Supabase returned no published exams.");

  const vendors = vendorRows.map(normalizeVendor);
  const vendorSlugOwners = new Map();
  const vendorsById = new Map();
  for (const vendor of vendors) {
    const owner = vendorSlugOwners.get(vendor.slug);
    if (owner && owner !== vendor.id) {
      throw new Error(
        `Vendor URL slug "${vendor.slug}" is shared by ${owner} and ${vendor.id}.`,
      );
    }
    vendorSlugOwners.set(vendor.slug, vendor.id);
    vendorsById.set(vendor.id, vendor);
  }

  const exams = examRoutes.assignExamSlugs(
    examRows.map((row) => normalizeExam(row, vendorsById)),
    vendors,
  );
  const examPaths = new Set();
  const canonicalExamPaths = new Set(
    exams.map((exam) => examRoutes.pagePath(exam, vendors)),
  );
  const redirects = {};
  const redirectConflicts = [];
  const contentByExamId = new Map(
    contentRows.map((row) => [String(row.exam_id), row]),
  );
  const outputs = [];
  const addRedirect = (source, destination, allowExisting = false) => {
    const key = source.replace(/\/+$/, "");
    if (
      !key ||
      key === destination.replace(/\/+$/, "") ||
      canonicalExamPaths.has(`${key}/`)
    ) {
      return;
    }
    if (redirects[key] && redirects[key] !== destination) {
      if (allowExisting) return;
      redirectConflicts.push(`${key} -> ${redirects[key]} / ${destination}`);
      return;
    }
    redirects[key] = destination;
  };
  for (const exam of exams) {
    if (!exam.examTitle) throw new Error(`Published exam ${exam.id} has no name.`);
    const examPath = examRoutes.pagePath(exam, vendors);
    if (!examPath) throw new Error(`Exam ${exam.id} has no valid page URL.`);
    const relativePath = `${examPath.slice(1)}index.html`;
    if (examPaths.has(relativePath)) {
      throw new Error(`More than one published exam resolves to ${relativePath}.`);
    }
    examPaths.add(relativePath);
    const existingPath = path.join(root, relativePath);
    try {
      await fs.access(existingPath);
      const previousFiles = await readPreviousManifest();
      if (!previousFiles.includes(relativePath)) {
        throw new Error(`Refusing to overwrite an existing non-generated file: ${relativePath}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }

    const content = contentByExamId.get(exam.id) || null;
    outputs.push({
      relativePath,
      html: pageHtml(exam, content),
    });
    sitemapPaths.add(examPath);
    for (const legacySlug of examRoutes.legacySlugs(exam, {
      id: exam.vendorId,
      slug: exam.vendorSlug,
    })) {
      addRedirect(`/vendors/${exam.vendorSlug}/${legacySlug}/`, examPath);
    }
    for (const legacySlug of examRoutes.legacySlugs(exam, {
      id: exam.vendorId,
      slug: exam.vendorSlug,
    })) {
      addRedirect(`/exams/${legacySlug}`, examPath, true);
    }
  }
  if (redirectConflicts.length) {
    throw new Error(
      `Legacy exam URL conflicts:\n${redirectConflicts.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  if (!Object.keys(redirects).length) {
    throw new Error("No published exams have an exam code for legacy redirects.");
  }

  const previousFiles = await readPreviousManifest();
  await removePreviousPages(previousFiles);
  for (const output of outputs) {
    const absolutePath = path.join(root, output.relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, output.html, "utf8");
    generatedPages.add(output.relativePath);
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${[...sitemapPaths]
    .sort()
    .map((pathname) => `  <url><loc>${escapeHtml(`${baseUrl}${pathname}`)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;
  await Promise.all([
    fs.writeFile(path.join(root, "sitemap.xml"), sitemap, "utf8"),
    fs.writeFile(
      path.join(root, "exam-redirects.json"),
      `${JSON.stringify(redirects, null, 2)}\n`,
      "utf8",
    ),
    fs.writeFile(
      path.join(root, manifestName),
      `${JSON.stringify({ files: [...generatedPages].sort() }, null, 2)}\n`,
      "utf8",
    ),
  ]);
  const generatedFolders = new Set(
    outputs.map((output) => output.relativePath.replace(/index\.html$/, "")),
  );
  const mismatches = [];
  const checkExamUrl = async (url, source) => {
    const match = String(url).match(/^\/vendors\/([a-z0-9-]+\/[a-z0-9-]+)\/?$/);
    if (!match) {
      mismatches.push(`${source}: invalid exam URL ${url}`);
      return;
    }
    const folder = `vendors/${match[1]}/`;
    if (!generatedFolders.has(folder)) {
      mismatches.push(`${source}: ${url} has no generated folder`);
    }
    const pagePath = path.join(root, folder, "index.html");
    try {
      await fs.access(pagePath);
    } catch {
      mismatches.push(`${source}: ${url} has no generated index.html`);
    }
  };
  const vendorLibraryPaths = exams.map((exam) =>
    examRoutes.pagePath(exam, vendors),
  );
  for (let index = 0; index < vendorLibraryPaths.length; index += 1) {
    await checkExamUrl(
      vendorLibraryPaths[index],
      `vendor library exam ${exams[index].id}`,
    );
  }
  const sitemapExamPaths = [
    ...sitemap.matchAll(/<loc>https:\/\/examsturbo\.com(\/vendors\/[^<]+)<\/loc>/g),
  ].map((match) => match[1]);
  for (const url of sitemapExamPaths) await checkExamUrl(url, "sitemap");
  for (const [source, destination] of Object.entries(redirects)) {
    await checkExamUrl(destination, `redirect ${source}`);
  }
  for (const exam of exams) {
    const canonical = examRoutes.pagePath(exam, vendors);
    const vendor = vendorsById.get(exam.vendorId);
    for (const oldSlug of examRoutes.legacySlugs(exam, vendor)) {
      const oldPath = `/vendors/${exam.vendorSlug}/${oldSlug}`;
      if (canonicalExamPaths.has(`${oldPath}/`)) continue;
      if (oldPath !== canonical && redirects[oldPath] !== canonical) {
        mismatches.push(
          `previous exam URL ${oldPath} does not redirect to ${canonical}`,
        );
      }
    }
  }
  const checkedVendorLibraryPaths = new Set(vendorLibraryPaths);
  const checkedSitemapPaths = new Set(sitemapExamPaths);
  for (const url of checkedVendorLibraryPaths) {
    if (!checkedSitemapPaths.has(url)) {
      mismatches.push(`vendor library URL ${url} is missing from sitemap`);
    }
  }
  for (const url of checkedSitemapPaths) {
    if (!checkedVendorLibraryPaths.has(url)) {
      mismatches.push(`sitemap URL ${url} is not used by a vendor exam link`);
    }
  }
  if (mismatches.length) {
    throw new Error(
      `Generated exam URL validation failed:\n${mismatches.map((item) => `- ${item}`).join("\n")}`,
    );
  }
  console.log(
    `Generated ${outputs.length} exam pages, ${Object.keys(redirects).length} redirects, and sitemap.xml; verified all exam URLs.`,
  );
}

main().catch((error) => {
  console.error(`Exam page generation failed: ${error.message}`);
  process.exitCode = 1;
});