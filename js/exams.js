(() => {
  const article = window.buildExamArticle
    ? window.buildExamArticle("AACE International")
    : { benefits: [] };
  const DEFAULT_EXAM_COVER = "/assets/exam-covers/aace-psp.jpeg";
  const examRoute = (exam) =>
    window.ExamRoutes?.pagePath(exam, window.VENDORS || []) || "";

  // Static fallback data (agar Supabase se exams na aayen)
  let EXAMS = [
    {
      id: "aace-psp",
      slug: "aace-psp",
      vendorId: "aace-international",
      vendor: "AACE International",
      examCode: "PSP",
      examTitle: "Planning & Scheduling Professional (PSP) Exam",
      shortDescription:
        "Independent preparation resources for the AACE International Planning & Scheduling Professional (PSP) examination.",
      questionCount: "120+ Questions",
      updatedYear: "2026",
      price: 39.99,
      accessType: "Instant Access",
      detailDescription:
        "Independent preparation resources for the AACE International Planning & Scheduling Professional (PSP) examination.",
      benefits: article.benefits,
      article,
    },
    {
      id: "ccp",
      slug: "ccp",
      vendorId: "aace-international",
      vendor: "AACE International",
      examCode: "CCP",
      examTitle: "Certified Cost Professional (CCP) Exam",
      shortDescription:
        "Independent preparation resources for the AACE International Certified Cost Professional (CCP) examination.",
      questionCount: "189+ Questions",
      updatedYear: "2026",
      price: 39.99,
      accessType: "Instant Access",
      detailDescription:
        "Independent preparation resources for the AACE International Certified Cost Professional (CCP) examination.",
      benefits: article.benefits,
      article,
    },
  ].map((exam) => ({
    ...exam,
    coverImage: DEFAULT_EXAM_COVER,
  }));
  if (window.ExamRoutes) {
    EXAMS = window.ExamRoutes.assignExamSlugs(
      EXAMS,
      window.VENDORS || [],
    );
  }

  window.EXAMS = EXAMS;

  const formatPrice = (value) => `$${Number(value).toFixed(2)}`;
  const byId = (id) => document.getElementById(id);
  const escapeHTML = (value) =>
    String(value).replace(
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

  function initializeNavigation() {
    const toggle = byId("examNavLinks");
    const button = document.querySelector(".exam-nav-toggle");
    if (!toggle || !button) return;
    button.addEventListener("click", () => {
      const expanded = button.getAttribute("aria-expanded") === "true";
      button.setAttribute("aria-expanded", String(!expanded));
      toggle.classList.toggle("is-open", !expanded);
    });
  }

  function initializeLibrary() {
    const grid = byId("examGrid");
    if (!grid) return;
    const search = byId("examSearch");
    const sort = byId("examSort");
    const vendorFilter = byId("vendorFilter");
    const count = byId("filteredExamCount");
    const headingCount = byId("visibleExamCount");
    const empty = byId("examEmpty");

    function render() {
      const term = search.value.trim().toLowerCase();
      const vendor = vendorFilter.value;
      let results = EXAMS.filter((exam) => {
        const searchable =
          `${exam.id} ${exam.slug} ${exam.examCode} ${exam.examTitle} ${exam.vendor} ${exam.shortDescription}`.toLowerCase();
        return (
          (!term || searchable.includes(term)) &&
          (vendor === "all" || exam.vendor === vendor)
        );
      });
      if (sort.value === "az")
        results = results.sort((a, b) =>
          a.examTitle.localeCompare(b.examTitle),
        );
      count.textContent = results.length;
      headingCount.textContent = `${results.length} ${results.length === 1 ? "Exam" : "Exams"}`;
      empty.hidden = results.length > 0;
      grid.hidden = results.length === 0;
      grid.innerHTML = results
        .map(
          (exam) => `
        <article class="exam-card">
          <a class="exam-card-link" href="${escapeHTML(examRoute(exam) || "#")}" aria-label="View details for ${escapeHTML(exam.examTitle)}">
            <div class="exam-card-heading">
              <div>
                <span class="exam-card-code" aria-hidden="true">${escapeHTML(exam.examCode)}</span>
                <span class="exam-card-vendor">${escapeHTML(exam.vendor)}</span>
              </div>
              <img class="exam-card-cover" src="${escapeHTML(exam.coverImage)}" alt="${escapeHTML(exam.examCode)} exam preparation book cover" loading="lazy" decoding="async">
            </div>
            <h2>${escapeHTML(exam.examTitle)}</h2>
            <p class="exam-card-description">${escapeHTML(exam.shortDescription)}</p>
            <span class="exam-card-stats"><span><i class="fa-solid fa-list-check"></i> ${escapeHTML(exam.questionCount)}</span><span><i class="fa-regular fa-calendar"></i> Updated ${escapeHTML(exam.updatedYear)}</span></span>
            <span class="exam-card-action">View Exam Details <i class="fa-solid fa-arrow-right"></i></span>
          </a>
        </article>
      `,
        )
        .join("");
    }
    search.addEventListener("input", render);
    sort.addEventListener("change", render);
    vendorFilter.addEventListener("change", render);
    render();
  }

  function renderArticle(exam) {
    const data = exam.article;
    const label = data.label || "AACE-INTERNATIONAL";
    const safeLabel = escapeHTML(label);
    const outlinedHeading = escapeHTML(data.heading).replace(
      safeLabel,
      `<span class="outline-text">${safeLabel}</span>`,
    );
    byId("articleContent").innerHTML = `
      <h2>${outlinedHeading}</h2>
      <p>${escapeHTML(data.introduction)}</p>
      <h3>Benefits of <span class="outline-text">${safeLabel}</span> Certification</h3>
      <ul>${data.benefits.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      <h3>How to Prepare for <span class="outline-text">${safeLabel}</span> Exams</h3>
      <p>${escapeHTML(data.preparation)}</p>
      <h3>Why Choose Our <span class="outline-text">${safeLabel}</span> Preparation Resources?</h3>
      <ul>${data.whyChoose.map((item) => `<li>${escapeHTML(item)}</li>`).join("")}</ul>
      <p>${escapeHTML(data.final)}</p>
    `;
  }

  function initializeDetails() {
    const root = byId("detailContent");
    if (!root) return;
    const requestedId = new URLSearchParams(window.location.search).get("exam");
    const exam = EXAMS.find(
      (item) => item.id === requestedId || item.slug === requestedId,
    );
    byId("detailLoading").hidden = true;
    if (!exam) {
      byId("invalidExam").hidden = false;
      document.title = "Exam Not Found | ExamsTurbo";
      return;
    }

    root.hidden = false;
    byId("examCover").src = exam.coverImage;
    byId("examCover").alt =
      `ExamsTurbo ${exam.examCode} exam preparation study guide cover`;
    byId("examVendor").textContent = exam.vendor;
    byId("examTitle").textContent = exam.examTitle;
    byId("examDescription").textContent = exam.detailDescription;
    byId("examMetrics").innerHTML = [
      ["Exam code", exam.examCode],
      ["Question count", exam.questionCount],
      ["Updated", exam.updatedYear],
    ]
      .map(
        ([label, value]) =>
          `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`,
      )
      .join("");
    byId("examBenefits").innerHTML = exam.benefits
      .map((item) => `<li>${escapeHTML(item)}</li>`)
      .join("");
    byId("examPrice").textContent = formatPrice(exam.price);
    byId("examAccess").textContent = exam.accessType;
    document.querySelector('[data-purchase="buy"]').textContent =
      `Buy Now for ${formatPrice(exam.price)}`;
    renderArticle(exam);

    const title = `${exam.examCode} Exam Preparation | ExamsTurbo`;
    const description = `Explore independent ${exam.vendor} ${exam.examCode} exam preparation resources and digital study materials on ExamsTurbo.`;
    document.title = title;
    document.querySelector('meta[name="description"]').content = description;
    document.querySelector('meta[property="og:title"]').content = title;
    document.querySelector('meta[property="og:description"]').content =
      description;
    document.querySelector('meta[property="og:image"]').content =
      exam.coverImage;
    document.querySelector('link[rel="canonical"]').href =
      examRoute(exam) || window.location.href;

    document.querySelectorAll("[data-purchase]").forEach((button) => {
      button.addEventListener("click", () => {
        byId("purchaseStatus").textContent =
          button.dataset.purchase === "buy"
            ? "Checkout is not connected. No payment or order was created."
            : "Cart integration is not connected. This exam was not added to a cart.";
      });
    });
    byId("contributeButton").addEventListener("click", () => {
      byId("contributeStatus").textContent =
        "The contribution form is not connected yet.";
    });

    const dialog = byId("previewDialog");
    byId("previewImage").src = exam.coverImage;
    byId("previewImage").alt =
      `Preview of the ${exam.examCode} study guide cover`;
    byId("previewButton").addEventListener("click", () => dialog.showModal());
    byId("closePreview").addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
  }

  initializeNavigation();

  // Pehle data-loader.js ka intezar (Supabase se exams), phir pages setup.
  // Agar dataReady na ho ya fail ho jaye to static data par chalta hai.
  Promise.resolve(window.dataReady)
    .catch(() => {})
    .then(() => {
      if (Array.isArray(window.EXAMS) && window.EXAMS.length) {
        EXAMS = window.EXAMS;
      }
      initializeLibrary();
      initializeDetails();
    });
})();
