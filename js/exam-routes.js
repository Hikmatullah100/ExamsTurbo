(() => {
  const slugify = (value) =>
    String(value || "")
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

  const vendorSlug = (vendor) =>
    slugify(
      typeof vendor === "string"
        ? vendor
        : vendor?.slug || vendor?.id || "",
    );

  const stripVendorPrefix = (value, vendor) => {
    const slug = slugify(value);
    const prefix = vendorSlug(vendor || "");
    return prefix && slug.startsWith(`${prefix}-`)
      ? slug.slice(prefix.length + 1)
      : slug;
  };

  // Safety net: when the exam code is empty or is just the vendor's own name
  // (for example code "Vlocity" for vendor "vlocity"), build the URL part from
  // the exam title instead, without the vendor prefix and a trailing "-exam".
  const titleSlug = (exam, vendor) =>
    stripVendorPrefix(exam?.examTitle || exam?.name, vendor).replace(
      /-exam$/,
      "",
    );

  const examSlug = (exam, vendor, duplicate = false) => {
    const vendorPart = vendorSlug(vendor || "");
    let code = stripVendorPrefix(exam?.examCode || exam?.code, vendor);
    if (!code || code === vendorPart) {
      code = titleSlug(exam, vendor) || code;
    }
    const sourceSlug = slugify(exam?.sourceSlug || exam?.slug || exam?.id);
    const base =
      code || stripVendorPrefix(sourceSlug, vendor);
    if (!base || !duplicate) return base;

    const idSlug = stripVendorPrefix(exam?.id, vendor) || sourceSlug;
    return idSlug && idSlug !== base ? `${base}-${idSlug}` : base;
  };

  const assignExamSlugs = (exams, vendors = []) => {
    const vendorsById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
    const groups = new Map();
    exams.forEach((exam, index) => {
      const vendor = vendorsById.get(exam.vendorId) || {
        id: exam.vendorId,
      };
      const vendorPart = vendorSlug(vendor);
      const base = examSlug(exam, vendor);
      if (!vendorPart || !base) {
        throw new Error(
          `Cannot form an exam URL for "${exam.id || exam.examTitle || "unknown exam"}".`,
        );
      }
      const key = `${vendorPart}/${base}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ exam, index, vendor, base });
    });

    const assigned = new Array(exams.length);
    const used = new Set();
    for (const entries of groups.values()) {
      entries.sort((a, b) => String(a.exam.id).localeCompare(String(b.exam.id)));
      entries.forEach((entry) => {
        const duplicate = entries.length > 1;
        const baseSlug = examSlug(entry.exam, entry.vendor, duplicate);
        let candidate = baseSlug;
        let suffix = 2;
        while (used.has(`${vendorSlug(entry.vendor)}/${candidate}`)) {
          candidate = `${baseSlug}-${suffix}`;
          suffix += 1;
        }
        used.add(`${vendorSlug(entry.vendor)}/${candidate}`);
        assigned[entry.index] = { ...entry.exam, slug: candidate };
      });
    }
    return assigned;
  };

  const pagePath = (exam, vendors = []) => {
    const vendor = vendors.find((item) => item.id === exam?.vendorId) || {
      id: exam?.vendorId,
    };
    const vendorPart = vendorSlug(vendor);
    const examPart = slugify(exam?.slug) || examSlug(exam, vendor);
    return vendorPart && examPart
      ? `/vendors/${vendorPart}/${examPart}/`
      : "";
  };

  const legacySlugs = (exam, vendor) => {
    const oldSourceSlug = slugify(exam?.sourceSlug || exam?.slug || exam?.id);
    const oldCodeSlug = slugify(exam?.examCode || exam?.code);
    return [...new Set(
      [
        oldSourceSlug,
        stripVendorPrefix(oldSourceSlug, vendor),
        oldCodeSlug,
        stripVendorPrefix(oldCodeSlug, vendor),
      ].filter(Boolean),
    )];
  };

  const routes = {
    slugify,
    vendorSlug,
    examSlug,
    assignExamSlugs,
    pagePath,
    legacySlugs,
  };
  if (typeof window !== "undefined") window.ExamRoutes = routes;
  if (typeof module !== "undefined" && module.exports)
    module.exports = routes;
})();