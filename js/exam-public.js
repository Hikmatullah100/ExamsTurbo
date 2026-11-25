// Public exam page: exam_content (article, FAQs, demo questions, scenarios, SEO) dikhata hai.
// main.js se "exam:detail" aur "exam:closed" events sunta hai. window.EXAM_CONTENT data-loader.js bharta hai.
(() => {
  "use strict";

  /* ---------- Sanitizer (sirf jaaiz formatting rakhta hai) ---------- */
  const ALLOWED = {
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [], p: [], br: [], hr: [],
    strong: [], b: [], em: [], i: [], u: [], s: [], sup: [], sub: [],
    ul: [], ol: [], li: [], blockquote: [], code: [], pre: [], span: [], div: [],
    a: ["href", "title"],
    img: ["src", "alt", "title", "width", "height"],
    table: [], thead: [], tbody: [], tfoot: [], tr: [],
    th: ["colspan", "rowspan"], td: ["colspan", "rowspan"],
    figure: [], figcaption: [],
  };
  const DROP = new Set([
    "script", "style", "iframe", "object", "embed", "form", "input", "button",
    "textarea", "select", "link", "meta", "svg", "math", "noscript", "template",
    "base", "title", "head",
  ]);
  const clean = (v) => String(v).replace(/[\u0000- \u007f-\u009f]+/g, "");
  const safeLink = (v) => {
    const s = clean(v).toLowerCase();
    if (!s) return false;
    if (/^(https?:|mailto:|tel:)/.test(s)) return true;
    return !/^[a-z][a-z0-9+.-]*:/.test(s); // relative / # / path
  };
  const safeImg = (v) => {
    const s = clean(v).toLowerCase();
    if (!s) return false;
    if (/^https?:/.test(s)) return true;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/.test(s)) return true;
    return !/^[a-z][a-z0-9+.-]*:/.test(s);
  };

  function sanitizeInto(source, target) {
    source.childNodes.forEach((node) => {
      if (node.nodeType === 3) {
        target.appendChild(document.createTextNode(node.nodeValue));
        return;
      }
      if (node.nodeType !== 1) return;
      const tag = node.tagName.toLowerCase();
      if (DROP.has(tag)) return;
      if (!Object.prototype.hasOwnProperty.call(ALLOWED, tag)) {
        sanitizeInto(node, target); // anjaan tag: sirf andar ka matn rakho
        return;
      }
      const el = document.createElement(tag);
      for (const attr of ALLOWED[tag]) {
        if (!node.hasAttribute(attr)) continue;
        const value = node.getAttribute(attr);
        if (tag === "a" && attr === "href" && !safeLink(value)) continue;
        if (tag === "img" && attr === "src" && !safeImg(value)) continue;
        el.setAttribute(attr, value);
      }
      if (tag === "a" && el.hasAttribute("href")) {
        if (/^https?:/i.test(clean(el.getAttribute("href")))) {
          el.setAttribute("target", "_blank");
          el.setAttribute("rel", "noopener noreferrer");
        }
      }
      if (tag === "img") {
        if (!el.hasAttribute("src")) return;
        el.setAttribute("loading", "lazy");
        el.setAttribute("decoding", "async");
      }
      sanitizeInto(node, el);
      target.appendChild(el);
    });
  }
  function sanitizeHTML(html) {
    const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
    const frag = document.createDocumentFragment();
    sanitizeInto(doc.body, frag);
    return frag;
  }

  /* ---------- Chhote helpers ---------- */
  const h = (tag, props = {}, children = []) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else el.setAttribute(k, v === true ? "" : v);
    }
    [].concat(children).forEach((c) => {
      if (c) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  };
  const str = (v) => (v === null || v === undefined ? "" : String(v).trim());
  const arr = (v) => (Array.isArray(v) ? v : []);

  /* ---------- Data ko saaf shakl dena ---------- */
  function normFaq(item) {
    if (!item || typeof item !== "object") return null;
    const q = str(item.question ?? item.q ?? item.title);
    const a = str(item.answer ?? item.a ?? item.text);
    return q && a ? { q, a } : null;
  }

  function resolveCorrect(item, options) {
    // options objects me flag ho to
    const raw = Array.isArray(item.options ?? item.choices ?? item.answers)
      ? item.options ?? item.choices ?? item.answers
      : [];
    const flagged = raw.findIndex(
      (o) => o && typeof o === "object" && (o.correct === true || o.isCorrect === true || o.is_correct === true),
    );
    if (flagged >= 0) return flagged;
    const c =
      item.correct ?? item.correctIndex ?? item.correct_index ??
      item.correctAnswer ?? item.correct_answer ?? item.correctOption ??
      item.correct_option ?? item.answer;
    if (c === null || c === undefined || c === "") return -1;
    if (typeof c === "number") return c >= 0 && c < options.length ? c : -1;
    const s = String(c).trim();
    if (/^[A-Za-z]$/.test(s)) {
      const i = s.toUpperCase().charCodeAt(0) - 65;
      return i < options.length ? i : -1;
    }
    if (/^\d+$/.test(s)) {
      const i = Number(s);
      return i < options.length ? i : -1;
    }
    const byText = options.findIndex((o) => o.toLowerCase() === s.toLowerCase());
    return byText;
  }

  // Admin ke likhe prefixes ("Q2.", "A)") hata do, kyunke page khud labels lagata hai
  const stripQ = (t) => t.replace(/^\s*(?:q(?:uestion)?\s*)?\d+\s*[.):\-]\s*/i, "");
  const stripOpt = (t) => t.replace(/^\s*\(?[A-Da-d]\s*[.):]\s+/, "").replace(/^\s*\(?[A-Da-d][.)]\s*(?=\S)/, "");
  // "Correct Answer: A) ..." wali pehli line hata do (page khud sahi jawab batata hai)
  const stripAnswerLine = (t) => {
    const lines = t.split(/\r?\n/);
    if (/^\s*correct\s+answer\s*:/i.test(lines[0]) && lines[0].length < 120) lines.shift();
    return lines.join("\n").trim();
  };

  function normQuestion(item) {
    if (!item || typeof item !== "object") return null;
    const text = stripQ(str(item.question ?? item.text ?? item.prompt ?? item.q));
    let opts = item.options ?? item.choices ?? item.answers;
    if (!Array.isArray(opts)) {
      opts = ["a", "b", "c", "d"]
        .map((k) => item["option_" + k] ?? item["option" + k.toUpperCase()] ?? item[k])
        .filter((v) => v !== undefined);
    }
    const options = opts
      .map((o) => stripOpt(o && typeof o === "object" ? str(o.text ?? o.label ?? o.value) : str(o)))
      .filter(Boolean);
    if (!text || options.length < 2) return null;
    return {
      text,
      options,
      correct: resolveCorrect(item, options),
      explanation: stripAnswerLine(str(item.explanation ?? item.rationale ?? item.reason)),
    };
  }

  function normScenario(item) {
    if (!item || typeof item !== "object") return null;
    const title = str(item.title ?? item.heading ?? item.name);
    const body = str(item.description ?? item.text ?? item.body ?? item.scenario ?? item.content);
    return title || body ? { title, body } : null;
  }

  /* ---------- Render: FAQs ---------- */
  function renderFaqs(list, examId) {
    const faqs = list.map(normFaq).filter(Boolean);
    if (!faqs.length) return null;
    const parentId = `examFaqAcc-${examId}`;
    const acc = h("div", { class: "accordion custom-accordion", id: parentId });
    faqs.forEach((f, i) => {
      const cid = `examFaq-${examId}-${i}`;
      acc.appendChild(
        h("div", { class: "accordion-item" }, [
          h("h3", { class: "accordion-header" }, [
            h("button", {
              class: "accordion-button" + (i ? " collapsed" : ""),
              type: "button",
              "data-bs-toggle": "collapse",
              "data-bs-target": `#${cid}`,
              "aria-expanded": i ? "false" : "true",
              "aria-controls": cid,
              text: f.q,
            }),
          ]),
          h("div", {
            id: cid,
            class: "accordion-collapse collapse" + (i ? "" : " show"),
            "data-bs-parent": `#${parentId}`,
          }, [h("div", { class: "accordion-body exam-faq-answer", text: f.a })]),
        ]),
      );
    });
    return h("section", { class: "exam-extra-block", "aria-labelledby": "examFaqHeading" }, [
      h("h3", { class: "modal-subheading", id: "examFaqHeading", text: "FREQUENTLY ASKED QUESTIONS" }),
      acc,
    ]);
  }

  /* ---------- Render: Demo questions ---------- */
  function renderQuestions(list, examId) {
    const qs = list.map(normQuestion).filter(Boolean);
    if (!qs.length) return null;
    const wrap = h("div", { class: "exam-demo-list" });
    qs.forEach((q, qi) => {
      const name = `examQ-${examId}-${qi}`;
      const result = h("div", { class: "exam-demo-result", role: "status", "aria-live": "polite" });
      const checkBtn = h("button", { type: "button", class: "btn btn-orange btn-sm", disabled: true, text: "Check Answer" });
      const resetBtn = h("button", { type: "button", class: "btn btn-outline-light btn-sm", hidden: true, text: "Try Again" });
      const labels = [];
      const inputs = [];
      const optionsEl = h("div", { class: "exam-demo-options", role: "radiogroup", "aria-label": `Question ${qi + 1} options` });
      q.options.forEach((opt, oi) => {
        const input = h("input", { type: "radio", name, value: String(oi), id: `${name}-${oi}` });
        const label = h("label", { class: "exam-demo-option", for: `${name}-${oi}` }, [
          input,
          h("span", { class: "exam-demo-letter", text: String.fromCharCode(65 + oi) }),
          h("span", { class: "exam-demo-text", text: opt }),
        ]);
        input.addEventListener("change", () => { checkBtn.disabled = false; });
        inputs.push(input);
        labels.push(label);
        optionsEl.appendChild(label);
      });
      checkBtn.addEventListener("click", () => {
        const chosen = inputs.findIndex((i) => i.checked);
        if (chosen < 0) return;
        inputs.forEach((i) => (i.disabled = true));
        labels.forEach((l) => l.classList.remove("is-correct", "is-wrong"));
        result.textContent = "";
        const msg = h("strong");
        if (q.correct >= 0) {
          labels[q.correct].classList.add("is-correct");
          if (chosen === q.correct) {
            msg.textContent = "Correct. ";
          } else {
            labels[chosen].classList.add("is-wrong");
            msg.textContent = `Not quite. Correct answer: ${String.fromCharCode(65 + q.correct)}. `;
          }
        }
        result.appendChild(msg);
        if (q.explanation) result.appendChild(document.createTextNode(q.explanation));
        result.classList.add("show");
        checkBtn.hidden = true;
        resetBtn.hidden = false;
      });
      resetBtn.addEventListener("click", () => {
        inputs.forEach((i) => { i.disabled = false; i.checked = false; });
        labels.forEach((l) => l.classList.remove("is-correct", "is-wrong"));
        result.textContent = "";
        result.classList.remove("show");
        checkBtn.hidden = false;
        checkBtn.disabled = true;
        resetBtn.hidden = true;
      });
      wrap.appendChild(
        h("article", { class: "exam-demo-card" }, [
          h("div", { class: "exam-demo-number", text: `Question ${qi + 1}` }),
          h("p", { class: "exam-demo-question", text: q.text }),
          optionsEl,
          h("div", { class: "exam-demo-actions" }, [checkBtn, resetBtn]),
          result,
        ]),
      );
    });
    return h("section", { class: "exam-extra-block", "aria-labelledby": "examDemoHeading" }, [
      h("h3", { class: "modal-subheading", id: "examDemoHeading", text: "SAMPLE DEMO QUESTIONS" }),
      wrap,
    ]);
  }

  /* ---------- Render: Scenarios ---------- */
  function renderScenarios(list) {
    const items = list.map(normScenario).filter(Boolean);
    if (!items.length) return null;
    const grid = h("div", { class: "exam-scenario-grid" });
    items.forEach((s) => {
      grid.appendChild(
        h("article", { class: "exam-scenario-card" }, [
          h("span", { class: "exam-scenario-label", text: "Illustrative example · not a customer review" }),
          s.title ? h("h4", { text: s.title }) : null,
          s.body ? h("p", { text: s.body }) : null,
        ]),
      );
    });
    return h("section", { class: "exam-extra-block", "aria-labelledby": "examScenarioHeading" }, [
      h("h3", { class: "modal-subheading", id: "examScenarioHeading", text: "ILLUSTRATIVE PREPARATION SCENARIOS" }),
      h("p", { class: "exam-scenario-note", text: "These are illustrative examples for study planning. They are not customer reviews." }),
      grid,
    ]);
  }

  /* ---------- SEO ---------- */
  let seoSaved = null;
  function metaTag(name) {
    return document.head.querySelector(`meta[name="${name}"]`);
  }
  function applySeo(content) {
    if (!seoSaved) {
      const d = metaTag("description");
      const k = metaTag("keywords");
      seoSaved = {
        title: document.title,
        description: d ? d.getAttribute("content") : null,
        keywords: k ? k.getAttribute("content") : null,
        hadKeywordsTag: !!k,
      };
    }
    const title = str(content.meta_title);
    const desc = str(content.meta_description);
    const keys = str(content.meta_keywords);
    if (title) document.title = title;
    if (desc) {
      let d = metaTag("description");
      if (!d) { d = h("meta", { name: "description" }); document.head.appendChild(d); }
      d.setAttribute("content", desc);
    }
    if (keys) {
      let k = metaTag("keywords");
      if (!k) { k = h("meta", { name: "keywords" }); document.head.appendChild(k); }
      k.setAttribute("content", keys);
    }
  }
  function restoreSeo() {
    if (!seoSaved) return;
    document.title = seoSaved.title;
    const d = metaTag("description");
    if (d && seoSaved.description !== null) d.setAttribute("content", seoSaved.description);
    const k = metaTag("keywords");
    if (k) {
      if (seoSaved.hadKeywordsTag) k.setAttribute("content", seoSaved.keywords || "");
      else k.remove();
    }
    seoSaved = null;
  }
  function setFaqSchema(list) {
    removeFaqSchema();
    const faqs = list.map(normFaq).filter(Boolean);
    if (!faqs.length) return;
    const data = {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    };
    const s = document.createElement("script");
    s.type = "application/ld+json";
    s.id = "examFaqSchema";
    s.textContent = JSON.stringify(data).replace(/</g, "\\u003c");
    document.head.appendChild(s);
  }
  function removeFaqSchema() {
    document.getElementById("examFaqSchema")?.remove();
  }

  /* ---------- Customer reviews ---------- */
  const starText = (n) => "★".repeat(n) + "☆".repeat(5 - n);
  const fmtDate = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  };

  async function loadReviews(examId) {
    const sb = window.supabaseClient;
    if (!sb) return null;
    const { data, error } = await sb
      .from("exam_reviews_public")
      .select("id,reviewer_name,rating,title,body,created_at")
      .eq("exam_id", examId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("Reviews load failed:", error);
      return null;
    }
    return data || [];
  }

  function reviewList(reviews) {
    const wrap = h("div", { class: "exam-review-list" });
    if (!reviews.length) {
      wrap.appendChild(h("p", { class: "exam-review-empty", text: "No customer reviews yet. Be the first to share your experience." }));
      return wrap;
    }
    const avg = reviews.reduce((t, r) => t + Number(r.rating || 0), 0) / reviews.length;
    wrap.appendChild(
      h("div", { class: "exam-review-summary" }, [
        h("strong", { class: "exam-review-avg", text: avg.toFixed(1) }),
        h("span", { class: "exam-review-stars", "aria-hidden": "true", text: starText(Math.round(avg)) }),
        h("span", { class: "exam-review-count", text: `Based on ${reviews.length} verified review${reviews.length === 1 ? "" : "s"}` }),
      ]),
    );
    reviews.forEach((r) => {
      const rating = Math.max(1, Math.min(5, Number(r.rating) || 1));
      wrap.appendChild(
        h("article", { class: "exam-review-card" }, [
          h("div", { class: "exam-review-head" }, [
            h("span", { class: "exam-review-stars", role: "img", "aria-label": `${rating} out of 5 stars`, text: starText(rating) }),
            h("strong", { text: str(r.reviewer_name) }),
            h("time", { datetime: str(r.created_at), text: fmtDate(r.created_at) }),
          ]),
          str(r.title) ? h("h4", { text: str(r.title) }) : null,
          h("p", { text: str(r.body) }),
        ]),
      );
    });
    return wrap;
  }

  function reviewForm(examId) {
    const name = h("input", { class: "form-control", type: "text", id: `rvName-${examId}`, maxlength: "80", required: true, autocomplete: "name" });
    const title = h("input", { class: "form-control", type: "text", id: `rvTitle-${examId}`, maxlength: "100" });
    const body = h("textarea", { class: "form-control", id: `rvBody-${examId}`, rows: "4", maxlength: "1500", required: true });
    const verify = h("input", { class: "form-control", type: "text", id: `rvVerify-${examId}`, maxlength: "200", required: true, placeholder: "Order number or the email used for the purchase" });
    const trap = h("input", { type: "text", name: "website", tabindex: "-1", autocomplete: "off", "aria-hidden": "true" });
    const msg = h("div", { class: "exam-review-msg", role: "status", "aria-live": "polite" });
    const submit = h("button", { type: "submit", class: "btn btn-orange", text: "Submit Review" });

    const ratingBox = h("div", { class: "exam-review-rating", role: "radiogroup", "aria-label": "Rating" });
    for (let n = 1; n <= 5; n++) {
      ratingBox.appendChild(
        h("label", { class: "exam-review-rate-option" }, [
          h("input", { type: "radio", name: `rvRate-${examId}`, value: String(n) }),
          h("span", { text: `${n} ★` }),
        ]),
      );
    }

    const field = (label, id, control, hint) =>
      h("div", { class: "mb-3" }, [
        h("label", { class: "form-label", for: id, text: label }),
        control,
        hint ? h("div", { class: "form-text", text: hint }) : null,
      ]);

    const form = h("form", { class: "exam-review-form", novalidate: true }, [
      h("h4", { text: "Write a review" }),
      h("p", { class: "exam-review-note", text: "Reviews are checked before they appear. Only reviews from verified purchases are approved." }),
      field("Your name", `rvName-${examId}`, name),
      h("div", { class: "mb-3" }, [h("span", { class: "form-label d-block", text: "Rating" }), ratingBox]),
      field("Review title (optional)", `rvTitle-${examId}`, title),
      field("Your review", `rvBody-${examId}`, body, "At least 20 characters."),
      field("Order number or email", `rvVerify-${examId}`, verify, "Used only to verify your purchase. It is never shown publicly."),
      h("div", { class: "exam-review-trap" }, [trap]),
      submit,
      msg,
    ]);

    const say = (text, ok) => {
      msg.textContent = text;
      msg.className = "exam-review-msg " + (ok ? "ok" : "err");
    };

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const rating = Number(form.querySelector(`input[name="rvRate-${examId}"]:checked`)?.value || 0);
      const values = {
        name: name.value.trim(),
        title: title.value.trim(),
        body: body.value.trim(),
        verify: verify.value.trim(),
      };
      if (values.name.length < 2) return say("Please enter your name.", false);
      if (!rating) return say("Please choose a rating.", false);
      if (values.body.length < 20) return say("Please write at least 20 characters.", false);
      if (!values.verify) return say("Please enter your order number or email.", false);
      if (trap.value) { // bot: chup chaap kamyab dikhao
        form.reset();
        return say("Thank you. Your review will appear after verification.", true);
      }
      try {
        const last = Number(localStorage.getItem("examReviewLast") || 0);
        if (Date.now() - last < 30000) return say("Please wait a moment before sending another review.", false);
      } catch (e) { /* storage band ho to koi masla nahi */ }

      const sb = window.supabaseClient;
      if (!sb) return say("Reviews are unavailable right now. Please try again later.", false);

      const isEmail = values.verify.includes("@");
      submit.disabled = true;
      say("Sending...", true);
      const { error } = await sb.from("exam_reviews").insert({
        exam_id: examId,
        reviewer_name: values.name,
        rating,
        title: values.title || null,
        body: values.body,
        order_ref: isEmail ? null : values.verify,
        reviewer_email: isEmail ? values.verify : null,
        status: "pending",
      });
      submit.disabled = false;
      if (error) {
        console.warn("Review submit failed:", error);
        return say("Sorry, your review could not be sent. Please check your details and try again.", false);
      }
      try { localStorage.setItem("examReviewLast", String(Date.now())); } catch (e) { /* ignore */ }
      form.reset();
      say("Thank you! Your review was received and will appear after verification.", true);
    });
    return form;
  }

  async function renderReviews(exam, token, box) {
    const examId = String(exam.id);
    const reviews = await loadReviews(examId);
    if (token !== showToken) return; // user kisi aur exam par chala gaya
    const section = h("section", { class: "exam-extra-block", id: "examReviewsBlock", "aria-labelledby": "examReviewsHeading" }, [
      h("h3", { class: "modal-subheading", id: "examReviewsHeading", text: "CUSTOMER REVIEWS" }),
      reviews === null ? h("p", { class: "exam-review-empty", text: "Reviews could not be loaded right now." }) : reviewList(reviews),
      window.supabaseClient ? reviewForm(examId) : null,
    ]);
    box.appendChild(section);
  }

  /* ---------- Page se jorna ---------- */
  let originalArticleHTML = null;
  const articleEl = () => document.getElementById("vendorExamArticle");

  function extraContainer() {
    let box = document.getElementById("examExtraContent");
    if (!box) {
      box = h("div", { id: "examExtraContent", class: "exam-extra" });
      const article = articleEl();
      article.parentNode.insertBefore(box, article.nextSibling);
    }
    return box;
  }

  let showToken = 0;

  /* ---------- "Demo Questions" jump button (purchase panel mein) ---------- */
  function removeDemoJump() {
    document.getElementById("demoJumpBtn")?.remove();
  }

  function addDemoJump(target) {
    removeDemoJump();
    const panel = document.querySelector("#vendorModal .vendor-exam-purchase");
    if (!panel || !target) return;
    const btn = h("button", { type: "button", id: "demoJumpBtn", class: "btn btn-outline-light w-100" }, [
      h("i", { class: "fa-solid fa-circle-question me-2", "aria-hidden": "true" }),
      document.createTextNode("Demo Questions"),
    ]);
    btn.addEventListener("click", () => {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      target.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
      target.classList.add("exam-jump-highlight");
      setTimeout(() => target.classList.remove("exam-jump-highlight"), 1600);
    });
    const anchor = panel.querySelector(".vendor-exam-disclaimer");
    if (anchor) panel.insertBefore(btn, anchor);
    else panel.appendChild(btn);
  }

  function reset() {
    showToken++; // purane async kaam ko cancel karo
    removeDemoJump();
    const article = articleEl();
    if (article && originalArticleHTML !== null) {
      article.innerHTML = originalArticleHTML;
      originalArticleHTML = null;
    }
    document.getElementById("examExtraContent")?.replaceChildren();
    removeFaqSchema();
    restoreSeo();
  }

  function show(exam) {
    reset();
    const token = showToken;
    const content = (window.EXAM_CONTENT || {})[exam.id];
    const box = extraContainer();

    if (content) {
      applySeo(content);

      const article = articleEl();
      const html = str(content.article_html);
      if (html) {
        originalArticleHTML = article.innerHTML;
        article.replaceChildren(sanitizeHTML(html));
        article.hidden = false;
      }

      const examId = String(exam.id).replace(/[^a-zA-Z0-9_-]/g, "-");
      const demoBlock = renderQuestions(arr(content.demo_questions), examId);
      [
        demoBlock,
        renderFaqs(arr(content.faqs), examId),
        renderScenarios(arr(content.scenarios)),
      ].forEach((block) => block && box.appendChild(block));
      if (demoBlock) addDemoJump(demoBlock);
      setFaqSchema(arr(content.faqs));
    }

    renderReviews(exam, token, box); // reviews hamesha (content ho ya na ho)
  }

  window.addEventListener("exam:detail", (e) => e.detail && show(e.detail));
  window.addEventListener("exam:closed", reset);
  document.getElementById("vendorModal")?.addEventListener("hidden.bs.modal", reset);

  // Testing ke liye
  window.__examPublic = { sanitizeHTML, normQuestion, normFaq, normScenario };
})();
