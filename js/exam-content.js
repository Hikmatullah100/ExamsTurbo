// Exam Content editor (admin dashboard)
// SEO metadata, FAQs, sample demo questions, preparation scenarios and the article.
// Data is stored in the exam_content table (one row per exam).

const MAX = { faqs: 12, demos: 10, scenarios: 6 };
const OPTION_COUNT = 4;
const LIMITS = { title: 70, description: 160, keywords: 300 };
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

const ALLOWED_TAGS = new Set([
  "P", "BR", "H1", "H2", "H3", "H4", "H5", "H6", "STRONG", "B", "EM", "I", "U", "UL", "OL", "LI",
  "BLOCKQUOTE", "A", "IMG", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "CODE", "PRE",
  "HR", "DIV", "SPAN",
]);
const DROP_TAGS = new Set([
  "SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META", "FORM", "INPUT",
  "BUTTON", "TEXTAREA", "SELECT", "SVG", "NOSCRIPT",
]);

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// Only http(s) links or links inside the site are allowed
function safeUrl(value) {
  const url = String(value || "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^[a-z0-9_\-./#?=&%]+$/i.test(url) && !/^[a-z]+:/i.test(url)) return url;
  return "";
}

// Cleans the article HTML so only safe formatting is saved
export function sanitizeHtml(html) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");

  const walk = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === 3) return; // text
      if (child.nodeType !== 1) {
        child.remove();
        return;
      }
      const tag = child.tagName.toUpperCase();
      if (DROP_TAGS.has(tag)) {
        child.remove();
        return;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        walk(child);
        child.replaceWith(...child.childNodes);
        return;
      }
      [...child.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase();
        const keep =
          (tag === "A" && name === "href") ||
          (tag === "IMG" && (name === "src" || name === "alt")) ||
          ((tag === "TD" || tag === "TH") && (name === "colspan" || name === "rowspan"));
        if (!keep) child.removeAttribute(attr.name);
      });
      if (tag === "A") {
        const href = safeUrl(child.getAttribute("href"));
        if (!href) {
          walk(child);
          child.replaceWith(...child.childNodes);
          return;
        }
        child.setAttribute("href", href);
        child.setAttribute("rel", "noopener noreferrer");
        child.setAttribute("target", "_blank");
      }
      if (tag === "IMG") {
        const src = safeUrl(child.getAttribute("src"));
        if (!src) {
          child.remove();
          return;
        }
        child.setAttribute("src", src);
      }
      walk(child);
    });
  };

  walk(doc.body);
  return doc.body.innerHTML;
}

export function initExamContent({ sb, bucket }) {
  const $ = (id) => document.getElementById(id);
  const root = $("viewExamContent");
  const editor = $("ecEditor");

  const state = { faqs: [], demos: [], scenarios: [] };
  let loaded = false;
  let vendorId = "";
  let examId = null;
  let existing = null;
  let dirty = false;
  let savedRange = null;

  /* ---------------- small helpers ---------------- */
  function feedback(message, ok = false) {
    const el = $("ecFeedback");
    el.textContent = message || "";
    el.className = `small ${ok ? "text-success" : "text-warning"}`;
  }
  const markDirty = () => {
    dirty = true;
  };
  const confirmDiscard = () =>
    !dirty || confirm("You have unsaved changes. Discard them?");

  function updateMetaCounters() {
    $("ecTitleCount").textContent = `${$("ecMetaTitle").value.length}/${LIMITS.title}`;
    $("ecDescCount").textContent = `${$("ecMetaDesc").value.length}/${LIMITS.description}`;
    $("ecKeywordsCount").textContent = `${$("ecMetaKeywords").value.length}/${LIMITS.keywords}`;
  }
  function updateWordCount() {
    const words = editor.textContent.trim().split(/\s+/).filter(Boolean).length;
    $("ecWordCount").textContent = `${words} words`;
  }

  function setStatusBadge() {
    const badge = $("ecStatus");
    if (!examId) {
      badge.hidden = true;
      return;
    }
    badge.hidden = false;
    if (!existing) {
      badge.className = "badge text-bg-secondary";
      badge.textContent = "New (not saved yet)";
    } else if (existing.status === "published") {
      badge.className = "badge text-bg-success";
      badge.textContent = "Published";
    } else {
      badge.className = "badge text-bg-warning";
      badge.textContent = "Draft";
    }
  }

  function updateAddButtons() {
    $("ecAddFaq").disabled = !examId || state.faqs.length >= MAX.faqs;
    $("ecAddDemo").disabled = !examId || state.demos.length >= MAX.demos;
    $("ecAddScenario").disabled = !examId || state.scenarios.length >= MAX.scenarios;
  }

  function setEnabled(on) {
    ["ecMetaTitle", "ecMetaDesc", "ecMetaKeywords", "ecSaveDraft", "ecPublish"].forEach(
      (id) => ($(id).disabled = !on),
    );
    editor.contentEditable = on ? "true" : "false";
    editor.classList.toggle("is-disabled", !on);
    root.querySelectorAll("[data-cmd], #ecBlock").forEach((el) => (el.disabled = !on));
    updateAddButtons();
  }

  /* ---------------- vendors and exams ---------------- */
  async function loadVendors() {
    const { data, error } = await sb.from("vendors").select("id,name").order("name");
    if (error) {
      console.error("Vendors load failed:", error);
      return feedback(`Could not load vendors: ${error.message}`);
    }
    const list = data || [];
    $("ecVendor").innerHTML =
      `<option value="">Select a vendor...</option>` +
      list.map((v) => `<option value="${esc(v.id)}">${esc(v.name)} (${esc(v.id)})</option>`).join("");
    $("ecVendor").value = vendorId;
    $("ecVendorCount").textContent = `${list.length} vendors available`;
  }

  async function loadExams() {
    const select = $("ecExam");
    if (!vendorId) {
      select.disabled = true;
      select.innerHTML = `<option value="">Select vendor first</option>`;
      $("ecExamCount").textContent = "Available exams: 0";
      return;
    }
    const { data, error } = await sb
      .from("exams")
      .select("id,name,exam_code")
      .eq("vendor_id", vendorId)
      .order("name");
    if (error) {
      console.error("Exams load failed:", error);
      return feedback(`Could not load exams: ${error.message}`);
    }
    const list = data || [];
    select.disabled = false;
    select.innerHTML =
      `<option value="">${list.length ? "Select an exam..." : "No exams for this vendor"}</option>` +
      list
        .map((e) => `<option value="${esc(e.id)}">${esc(e.exam_code ? e.exam_code + " - " : "")}${esc(e.name)}</option>`)
        .join("");
    select.value = examId || "";
    $("ecExamCount").textContent = `Available exams: ${list.length}`;
  }

  /* ---------------- lists (FAQs, demo questions, scenarios) ---------------- */
  function renderFaqs() {
    const el = $("ecFaqList");
    if (!state.faqs.length) {
      el.innerHTML = `<div class="ec-empty">${examId ? "No FAQs added yet." : "Select a vendor and exam to manage its FAQs."}</div>`;
      return;
    }
    el.innerHTML = state.faqs
      .map(
        (f, i) => `
      <div class="ec-item" data-list="faqs" data-i="${i}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>FAQ ${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-outline-danger" data-remove>Remove</button>
        </div>
        <input class="form-control mb-2" data-field="q" maxlength="200" placeholder="Question" aria-label="FAQ ${i + 1} question" value="${esc(f.q)}">
        <textarea class="form-control" data-field="a" rows="3" maxlength="1500" placeholder="Answer" aria-label="FAQ ${i + 1} answer">${esc(f.a)}</textarea>
      </div>`,
      )
      .join("");
  }

  function renderDemos() {
    const el = $("ecDemoList");
    if (!state.demos.length) {
      el.innerHTML = `<div class="ec-empty">${examId ? "No demo questions added yet." : "Select a vendor and exam to manage demo questions."}</div>`;
      return;
    }
    el.innerHTML = state.demos
      .map(
        (d, i) => `
      <div class="ec-item" data-list="demos" data-i="${i}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>Sample question ${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-outline-danger" data-remove>Remove</button>
        </div>
        <textarea class="form-control mb-2" data-field="question" rows="2" maxlength="600" placeholder="Question" aria-label="Question ${i + 1}">${esc(d.question)}</textarea>
        ${d.options
          .map(
            (opt, j) => `
          <div class="input-group mb-2">
            <div class="input-group-text">
              <input class="form-check-input mt-0" type="radio" name="dq${i}" data-field="correct" value="${j}" ${d.correct === j ? "checked" : ""} aria-label="Option ${String.fromCharCode(65 + j)} is the correct answer">
            </div>
            <span class="input-group-text">${String.fromCharCode(65 + j)}</span>
            <input class="form-control" data-field="opt" data-opt="${j}" maxlength="300" placeholder="Option ${String.fromCharCode(65 + j)}" aria-label="Question ${i + 1} option ${String.fromCharCode(65 + j)}" value="${esc(opt)}">
          </div>`,
          )
          .join("")}
        <div class="form-text mb-2">Select the radio button next to the correct answer.</div>
        <textarea class="form-control" data-field="explanation" rows="2" maxlength="800" placeholder="Explanation (optional)" aria-label="Question ${i + 1} explanation">${esc(d.explanation)}</textarea>
      </div>`,
      )
      .join("");
  }

  function renderScenarios() {
    const el = $("ecScenarioList");
    if (!state.scenarios.length) {
      el.innerHTML = `<div class="ec-empty">No preparation scenarios added.</div>`;
      return;
    }
    el.innerHTML = state.scenarios
      .map(
        (s, i) => `
      <div class="ec-item" data-list="scenarios" data-i="${i}">
        <div class="d-flex justify-content-between align-items-center mb-2">
          <strong>Scenario ${i + 1}</strong>
          <button type="button" class="btn btn-sm btn-outline-danger" data-remove>Remove</button>
        </div>
        <input class="form-control mb-2" data-field="title" maxlength="100" placeholder="Title" aria-label="Scenario ${i + 1} title" value="${esc(s.title)}">
        <textarea class="form-control" data-field="text" rows="3" maxlength="600" placeholder="Scenario description" aria-label="Scenario ${i + 1} description">${esc(s.text)}</textarea>
      </div>`,
      )
      .join("");
  }

  function renderAll() {
    renderFaqs();
    renderDemos();
    renderScenarios();
    $("ecFaqCount").textContent = `${state.faqs.length}/${MAX.faqs}`;
    $("ecDemoCount").textContent = `${state.demos.length}/${MAX.demos}`;
    $("ecScenarioCount").textContent = `${state.scenarios.length}/${MAX.scenarios}`;
    updateAddButtons();
  }

  const blankItem = {
    faqs: () => ({ q: "", a: "" }),
    demos: () => ({ question: "", options: Array(OPTION_COUNT).fill(""), correct: 0, explanation: "" }),
    scenarios: () => ({ title: "", text: "" }),
  };

  function normalizeDemo(d) {
    const options = Array.isArray(d?.options) ? d.options.map(String) : [];
    while (options.length < OPTION_COUNT) options.push("");
    return {
      question: String(d?.question ?? ""),
      options: options.slice(0, OPTION_COUNT),
      correct: Number.isInteger(d?.correct) ? d.correct : 0,
      explanation: String(d?.explanation ?? ""),
    };
  }

  root.addEventListener("click", (event) => {
    const add = event.target.closest("[data-add]");
    if (add) {
      const list = add.dataset.add;
      if (!examId || state[list].length >= MAX[list]) return;
      state[list].push(blankItem[list]());
      markDirty();
      renderAll();
      const items = root.querySelectorAll(`.ec-item[data-list="${list}"]`);
      items[items.length - 1]?.querySelector("input[type=text], input:not([type]), textarea")?.focus();
      return;
    }
    const remove = event.target.closest("[data-remove]");
    if (remove) {
      const item = remove.closest(".ec-item");
      state[item.dataset.list].splice(Number(item.dataset.i), 1);
      markDirty();
      renderAll();
    }
  });

  const onFieldInput = (event) => {
    const target = event.target;
    if (target === editor) {
      markDirty();
      updateWordCount();
      return;
    }
    if (["ecVendor", "ecExam", "ecBlock"].includes(target.id)) return;
    if (["ecMetaTitle", "ecMetaDesc", "ecMetaKeywords"].includes(target.id)) {
      markDirty();
      updateMetaCounters();
      return;
    }
    const item = target.closest(".ec-item");
    const field = target.dataset.field;
    if (!item || !field) return;
    const obj = state[item.dataset.list][Number(item.dataset.i)];
    if (field === "opt") obj.options[Number(target.dataset.opt)] = target.value;
    else if (field === "correct") obj.correct = Number(target.value);
    else obj[field] = target.value;
    markDirty();
  };
  root.addEventListener("input", onFieldInput);
  root.addEventListener("change", onFieldInput);

  /* ---------------- load / reset ---------------- */
  function resetForm() {
    $("ecMetaTitle").value = "";
    $("ecMetaDesc").value = "";
    $("ecMetaKeywords").value = "";
    state.faqs = [];
    state.demos = [];
    state.scenarios = [];
    editor.innerHTML = "";
    existing = null;
    dirty = false;
    feedback("");
    updateMetaCounters();
    updateWordCount();
    setStatusBadge();
    setEnabled(false);
    renderAll();
  }

  async function loadContent() {
    feedback("Loading...", true);
    const { data, error } = await sb
      .from("exam_content")
      .select("*")
      .eq("exam_id", examId)
      .maybeSingle();
    if (error) {
      console.error("Content load failed:", error);
      return feedback(`Could not load content: ${error.message}`);
    }
    existing = data;
    $("ecMetaTitle").value = data?.meta_title || "";
    $("ecMetaDesc").value = data?.meta_description || "";
    $("ecMetaKeywords").value = data?.meta_keywords || "";
    state.faqs = (data?.faqs || []).map((f) => ({ q: String(f.q ?? ""), a: String(f.a ?? "") }));
    state.demos = (data?.demo_questions || []).map(normalizeDemo);
    state.scenarios = (data?.scenarios || []).map((s) => ({
      title: String(s.title ?? ""),
      text: String(s.text ?? ""),
    }));
    editor.innerHTML = sanitizeHtml(data?.article_html || "");
    dirty = false;
    feedback("");
    updateMetaCounters();
    updateWordCount();
    setStatusBadge();
    setEnabled(true);
    renderAll();
  }

  $("ecVendor").addEventListener("change", async () => {
    if (!confirmDiscard()) {
      $("ecVendor").value = vendorId;
      return;
    }
    vendorId = $("ecVendor").value;
    examId = null;
    resetForm();
    await loadExams();
  });

  $("ecExam").addEventListener("change", async () => {
    if (!confirmDiscard()) {
      $("ecExam").value = examId || "";
      return;
    }
    const id = $("ecExam").value;
    if (!id) {
      examId = null;
      resetForm();
      return;
    }
    examId = id;
    await loadContent();
  });

  $("ecRefresh").addEventListener("click", async () => {
    if (!confirmDiscard()) return;
    const keepVendor = vendorId;
    const keepExam = examId;
    await loadVendors();
    vendorId = $("ecVendor").value === keepVendor ? keepVendor : "";
    examId = keepExam && vendorId ? keepExam : null;
    await loadExams();
    if (examId && $("ecExam").value === examId) await loadContent();
    else {
      examId = null;
      resetForm();
    }
    feedback("Lists refreshed.", true);
  });

  /* ---------------- rich text editor ---------------- */
  document.addEventListener("selectionchange", () => {
    const sel = document.getSelection();
    if (sel.rangeCount && editor.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
      // Dropdown me wahi style dikhao jo cursor wali line ki hai
      const node = sel.anchorNode.nodeType === 3 ? sel.anchorNode.parentElement : sel.anchorNode;
      const block = node && node.closest ? node.closest("h1,h2,h3,h4,h5,h6,blockquote,p") : null;
      const value = block && editor.contains(block) ? block.tagName.toLowerCase() : "p";
      const select = $("ecBlock");
      if ([...select.options].some((o) => o.value === value)) select.value = value;
    }
  });

  function restoreRange() {
    editor.focus();
    if (savedRange) {
      const sel = document.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }
  }

  $("ecToolbar").addEventListener("mousedown", (event) => {
    if (event.target.closest("button")) event.preventDefault(); // keep the text selection
  });

  $("ecToolbar").addEventListener("click", (event) => {
    const button = event.target.closest("[data-cmd]");
    if (!button || button.disabled) return;
    runCommand(button.dataset.cmd);
  });

  $("ecBlock").addEventListener("change", (event) => {
    restoreRange();
    document.execCommand("formatBlock", false, `<${event.target.value}>`);
    markDirty();
  });

  function runCommand(cmd) {
    restoreRange();
    if (cmd === "link") {
      const raw = prompt("Link URL (https://... or a page on this site like vendors.html)");
      if (raw === null) return;
      const url = safeUrl(raw);
      if (!url) return feedback("That link is not allowed. Use https://... or a site page.");
      const sel = document.getSelection();
      if (!sel.rangeCount || sel.isCollapsed) {
        document.execCommand("insertHTML", false, `<a href="${esc(url)}">${esc(url)}</a>`);
      } else {
        document.execCommand("createLink", false, url);
      }
    } else if (cmd === "image") {
      $("ecImageInput").click();
      return;
    } else if (cmd === "table") {
      const raw = prompt("Table size (rows x columns)", "3x3");
      if (raw === null) return;
      const match = raw.match(/^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i);
      if (!match) return feedback("Enter the size like 3x3.");
      const rows = Math.min(Number(match[1]), 20);
      const cols = Math.min(Number(match[2]), 8);
      const head = `<tr>${"<th>Heading</th>".repeat(cols)}</tr>`;
      const body = `<tr>${"<td>&nbsp;</td>".repeat(cols)}</tr>`.repeat(Math.max(rows - 1, 1));
      document.execCommand("insertHTML", false, `<table><thead>${head}</thead><tbody>${body}</tbody></table><p><br></p>`);
    } else if (cmd === "hr") {
      document.execCommand("insertHorizontalRule");
    } else {
      document.execCommand(cmd);
    }
    markDirty();
    updateWordCount();
  }

  // Image upload (Supabase Storage)
  $("ecImageInput").addEventListener("change", async (event) => {
    const input = event.target;
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      return feedback("Only JPG, PNG or WebP images are allowed.");
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return feedback("Image is larger than 2 MB. Choose a smaller one.");
    }
    feedback("Uploading image...", true);
    const safeName = file.name.toLowerCase().replace(/[^a-z0-9.\-_]/g, "-");
    const path = `exam-content/${Date.now()}-${safeName}`;
    const { error } = await sb.storage.from(bucket).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
    });
    if (error) {
      console.error("Image upload failed:", error);
      return feedback(`Upload failed: ${error.message}`);
    }
    const { data } = sb.storage.from(bucket).getPublicUrl(path);
    const alt = prompt("Image description (alt text, helps SEO and accessibility)", "") || "";
    restoreRange();
    document.execCommand("insertHTML", false, `<img src="${esc(data.publicUrl)}" alt="${esc(alt)}">`);
    markDirty();
    feedback("Image added.", true);
  });

  // Paste as clean text so no messy formatting comes in
  editor.addEventListener("paste", (event) => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData("text/plain");
    const html = text
      .split(/\r?\n{2,}/)
      .map((p) => `<p>${esc(p).replace(/\r?\n/g, "<br>")}</p>`)
      .join("");
    document.execCommand("insertHTML", false, html);
  });

  /* ---------------- save ---------------- */
  function collect() {
    const faqs = state.faqs
      .map((f) => ({ q: f.q.trim(), a: f.a.trim() }))
      .filter((f) => f.q || f.a);
    if (faqs.some((f) => !f.q || !f.a)) {
      throw new Error("Every FAQ needs both a question and an answer.");
    }

    const demos = state.demos
      .map((d) => ({ ...d, question: d.question.trim(), explanation: d.explanation.trim() }))
      .filter((d) => d.question || d.options.some((o) => o.trim()));
    const demoOut = demos.map((d) => {
      const kept = [];
      let correct = -1;
      d.options.forEach((o, j) => {
        if (o.trim()) {
          if (j === d.correct) correct = kept.length;
          kept.push(o.trim());
        }
      });
      if (!d.question || kept.length < 2 || correct < 0) {
        throw new Error(
          "Each demo question needs a question, at least two options, and a correct answer that is not empty.",
        );
      }
      return { question: d.question, options: kept, correct, explanation: d.explanation };
    });

    const scenarios = state.scenarios
      .map((s) => ({ title: s.title.trim(), text: s.text.trim() }))
      .filter((s) => s.title || s.text);
    if (scenarios.some((s) => !s.title || !s.text)) {
      throw new Error("Every scenario needs both a title and a description.");
    }

    return { faqs, demo_questions: demoOut, scenarios };
  }

  async function save(status) {
    if (!examId) return;
    feedback("");
    const hasContent =
      editor.textContent.trim().length > 0 || editor.querySelector("img, table");
    if (status === "published" && !hasContent) {
      return feedback("Write the article before publishing.");
    }
    if (
      status === "draft" &&
      existing?.status === "published" &&
      !confirm("This will unpublish the content from the website. Continue?")
    ) {
      return;
    }

    let lists;
    try {
      lists = collect();
    } catch (error) {
      return feedback(error.message);
    }

    const now = new Date().toISOString();
    const payload = {
      exam_id: examId,
      meta_title: $("ecMetaTitle").value.trim() || null,
      meta_description: $("ecMetaDesc").value.trim() || null,
      meta_keywords: $("ecMetaKeywords").value.trim() || null,
      ...lists,
      article_html: hasContent ? sanitizeHtml(editor.innerHTML) : null,
      status,
      updated_at: now,
    };
    if (status === "published" && !existing?.published_at) payload.published_at = now;

    const buttons = [$("ecSaveDraft"), $("ecPublish")];
    buttons.forEach((b) => (b.disabled = true));
    feedback("Saving...", true);
    const { data, error } = await sb
      .from("exam_content")
      .upsert(payload, { onConflict: "exam_id" })
      .select()
      .single();
    buttons.forEach((b) => (b.disabled = false));
    if (error) {
      console.error("Save failed:", error);
      return feedback(`Save failed: ${error.message}`);
    }
    existing = data;
    dirty = false;
    setStatusBadge();
    feedback(status === "published" ? "Published. It is now live." : "Draft saved.", true);
  }

  $("ecSaveDraft").addEventListener("click", () => save("draft"));
  $("ecPublish").addEventListener("click", () => save("published"));

  window.addEventListener("beforeunload", (event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  /* ---------------- public API ---------------- */
  resetForm();
  return {
    async open() {
      root.hidden = false;
      if (!loaded) {
        loaded = true;
        await loadVendors();
        await loadExams();
      }
    },
    close() {
      root.hidden = true;
    },
    canLeave: confirmDiscard,
  };
}
