import "./data-loader.js";

(() => {
  const pageData = window.EXAM_PAGE_DATA;
  const status = document.getElementById("vendorExamActionStatus");
  if (!pageData || !pageData.exam) {
    console.error("Generated exam page data is missing.");
    if (status) {
      status.textContent =
        "Exam details could not be initialized. Please reload this page.";
    }
    return;
  }

  const exam = pageData.exam;
  if (pageData.content) {
    window.EXAM_CONTENT = {
      ...(window.EXAM_CONTENT || {}),
      [exam.id]: pageData.content,
    };
  }

  function addToCart(openCart) {
    if (!window.CertiCart?.add) {
      status.textContent =
        "Cart integration is unavailable. The item was not added.";
      return;
    }
    window.CertiCart.add(
      {
        id: exam.id,
        name: exam.examTitle,
        code: exam.examCode,
        price: exam.price,
      },
      exam.vendor,
    );
    status.textContent = `${exam.examTitle} added to your cart.`;
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

  window.dispatchEvent(new CustomEvent("exam:detail", { detail: exam }));
})();
