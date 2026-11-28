// Exam page (/vendors/<vendor>/<exam>/).
// Two ways this page can run:
//  1) A page that was generated at build time (window.EXAM_PAGE_DATA is set).
//     Price, discount, title, code etc. are refreshed from the database as soon as the page opens,
//     so changes made in the admin panel show up without rebuilding the site.
//  2) The shared template (exam-template.html, served by 404.html for exams that have no generated page yet).
//     The exam is found from the address in the browser and the whole page is filled from the database.
// data-loader.js has a top-level await, so when the code below runs window.EXAMS / window.EXAM_CONTENT are ready.
import "./data-loader.js";

(() => {
  const status = document.getElementById("vendorExamActionStatus");
  const baked =
    window.EXAM_PAGE_DATA && window.EXAM_PAGE_DATA.exam
      ? window.EXAM_PAGE_DATA
      : null;

  const $ = (selector) => document.querySelector(selector);
  const setText = (selector, value) => {
    const el = $(selector);
    if (el) el.textContent = value;
  };
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
          c
        ],
    );
  const money = (value) => `$${Number(value).toFixed(2)}`;
  const normalizePath = (value) =>
    String(value || "").replace(/\/+$/, "").toLowerCase();

  // Price with the old price crossed out and a "-20%" tag while a discount is active.
  function priceMarkup(exam) {
    const now = money(exam.price);
    const was = Number(exam.originalPrice);
    if (!Number.isFinite(was) || was <= Number(exam.price)) return now;
    const off = Math.round((1 - Number(exam.price) / was) * 100);
    return `<s style="opacity:.6;font-size:.7em;margin-right:6px;font-weight:600">${money(was)}</s>${now}<span style="margin-left:8px;padding:2px 7px;border-radius:6px;background:#ff8a1f;color:#071a2f;font-size:.55em;font-weight:800;vertical-align:middle">-${off}%</span>`;
  }

  function articleHtml(article) {
    if (!article) return "";
    const list = (items) =>
      `<ul>${(items || []).map((item) => `<li>${esc(item)}</li>`).join("")}</ul>`;
    return `<h2>${esc(article.heading)}</h2>
    <p>${esc(article.introduction)}</p>
    <h3>Benefits of ${esc(article.label)} Certification</h3>
    ${list(article.benefits)}
    <h3>How to Prepare for ${esc(article.label)} Exams</h3>
    <p>${esc(article.preparation)}</p>
    <h3>Why Choose Our ${esc(article.label)} Preparation Resources?</h3>
    ${list(article.whyChoose)}
    <p>${esc(article.final)}</p>`;
  }

  // The exam as it is in the database right now.
  // list === null means the database could not be reached (keep whatever the page already shows).
  function findCurrent() {
    const list = Array.isArray(window.EXAMS) ? window.EXAMS : null;
    if (!list) return { list: null, exam: null };
    if (baked) {
      return {
        list,
        exam: list.find((item) => String(item.id) === String(baked.exam.id)) || null,
      };
    }
    const here = normalizePath(window.location.pathname);
    const routes = window.ExamRoutes;
    const exam =
      list.find(
        (item) =>
          normalizePath(routes?.pagePath(item, window.VENDORS || [])) === here,
      ) || null;
    return { list, exam };
  }

  function setButtonsEnabled(enabled) {
    ["buyExamNow", "addExamToCart"].forEach((id) => {
      const button = document.getElementById(id);
      if (button) button.disabled = !enabled;
    });
  }

  function applyExam(exam, fullPage) {
    setText(".vendor-exam-information .section-kicker", exam.vendor);
    setText("#vendorExamDetailTitle", exam.examTitle);
    const metrics = document.querySelectorAll(".vendor-exam-metrics strong");
    [
      exam.examCode || "Not specified",
      exam.questionCount || "Not specified",
      exam.updatedYear || "2026",
    ].forEach((value, index) => {
      if (metrics[index]) metrics[index].textContent = value;
    });
    setText(".vendor-exam-description", exam.detailDescription || "");
    const benefits = $(".vendor-exam-benefits");
    if (benefits) {
      benefits.replaceChildren(
        ...(exam.benefits || []).map((benefit) => {
          const li = document.createElement("li");
          li.textContent = benefit;
          return li;
        }),
      );
    }
    const price = $(".vendor-exam-price");
    if (price) price.innerHTML = priceMarkup(exam);
    setText("#buyExamNow", `Buy Now for ${money(exam.price)}`);
    setText(".vendor-exam-access span", exam.accessType || "Instant Access");

    const cover = document.getElementById("vendorExamCover");
    if (cover && exam.coverImage) {
      cover.src = exam.coverImage;
      cover.alt = `${exam.vendor} ${exam.examCode} exam preparation study guide cover`;
    }
    const preview = document.getElementById("examCoverPreviewImage");
    if (preview && exam.coverImage) {
      preview.src = exam.coverImage;
      preview.alt = `Preview of the ${exam.examCode} study guide cover`;
    }

    const crumbs = document.querySelectorAll(".exam-breadcrumb li");
    if (crumbs.length >= 4) {
      const vendorLink = crumbs[2].querySelector("a");
      if (vendorLink) {
        vendorLink.textContent = exam.vendor;
        vendorLink.href = `/vendors/?vendor=${encodeURIComponent(exam.vendorId)}#vendors`;
      }
      crumbs[3].textContent = exam.examCode || exam.examTitle;
    }

    if (fullPage) {
      document.title = `${exam.examCode || exam.examTitle} Exam Preparation | ExamsTurbo`;
      const description = document.querySelector('meta[name="description"]');
      if (description) {
        description.setAttribute(
          "content",
          exam.detailDescription ||
            `Independent ${exam.vendor} ${exam.examCode} exam preparation resources and digital study materials on ExamsTurbo.`,
        );
      }
      const article = document.getElementById("vendorExamArticle");
      if (article) article.innerHTML = articleHtml(exam.article);
    }
    setButtonsEnabled(true);
  }

  function showUnavailable(message) {
    setButtonsEnabled(false);
    if (status) status.textContent = message;
  }

  const { list, exam: fresh } = findCurrent();
  let current = fresh || (baked ? baked.exam : null);

  if (!baked && !fresh) {
    // Template page but no exam matches this address.
    document.title = "Exam Not Found | ExamsTurbo";
    setText("#vendorExamDetailTitle", list ? "Exam not found" : "Exam could not be loaded");
    setText(".vendor-exam-information .section-kicker", "ExamsTurbo");
    setText(
      ".vendor-exam-description",
      list
        ? "This exam is not available. Please browse the vendor library."
        : "The exam details could not be loaded right now. Please reload this page.",
    );
    const panel = document.getElementById("examPurchasePanel");
    if (panel) panel.hidden = true;
    return;
  }

  if (baked && list && !fresh) {
    // The page was generated earlier, but the exam is no longer published.
    showUnavailable("This exam is no longer available.");
  } else if (fresh) {
    applyExam(fresh, !baked);
  } else {
    setButtonsEnabled(true); // database unreachable: keep the generated content
  }

  // Newest published content wins; the generated copy is only a fallback.
  const freshContent = (window.EXAM_CONTENT || {})[current.id];
  const content = freshContent || (baked ? baked.content : null);
  if (content) {
    window.EXAM_CONTENT = { ...(window.EXAM_CONTENT || {}), [current.id]: content };
  }

  function addToCart(openCart) {
    if (!window.CertiCart?.add) {
      status.textContent =
        "Cart integration is unavailable. The item was not added.";
      return;
    }
    window.CertiCart.add(
      {
        id: current.id,
        name: current.examTitle,
        code: current.examCode,
        price: current.price,
      },
      current.vendor,
    );
    status.textContent = `${current.examTitle} added to your cart.`;
    if (openCart) document.getElementById("openCart")?.click();
  }

  document
    .getElementById("addExamToCart")
    ?.addEventListener("click", () => addToCart(false));
  document
    .getElementById("buyExamNow")
    ?.addEventListener("click", () => addToCart(true));

  const preview = document.getElementById("examCoverPreview");
  document.getElementById("previewExamCover")?.addEventListener("click", () => {
    preview?.showModal();
  });
  document
    .getElementById("closeExamCoverPreview")
    ?.addEventListener("click", () => preview?.close());
  preview?.addEventListener("click", (event) => {
    if (event.target === preview) preview.close();
  });

  if (!(baked && list && !fresh)) {
    window.dispatchEvent(new CustomEvent("exam:detail", { detail: current }));
  }
})();
