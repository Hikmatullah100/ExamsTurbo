// Supabase se vendors + certifications + exams + exam_content load karta hai.
// Agar Supabase fail ho jaye to purana static data (vendors.js / exams.js) fallback ke taur par chalta rehta hai.
import { supabaseClient } from "./supabase.js";

// exam-public.js reviews ke liye isi client ko use karta hai
window.supabaseClient = supabaseClient;

function rootAssetUrl(value, fallback) {
  const url = String(value || "").trim();
  if (!url) return fallback;
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(url)) return url;
  return `/${url.replace(/^(?:\.\.\/|\.\/)+/, "")}`;
}

function toVendor(row) {
  return {
    id: row.id,
    slug: row.slug || row.id,
    name: row.name,
    sortName: row.sort_name || undefined,
    officialUrl: row.official_url,
    libraryUrl: row.official_url,
    logoUrl: rootAssetUrl(row.logo_url),
    logoText: row.logo_text,
    category: (row.categories && row.categories[0]) || "Vendor Directory",
    categories: row.categories || [],
    showInMarquee: !!row.show_in_marquee,
    description: row.description,
    certifications: (row.certifications || []).map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code || "",
      credentialCode: c.credential_code || "",
      description: c.description,
      level: c.level,
      officialUrl: c.official_url,
      vendorId: row.id,
      vendorName: row.name,
      categories: c.categories || [],
    })),
    exams: [],
  };
}

async function loadVendors() {
  const { data, error } = await supabaseClient
    .from("vendors")
    .select("*, certifications(*)")
    .order("name");
  if (error) throw error;
  if (!data || !data.length) throw new Error("vendors table is empty");
  window.VENDORS = data.map(toVendor);
}

function toExam(row) {
  const vendor = (window.VENDORS || []).find((v) => v.id === row.vendor_id);
  const vendorName = vendor?.name || row.vendor_id;
  const defaultCover = "/assets/exam-covers/aace-psp.jpeg";
  // buildExamArticle js/exams.js me banta hai (wo is file se pehle load hoti hai)
  const article = window.buildExamArticle
    ? window.buildExamArticle(vendorName)
    : null;
  return {
    id: row.id,
    slug: row.slug || row.id,
    sourceSlug: row.slug || row.id,
    vendorId: row.vendor_id,
    vendor: vendorName,
    examCode: row.exam_code || "",
    examTitle: row.name,
    shortDescription: row.short_description || "",
    detailDescription: row.detail_description || row.short_description || "",
    questionCount: row.question_count || "",
    updatedYear: row.updated_year || "2026",
    price: row.price,
    accessType: row.access_type || "Instant Access",
    coverImage: rootAssetUrl(row.cover_image, defaultCover),
    benefits: article ? article.benefits : [],
    article,
  };
}

async function loadExams() {
  const { data, error } = await supabaseClient
    .from("exams")
    .select("*")
    .eq("is_published", true)
    .order("name");
  if (error) throw error;
  if (!data || !data.length) throw new Error("exams table is empty");
  const exams = data.map(toExam);
  window.EXAMS = window.ExamRoutes
    ? window.ExamRoutes.assignExamSlugs(exams, window.VENDORS || [])
    : exams;
}

// Sirf published exam content (RLS bhi yehi guarantee karti hai). exam_id -> row
async function loadExamContent() {
  const { data, error } = await supabaseClient
    .from("exam_content")
    .select(
      "exam_id, meta_title, meta_description, meta_keywords, faqs, demo_questions, scenarios, article_html",
    )
    .eq("status", "published");
  if (error) throw error;
  const map = {};
  (data || []).forEach((row) => {
    map[row.exam_id] = row;
  });
  window.EXAM_CONTENT = map;
}

try {
  await loadVendors();
} catch (error) {
  console.warn("Supabase vendors load failed, using static vendors.js:", error);
}

try {
  await loadExams();
} catch (error) {
  console.warn("Supabase exams load failed, using static exams.js data:", error);
}

try {
  await loadExamContent();
} catch (error) {
  window.EXAM_CONTENT = {};
  console.warn("Supabase exam_content load failed, exam pages show default content:", error);
} finally {
  window.__resolveData?.();
}
