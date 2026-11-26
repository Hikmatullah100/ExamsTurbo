(() => {
  const slugify = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const vendorSlug = (vendor) =>
    slugify(
      typeof vendor === "string"
        ? vendor
        : vendor?.slug || vendor?.id || "",
    );

  const examSlug = (exam, vendor) => {
    let slug = slugify(exam?.slug || exam?.id || exam?.examCode);
    const prefix = vendorSlug(vendor || { id: exam?.vendorId });
    if (prefix && slug.startsWith(`${prefix}-`)) {
      slug = slug.slice(prefix.length + 1);
    }
    return slug;
  };

  const pagePath = (exam, vendors = []) => {
    const vendor = vendors.find((item) => item.id === exam?.vendorId);
    const vendorPart = vendorSlug(vendor || { id: exam?.vendorId });
    const examPart = examSlug(exam, vendor);
    return vendorPart && examPart
      ? `/vendors/${vendorPart}/${examPart}/`
      : "";
  };

  const routes = { slugify, vendorSlug, examSlug, pagePath };
  if (typeof window !== "undefined") window.ExamRoutes = routes;
  if (typeof module !== "undefined" && module.exports)
    module.exports = routes;
})();
