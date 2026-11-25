(async () => {
  await window.dataReady;
  const vendors = Array.isArray(window.VENDORS) ? window.VENDORS : [];
  const grid = document.getElementById("vendorGrid");
  const filters = document.getElementById("alphabetFilters");
  const categoryFilters = document.getElementById(
    "certificationCategoryFilters",
  );
  const search = document.getElementById("vendorSearch");
  const searchSuggestions = document.getElementById("searchSuggestions");
  const searchSuggestionOptions = document.getElementById(
    "searchSuggestionOptions",
  );
  const searchNoResults = document.getElementById("searchNoResults");
  const searchShell = search.closest(".search-shell");
  const clearSearch = document.getElementById("clearSearch");
  const resultCount = document.getElementById("resultCount");
  const status = document.getElementById("directoryStatus");
  const empty = document.getElementById("emptyState");
  const sort = document.getElementById("sortVendors");
  let activeLetter = "All";
  let activeCategory = "All";
  let currentVendor = null;
  let activeVendorLibraryExams = [];
  let activeExam = null;
  let currentSearchSuggestions = [];
  let activeSearchSuggestionIndex = -1;
  const examLibrary = Array.isArray(window.EXAMS) ? window.EXAMS : [];
  const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const defaultExamCover = "assets/exam-covers/aace-psp.jpeg";
  const certificationCategories = window.CERTIFICATION_CATEGORIES || [];
  const initialSearch = new URLSearchParams(window.location.search).get("q");
  if (initialSearch) search.value = initialSearch;

  const sortedVendors = () =>
    [...vendors].sort((a, b) =>
      (a.sortName || a.name).localeCompare(b.sortName || b.name),
    );
  const escapeHTML = (value) =>
    String(value).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );

  function collectSearchText(value, visited = new WeakSet()) {
    if (value === null || value === undefined) return "";
    if (["string", "number", "boolean"].includes(typeof value))
      return String(value);
    if (typeof value !== "object" || visited.has(value)) return "";
    visited.add(value);
    const values = Array.isArray(value) ? value : Object.values(value);
    return values.map((item) => collectSearchText(item, visited)).join(" ");
  }
  function getSearchableRecordText(record, excludedFields = []) {
    const fields = {};
    for (const [key, value] of Object.entries(record || {})) {
      if (!excludedFields.includes(key)) fields[key] = value;
    }
    return collectSearchText(fields).toLowerCase();
  }
  function getSearchTerms(value) {
    return value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  }
  function matchesSearchTerms(text, terms) {
    return terms.every((term) => text.includes(term));
  }

  function renderAlphabet() {
    const letters = ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
    filters.innerHTML = letters
      .map(
        (letter) =>
          `<button type="button" class="letter-btn ${letter === "All" ? "all-btn" : ""} ${activeLetter === letter ? "active" : ""}" data-letter="${letter}" aria-pressed="${activeLetter === letter}">${letter}</button>`,
      )
      .join("");
  }
  function renderCategoryFilters() {
    const categories = [
      ...new Set(
        vendors.flatMap((vendor) =>
          (vendor.certifications || []).flatMap(
            (certification) => certification.categories || [],
          ),
        ),
      ),
    ];
    const buttons = [
      "All",
      ...certificationCategories.filter((category) =>
        categories.includes(category),
      ),
    ];
    categoryFilters.innerHTML = buttons
      .map((category) => {
        const count =
          category === "All"
            ? vendors.length
            : vendors.filter((vendor) =>
                (vendor.certifications || []).some((certification) =>
                  (certification.categories || []).includes(category),
                ),
              ).length;
        const label = category === "All" ? "All Categories" : category;
        return `<button type="button" class="category-filter-btn ${activeCategory === category ? "active" : ""}" data-category="${escapeHTML(category)}" aria-pressed="${activeCategory === category}">${escapeHTML(label)} <span>${count}</span></button>`;
      })
      .join("");
  }
  function getFiltered() {
    const terms = getSearchTerms(search.value);
    let list = sortedVendors().filter((vendor) => {
      const filterName = vendor.sortName || vendor.name;
      const matchesLetter =
        activeLetter === "All" ||
        filterName.toUpperCase().startsWith(activeLetter);
      const vendorLibraryExams = examLibrary.filter(
        (exam) => exam.vendorId === vendor.id,
      );
      const certifications = vendor.certifications || [];
      const searchable = [
        getSearchableRecordText(vendor, ["certifications", "exams"]),
        ...certifications.map((certification) =>
          getSearchableRecordText(certification),
        ),
        ...(vendor.exams || []).map((exam) => getSearchableRecordText(exam)),
        ...vendorLibraryExams.map((exam) => getSearchableRecordText(exam)),
      ].join(" ");
      const matchesCategory =
        activeCategory === "All" ||
        certifications.some((certification) =>
          (certification.categories || []).includes(activeCategory),
        );
      return (
        matchesLetter &&
        matchesCategory &&
        matchesSearchTerms(searchable, terms)
      );
    });
    if (sort.value === "za") list.reverse();
    return list;
  }
  function renderVendors() {
    const list = getFiltered();
    resultCount.textContent = list.length;
    status.textContent = search.value.trim()
      ? `Search results for “${search.value.trim()}”`
      : activeCategory !== "All"
        ? `Showing ${activeCategory} certifications`
        : activeLetter === "All"
          ? "Showing all vendors"
          : `Showing vendors starting with ${activeLetter}`;
    grid.innerHTML = list
      .map((vendor) => {
        const logo = vendor.logoUrl
          ? `<img src="${escapeHTML(vendor.logoUrl)}" alt="${escapeHTML(vendor.name)} logo" loading="lazy" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="vendor-logo-fallback" hidden>${escapeHTML(vendor.logoText || vendor.name)}</span>`
          : `<span class="vendor-logo-fallback">${escapeHTML(vendor.logoText || vendor.name)}</span>`;
        const certificationTags = [
          ...new Set(
            (vendor.certifications || []).flatMap(
              (certification) => certification.categories || [],
            ),
          ),
        ];
        const categories = (
          certificationTags.length
            ? certificationTags
            : vendor.categories || [vendor.category]
        )
          .slice(0, 2)
          .map(
            (category) =>
              `<span class="vendor-category">${escapeHTML(category)}</span>`,
          )
          .join("");
        return `
      <a class="vendor-card" href="#" data-vendor="${escapeHTML(vendor.id)}" aria-label="Open ${escapeHTML(vendor.name)} exam library">
        <div class="vendor-card-top"><div class="vendor-logo">${logo}</div><div class="vendor-categories">${categories}</div></div>
        <h3>${escapeHTML(vendor.name)}</h3>
        <p>${escapeHTML(vendor.description)}</p>
        <span class="vendor-link"><span>EXPLORE LIBRARY</span><i class="fa-solid fa-arrow-right"></i></span>
      </a>`;
      })
      .join("");
    empty.classList.toggle("d-none", list.length !== 0);
    grid.classList.toggle("d-none", list.length === 0);
  }
  function renderAll() {
    renderAlphabet();
    renderCategoryFilters();
    renderVendors();
  }

  function buildSearchSuggestions(query) {
    const terms = getSearchTerms(query);
    if (!terms.length) return [];

    const results = [];
    const seen = new Set();
    const addResult = (result) => {
      if (seen.has(result.key)) return;
      seen.add(result.key);
      results.push(result);
    };
    const matches = (recordText) => matchesSearchTerms(recordText, terms);

    vendors.forEach((vendor) => {
      const vendorText = getSearchableRecordText(vendor, [
        "certifications",
        "exams",
      ]);
      if (matches(vendorText)) {
        addResult({
          key: `vendor:${vendor.id || vendor.name}`,
          kind: "vendor",
          title: vendor.name || vendor.id,
          detail: vendor.description || vendor.category || "",
          type: "Vendor",
          vendor,
        });
      }

      (vendor.certifications || []).forEach((certification) => {
        const certificationText = getSearchableRecordText(certification);
        if (!matches(`${vendor.name || ""} ${certificationText}`.toLowerCase()))
          return;
        const code = certification.code || certification.credentialCode || "";
        addResult({
          key: `certification:${vendor.id}:${certification.id || code || certification.name}`,
          kind: "certification",
          title: certification.name || code || "Certification",
          detail: [vendor.name, code ? `Code ${code}` : ""]
            .filter(Boolean)
            .join(" · "),
          type: code ? `Certification · Code ${code}` : "Certification",
          vendor,
        });
      });

      (vendor.exams || []).forEach((material) => {
        const materialText =
          `${vendor.name || ""} ${getSearchableRecordText(material)}`.toLowerCase();
        if (!matches(materialText)) return;
        const code = material.code || material.examCode || "";
        addResult({
          key: `material:${vendor.id}:${material.id || code || material.name}`,
          kind: "material",
          title: material.name || material.examTitle || material.id,
          detail: [vendor.name, code ? `Code ${code}` : ""]
            .filter(Boolean)
            .join(" · "),
          type: code ? `Study material · Code ${code}` : "Study material",
          vendor,
        });
      });
    });

    examLibrary.forEach((exam) => {
      if (!matches(getSearchableRecordText(exam))) return;
      const vendor = vendorsById.get(exam.vendorId);
      const code = exam.examCode || exam.code || "";
      addResult({
        key: `exam:${exam.vendorId}:${exam.id || exam.slug || code || exam.examTitle}`,
        kind: "exam",
        title: exam.examTitle || exam.name || exam.id || exam.slug,
        detail:
          [exam.vendor || (vendor && vendor.name), code ? `Code ${code}` : ""]
            .filter(Boolean)
            .join(" · ") || exam.shortDescription || "",
        type: code ? `Exam · Code ${code}` : "Exam",
        vendor,
        exam,
      });
    });

    return results;
  }
  function positionSearchSuggestions() {
    if (searchSuggestions.hidden) return;
    const bounds = searchShell.getBoundingClientRect();
    if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
      closeSearchSuggestions();
      return;
    }
    searchSuggestions.style.left = `${Math.round(bounds.left)}px`;
    searchSuggestions.style.top = `${Math.round(bounds.bottom + 8)}px`;
    searchSuggestions.style.width = `${Math.round(bounds.width)}px`;
  }
  function closeSearchSuggestions() {
    searchSuggestions.hidden = true;
    search.setAttribute("aria-expanded", "false");
    search.removeAttribute("aria-activedescendant");
    activeSearchSuggestionIndex = -1;
    currentSearchSuggestions = [];
  }
  function setActiveSearchSuggestion(index) {
    const options = searchSuggestionOptions.querySelectorAll(
      "[data-search-suggestion-index]",
    );
    if (!options.length) return;
    activeSearchSuggestionIndex =
      (index + options.length) % options.length;
    options.forEach((option, optionIndex) => {
      const active = optionIndex === activeSearchSuggestionIndex;
      option.setAttribute("aria-selected", String(active));
      if (active) {
        search.setAttribute("aria-activedescendant", option.id);
        option.scrollIntoView({ block: "nearest" });
      }
    });
  }
  function selectSearchSuggestion(index) {
    const suggestion = currentSearchSuggestions[index];
    if (!suggestion) return;
    closeSearchSuggestions();
    if (suggestion.kind === "exam") {
      if (suggestion.vendor)
        openVendor(
          suggestion.vendor,
          suggestion.exam.id || suggestion.exam.slug || "",
        );
      return;
    }
    if (suggestion.vendor) openVendor(suggestion.vendor);
  }
  function renderSearchSuggestions() {
    const query = search.value.trim();
    if (!query) {
      closeSearchSuggestions();
      return;
    }

    currentSearchSuggestions = buildSearchSuggestions(query);
    activeSearchSuggestionIndex = -1;
    search.removeAttribute("aria-activedescendant");
    searchSuggestionOptions.innerHTML = currentSearchSuggestions
      .map(
        (suggestion, index) => `
          <button
            type="button"
            class="search-suggestion"
            id="searchSuggestion-${index}"
            role="option"
            tabindex="-1"
            aria-selected="false"
            data-search-suggestion-index="${index}"
          >
            <span class="search-suggestion-title">${escapeHTML(suggestion.title)}</span>
            <span class="search-suggestion-detail">${escapeHTML(suggestion.detail)}</span>
            <span class="search-suggestion-type">${escapeHTML(suggestion.type)}</span>
          </button>`,
      )
      .join("");
    searchSuggestionOptions.hidden = currentSearchSuggestions.length === 0;
    searchNoResults.hidden = currentSearchSuggestions.length !== 0;
    searchSuggestions.hidden = false;
    search.setAttribute("aria-expanded", "true");
    positionSearchSuggestions();
  }

  filters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-letter]");
    if (!button) return;
    activeLetter = button.dataset.letter;
    renderAll();
  });
  categoryFilters.addEventListener("click", (event) => {
    const button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.dataset.category;
    renderAll();
  });
  search.addEventListener("input", () => {
    renderVendors();
    renderSearchSuggestions();
  });
  search.addEventListener("focus", renderSearchSuggestions);
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !searchSuggestions.hidden) {
      event.preventDefault();
      closeSearchSuggestions();
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (searchSuggestions.hidden) renderSearchSuggestions();
      if (!currentSearchSuggestions.length) return;
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex =
        activeSearchSuggestionIndex === -1
          ? direction === 1
            ? 0
            : currentSearchSuggestions.length - 1
          : activeSearchSuggestionIndex + direction;
      setActiveSearchSuggestion(nextIndex);
      return;
    }
    if (event.key === "Enter" && !searchSuggestions.hidden) {
      const index =
        activeSearchSuggestionIndex === -1
          ? 0
          : activeSearchSuggestionIndex;
      if (currentSearchSuggestions[index]) {
        event.preventDefault();
        selectSearchSuggestion(index);
      }
    }
  });
  searchSuggestionOptions.addEventListener("click", (event) => {
    const option = event.target.closest("[data-search-suggestion-index]");
    if (!option) return;
    selectSearchSuggestion(Number(option.dataset.searchSuggestionIndex));
  });
  document.addEventListener("click", (event) => {
    if (!searchShell.contains(event.target)) closeSearchSuggestions();
  });
  window.addEventListener("resize", positionSearchSuggestions);
  window.addEventListener("scroll", positionSearchSuggestions, true);
  clearSearch.addEventListener("click", () => {
    search.value = "";
    search.focus();
    renderVendors();
    renderSearchSuggestions();
  });
  sort.addEventListener("change", renderVendors);
  document.getElementById("resetFilters").addEventListener("click", () => {
    activeLetter = "All";
    activeCategory = "All";
    search.value = "";
    closeSearchSuggestions();
    sort.value = "az";
    renderAll();
  });

  const modalElement = document.getElementById("vendorModal");
  const vendorModal = new bootstrap.Modal(modalElement);
  const modalDialog = modalElement.querySelector(".modal-dialog");
  const vendorExamLibraryView = document.getElementById(
    "vendorExamLibraryView",
  );
  const vendorExamDetail = document.getElementById("vendorExamDetail");
  const vendorModalCategories = document.getElementById(
    "vendorModalCategories",
  );
  const vendorLibrarySearch = document.getElementById("vendorLibrarySearch");
  const vendorLibrarySearchControls = document.getElementById(
    "vendorLibrarySearchControls",
  );
  const vendorSearchEmpty = document.getElementById("vendorSearchEmpty");
  const vendorExamLibrary = document.getElementById("vendorExamLibrary");
  const vendorExamActionStatus = document.getElementById(
    "vendorExamActionStatus",
  );
  const vendorModalBody = modalElement.querySelector(".modal-body");
  let vendorExamListScrollTop = 0;

  function showVendorExamLibrary() {
    window.dispatchEvent(new CustomEvent("exam:closed"));
    activeExam = null;
    vendorExamDetail.hidden = true;
    vendorExamLibraryView.hidden = false;
    vendorModalCategories.hidden = vendorModalCategories.childElementCount === 0;
    vendorLibrarySearchControls.hidden = false;
    vendorModalBody.scrollTop = vendorExamListScrollTop;
  }

  function showVendorExamDetail(exam) {
    if (!vendorExamLibraryView.hidden) {
      vendorExamListScrollTop = vendorModalBody.scrollTop;
    }
    activeExam = exam;
    vendorExamLibraryView.hidden = true;
    vendorExamDetail.hidden = false;
    vendorModalCategories.hidden = true;
    vendorLibrarySearchControls.hidden = true;
    vendorModalBody.scrollTop = 0;
    const article = document.getElementById("vendorExamArticle");
    article.hidden = exam.vendorId !== article.dataset.vendorId;
    modalDialog.classList.remove("modal-lg");
    modalDialog.classList.add("modal-xl");
    vendorExamActionStatus.textContent = "";

    const cover = document.getElementById("vendorExamCover");
    cover.src = defaultExamCover;
    cover.alt = `${exam.vendor} ${exam.examCode} exam preparation study guide cover`;
    document.getElementById("vendorExamVendor").textContent = exam.vendor;
    document.getElementById("vendorExamDetailTitle").textContent =
      exam.examTitle;
    document.getElementById("vendorExamMetrics").innerHTML = [
      ["Exam code", exam.examCode],
      ["Question count", exam.questionCount],
      ["Updated", exam.updatedYear],
    ]
      .map(
        ([label, value]) =>
          `<div><span>${escapeHTML(label)}</span><strong>${escapeHTML(value)}</strong></div>`,
      )
      .join("");
    document.getElementById("vendorExamDescription").textContent =
      exam.detailDescription;
    document.getElementById("vendorExamBenefits").innerHTML = (
      exam.benefits || []
    )
      .map((benefit) => `<li>${escapeHTML(benefit)}</li>`)
      .join("");
    document.getElementById("vendorExamPrice").textContent =
      `$${Number(exam.price).toFixed(2)}`;
    document.getElementById("vendorExamAccess").textContent = exam.accessType;
    document.getElementById("buyExamNow").textContent =
      `Buy Now for $${Number(exam.price).toFixed(2)}`;

    const previewImage = document.getElementById("examCoverPreviewImage");
    previewImage.src = defaultExamCover;
    previewImage.alt = cover.alt;
    window.dispatchEvent(new CustomEvent("exam:detail", { detail: exam }));
  }

  function openVendor(vendor, requestedExamId = "") {
    currentVendor = vendor;
    document.getElementById("vendorModalTitle").textContent = vendor.name;
    document.getElementById("vendorModalDescription").textContent =
      vendor.description;
    const logo = vendor.logoUrl
      ? `<img src="${escapeHTML(vendor.logoUrl)}" alt="${escapeHTML(vendor.name)} logo" decoding="async" onerror="this.hidden=true;this.nextElementSibling.hidden=false"><span class="vendor-logo-fallback" hidden>${escapeHTML(vendor.logoText || vendor.name)}</span>`
      : `<span class="vendor-logo-fallback">${escapeHTML(vendor.logoText || vendor.name)}</span>`;
    document.getElementById("vendorModalLogo").innerHTML = logo;
    const certifications = vendor.certifications || [];
    const visibleCertifications =
      activeCategory === "All"
        ? certifications
        : certifications.filter((certification) =>
            (certification.categories || []).includes(activeCategory),
          );
    const modalCategories = [
      ...new Set(
        visibleCertifications.flatMap(
          (certification) => certification.categories || [],
        ),
      ),
    ];
    document.getElementById("vendorModalCategories").innerHTML = (
      modalCategories.length ? modalCategories : vendor.categories || []
    )
      .map(
        (category) =>
          `<span class="vendor-category">${escapeHTML(category)}</span>`,
      )
      .join("");
    const vendorLibraryExams = examLibrary.filter(
      (exam) => exam.vendorId === vendor.id,
    );
    activeVendorLibraryExams = vendorLibraryExams;
    vendorExamListScrollTop = 0;
    vendorModalBody.scrollTop = 0;
    showVendorExamLibrary();
    modalDialog.classList.toggle("modal-xl", vendorLibraryExams.length > 0);
    modalDialog.classList.toggle("modal-lg", vendorLibraryExams.length === 0);
    const demoCartSection = document.getElementById("demoCartSection");
    vendorLibrarySearch.value = requestedExamId;

    function renderVendorLibrary() {
      const term = vendorLibrarySearch.value.trim().toLowerCase();
      const filteredCertifications = visibleCertifications.filter(
        (certification) =>
          !term ||
          `${certification.name || ""} ${certification.code || ""} ${certification.credentialCode || ""} ${certification.description || ""}`
            .toLowerCase()
            .includes(term),
      );
      const filteredExams = vendorLibraryExams.filter(
        (exam) =>
          !term ||
          `${exam.id || ""} ${exam.examCode || ""} ${exam.examTitle || ""} ${exam.shortDescription || ""} ${exam.detailDescription || ""} ${exam.description || ""}`
            .toLowerCase()
            .includes(term),
      );
      vendorExamLibrary.innerHTML = filteredExams.length
        ? filteredExams
            .map((exam) => {
              const metrics = [
                exam.questionCount,
                exam.updatedYear ? `Updated ${exam.updatedYear}` : "",
              ].filter(Boolean);
              const hasPrice =
                exam.price !== null &&
                exam.price !== undefined &&
                Number.isFinite(Number(exam.price));
              const price = hasPrice
                ? `$${Number(exam.price).toFixed(2)}`
                : "";
              const detailUrl = `/vendors/?vendor=${encodeURIComponent(exam.vendorId)}&exam=${encodeURIComponent(exam.id)}`;
              return `
          <li>
            <a class="vendor-exam-row" href="${escapeHTML(detailUrl)}" data-exam-id="${escapeHTML(exam.id)}" aria-label="View details for ${escapeHTML(exam.examTitle)}">
            <div class="vendor-exam-row-information">
              <img class="vendor-exam-row-cover" src="${defaultExamCover}" alt="${escapeHTML(exam.examCode)} exam preparation book cover" loading="lazy" decoding="async">
              <div>
                <span class="vendor-exam-row-code">${escapeHTML(exam.examCode)}</span>
                ${metrics.length ? `<span class="vendor-exam-row-meta">${metrics.map(escapeHTML).join(" · ")}</span>` : ""}
                <h4 class="vendor-exam-row-title">${escapeHTML(exam.examTitle)}</h4>
                <p class="vendor-exam-row-description">${escapeHTML(exam.shortDescription)}</p>
              </div>
            </div>
            <div class="vendor-exam-row-actions">
              ${price ? `<span class="vendor-exam-row-price">${price}</span>` : ""}
              ${exam.accessType ? `<span class="vendor-exam-row-access">${escapeHTML(exam.accessType)}</span>` : ""}
              <span class="vendor-exam-row-button">Details <i class="fa-solid fa-arrow-right" aria-hidden="true"></i></span>
            </div>
            </a>
          </li>`;
            })
            .join("")
        : term
          ? ""
          : `<li class="certification-empty">No verified exam listings are available for this vendor.</li>`;
      vendorSearchEmpty.hidden =
        !term || filteredCertifications.length > 0 || filteredExams.length > 0;
    }
    vendorLibrarySearch.oninput = renderVendorLibrary;
    renderVendorLibrary();
    demoCartSection.hidden = !(vendor.exams || []).length;
    const requestedExam = vendorLibraryExams.find(
      (exam) => exam.id === requestedExamId || exam.slug === requestedExamId,
    );
    if (requestedExam) showVendorExamDetail(requestedExam);

    const examList = document.getElementById("examList");
    examList.innerHTML =
      (vendor.exams || [])
        .map(
          (exam) => `
      <div class="exam-item">
        <div><h4>${escapeHTML(exam.name)}</h4><p>Demo cart item · not an official exam</p></div>
        <div class="d-flex align-items-center gap-3"><span class="exam-price">$${Number(exam.price).toFixed(2)}</span><button class="btn btn-orange add-product" data-exam="${escapeHTML(exam.id)}"><i class="fa-solid fa-cart-plus me-1"></i> Add</button></div>
      </div>`,
        )
        .join("") ||
      `<p class="muted-copy">No sample products have been added for this vendor yet.</p>`;
    vendorModal.show();
  }
  vendorExamLibrary.addEventListener("click", (event) => {
    const card = event.target.closest("[data-exam-id]");
    if (!card) return;
    event.preventDefault();
    const exam = activeVendorLibraryExams.find(
      (item) => item.id === card.dataset.examId,
    );
    if (exam) showVendorExamDetail(exam);
  });
  document
    .getElementById("backToExamLibrary")
    .addEventListener("click", () => showVendorExamLibrary());
  document.getElementById("previewExamCover").addEventListener("click", () => {
    if (activeExam) document.getElementById("examCoverPreview").showModal();
  });
  document
    .getElementById("closeExamCoverPreview")
    .addEventListener("click", () => {
      document.getElementById("examCoverPreview").close();
    });
  document
    .getElementById("examCoverPreview")
    .addEventListener("click", (event) => {
      if (event.target === event.currentTarget) event.currentTarget.close();
    });
  document.getElementById("addExamToCart").addEventListener("click", () => {
    if (!activeExam) return;
    if (!window.CertiCart?.add) {
      vendorExamActionStatus.textContent =
        "Cart integration is unavailable. The item was not added.";
      return;
    }
    window.CertiCart.add(
      {
        id: activeExam.id,
        name: activeExam.examTitle,
        code: activeExam.examCode,
        price: activeExam.price,
      },
      activeExam.vendor,
    );
    vendorExamActionStatus.textContent = `${activeExam.examTitle} added to your cart.`;
  });
  document.getElementById("buyExamNow").addEventListener("click", () => {
    vendorExamActionStatus.textContent =
      "Checkout is not connected. No payment or order was created.";
  });
  grid.addEventListener("click", (event) => {
    const link = event.target.closest("[data-vendor]");
    if (!link) return;
    event.preventDefault();
    const vendor = vendors.find((item) => item.id === link.dataset.vendor);
    if (vendor) openVendor(vendor);
  });
  document.getElementById("examList").addEventListener("click", (event) => {
    const button = event.target.closest(".add-product");
    if (!button || !currentVendor) return;
    const exam = currentVendor.exams.find(
      (item) => item.id === button.dataset.exam,
    );
    if (exam) window.CertiCart?.add(exam, currentVendor.name);
  });

  const heroVendorCount = document.getElementById("heroVendorCount");
  if (heroVendorCount) heroVendorCount.textContent = vendors.length;
  renderAll();
  const requestedVendor = new URLSearchParams(window.location.search).get(
    "vendor",
  );
  if (requestedVendor) {
    const vendor = vendors.find((item) => item.id === requestedVendor);
    if (vendor)
      openVendor(
        vendor,
        new URLSearchParams(window.location.search).get("exam") || "",
      );
  }
})();
