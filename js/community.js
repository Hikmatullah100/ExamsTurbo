// Community: Supabase Auth (login) + community_posts / community_replies / community_likes
import { supabaseClient as sb } from "./supabase.js";

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const fmtDate = (iso) =>
  new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

const TOPICS = ["Study Tips", "Cloud", "Cybersecurity", "Career Advice"];

let user = null;
let posts = [];
let replies = [];
let likes = [];
let activeTopic = "All";
const openReplies = new Set();

const list = $("discussionList");
const notice = $("communityNotice");
const authModal = new bootstrap.Modal($("authModal"));
let authMode = "login";

function notify(message) {
  if (notice) notice.textContent = message || "";
}

function displayName(u) {
  const name =
    u?.user_metadata?.display_name || (u?.email ? u.email.split("@")[0] : "");
  return (name || "Community Member").slice(0, 60);
}

/* ---------------- AUTH ---------------- */
function setAuthMode(mode) {
  authMode = mode;
  const signup = mode === "signup";
  $("authModalTitle").textContent = signup ? "Create your account" : "Login";
  $("authNameWrap").hidden = !signup;
  $("authName").required = signup;
  $("authSubmit").textContent = signup ? "Sign up" : "Login";
  $("authPassword").autocomplete = signup ? "new-password" : "current-password";
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.authMode === mode);
  });
}

function openAuth(mode = "login") {
  setAuthMode(mode);
  $("authFeedback").textContent = "";
  authModal.show();
}

function updateAuthUI() {
  const label = user ? `Log out (${displayName(user)})` : "Login / Sign up";
  const icon = user
    ? '<i class="fa-solid fa-right-from-bracket ms-2"></i>'
    : '<i class="fa-solid fa-arrow-right ms-2"></i>';
  $("joinCommunity").innerHTML = `${esc(label)} ${icon}`;
  $("navAuthButton").textContent = user ? "Log out" : "Login";
  $("questionForm").hidden = !user;
  $("askLoginPrompt").hidden = !!user;
}

async function handleAuthButton() {
  if (user) {
    const { error } = await sb.auth.signOut();
    if (error) console.error("Logout failed:", error);
    return;
  }
  openAuth("login");
}

$("joinCommunity").addEventListener("click", handleAuthButton);
$("navAuthButton").addEventListener("click", handleAuthButton);
document.querySelectorAll("[data-auth-mode]").forEach((button) => {
  button.addEventListener("click", () => setAuthMode(button.dataset.authMode));
});
document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => openAuth(button.dataset.openAuth));
});

$("authForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const feedback = $("authFeedback");
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  feedback.textContent = "Please wait...";
  try {
    if (authMode === "login") {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
      form.reset();
      authModal.hide();
    } else {
      const name = $("authName").value.trim();
      const { data, error } = await sb.auth.signUp({
        email,
        password,
        options: { data: { display_name: name } },
      });
      if (error) throw error;
      form.reset();
      if (data.session) {
        authModal.hide();
      } else {
        feedback.textContent =
          "Account created. Please check your email to confirm it, then log in.";
      }
    }
  } catch (error) {
    console.error("Auth failed:", error);
    feedback.textContent = error.message || "Something went wrong. Try again.";
  }
});

/* ---------------- DATA ---------------- */
async function loadAll() {
  try {
    const [p, r, l] = await Promise.all([
      sb
        .from("community_posts")
        .select("id,title,topic,details,author_name,user_id,is_approved,created_at")
        .order("created_at", { ascending: false }),
      sb
        .from("community_replies")
        .select("id,post_id,author_name,body,user_id,created_at")
        .order("created_at", { ascending: true }),
      sb.from("community_likes").select("post_id,user_id"),
    ]);
    if (p.error) throw p.error;
    if (r.error) throw r.error;
    if (l.error) throw l.error;
    posts = p.data || [];
    replies = r.data || [];
    likes = l.data || [];
    renderPosts();
  } catch (error) {
    console.error("Community load failed:", error);
    list.innerHTML = `<p class="discussion-empty">Discussions could not be loaded right now. Please try again later.</p>`;
  }
}

async function reloadReplies() {
  const { data, error } = await sb
    .from("community_replies")
    .select("id,post_id,author_name,body,user_id,created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  replies = data || [];
}

/* ---------------- RENDER ---------------- */
function cardHTML(post) {
  const postReplies = replies.filter((r) => r.post_id === post.id);
  const postLikes = likes.filter((l) => l.post_id === post.id);
  const liked = !!user && postLikes.some((l) => l.user_id === user.id);
  const open = openReplies.has(post.id);
  const pending = !post.is_approved;
  const mine = !!user && post.user_id === user.id;

  const pendingBadge = pending
    ? `<span class="discussion-pending"><i class="fa-regular fa-clock"></i> ${
        mine
          ? "Pending admin review — only you can see this"
          : "Pending review (visible to admins only)"
      }</span>`
    : "";

  const actions = pending
    ? ""
    : `
      <div class="discussion-actions">
        <button type="button" class="dact-btn ${liked ? "liked" : ""}" data-action="like" data-id="${esc(post.id)}" aria-pressed="${liked}">
          <i class="${liked ? "fa-solid" : "fa-regular"} fa-heart"></i> <span>${postLikes.length}</span>
        </button>
        <button type="button" class="dact-btn" data-action="toggle-replies" data-id="${esc(post.id)}" aria-expanded="${open}">
          <i class="fa-regular fa-comment"></i> ${postReplies.length} ${postReplies.length === 1 ? "Reply" : "Replies"}
        </button>
      </div>
      <div class="discussion-replies" ${open ? "" : "hidden"}>
        ${postReplies
          .map(
            (r) => `
          <div class="reply-item">
            <strong>${esc(r.author_name)}</strong><small>${esc(fmtDate(r.created_at))}</small>
            <p>${esc(r.body)}</p>
          </div>`,
          )
          .join("")}
        ${
          user
            ? `<form class="reply-form" data-id="${esc(post.id)}">
                 <textarea name="body" rows="2" maxlength="800" required placeholder="Write a reply..."></textarea>
                 <button class="btn btn-orange btn-sm" type="submit">Reply</button>
               </form>`
            : `<div class="reply-login"><button type="button" data-action="login">Log in to reply</button></div>`
        }
      </div>`;

  return `
    <article class="discussion-card" data-post-id="${esc(post.id)}">
      <div class="discussion-top">
        <span class="discussion-tag">${esc(post.topic)}</span>${pendingBadge}
      </div>
      <h3>${esc(post.title)}</h3>
      <p>${esc(post.details)}</p>
      <div class="discussion-meta">${esc(post.author_name)} · ${esc(fmtDate(post.created_at))}</div>
      ${actions}
    </article>`;
}

function renderPosts() {
  const visible = posts.filter(
    (post) => activeTopic === "All" || post.topic === activeTopic,
  );
  list.innerHTML = visible.length
    ? visible.map(cardHTML).join("")
    : `<p class="discussion-empty">No discussions here yet. Log in and start one!</p>`;

  const approved = posts.filter((post) => post.is_approved);
  $("discussionCount").textContent = approved.length;
  TOPICS.forEach((topic) => {
    const el = document.querySelector(`[data-count-for="${CSS.escape(topic)}"]`);
    if (el) {
      el.textContent = String(
        approved.filter((post) => post.topic === topic).length,
      ).padStart(2, "0");
    }
  });
}

/* ---------------- ACTIONS ---------------- */
async function toggleLike(postId) {
  if (!user) return openAuth("login");
  const mine = likes.find((l) => l.post_id === postId && l.user_id === user.id);
  try {
    if (mine) {
      const { error } = await sb
        .from("community_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", user.id);
      if (error) throw error;
      likes = likes.filter((l) => l !== mine);
    } else {
      const { error } = await sb.from("community_likes").insert({ post_id: postId });
      if (error) throw error;
      likes.push({ post_id: postId, user_id: user.id });
    }
    notify("");
    renderPosts();
  } catch (error) {
    console.error("Like failed:", error);
    notify("Could not update your like. Please try again.");
  }
}

list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const id = button.dataset.id;
  const action = button.dataset.action;
  if (action === "like") toggleLike(id);
  if (action === "login") openAuth("login");
  if (action === "toggle-replies") {
    if (openReplies.has(id)) openReplies.delete(id);
    else openReplies.add(id);
    renderPosts();
  }
});

list.addEventListener("submit", async (event) => {
  const form = event.target.closest(".reply-form");
  if (!form) return;
  event.preventDefault();
  if (!user) return openAuth("login");
  const body = form.elements.body.value.trim();
  if (!body) return;
  const postId = form.dataset.id;
  try {
    const { error } = await sb.from("community_replies").insert({
      post_id: postId,
      body,
      author_name: displayName(user),
    });
    if (error) throw error;
    await reloadReplies();
    openReplies.add(postId);
    notify("");
    renderPosts();
  } catch (error) {
    console.error("Reply failed:", error);
    notify("Could not post your reply. Please try again.");
  }
});

$("questionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!user) return openAuth("login");
  if (!form.reportValidity()) return;
  const feedback = $("questionFeedback");
  feedback.textContent = "Sending...";
  try {
    const { error } = await sb.from("community_posts").insert({
      title: form.elements.title.value.trim(),
      topic: form.elements.topic.value,
      details: form.elements.details.value.trim(),
      author_name: displayName(user),
    });
    if (error) throw error;
    form.reset();
    feedback.textContent =
      "Thanks! Your post was sent for admin approval. You can see it below marked as pending.";
    activeTopic = "All";
    document
      .querySelectorAll("[data-topic]")
      .forEach((b) => b.classList.toggle("active", b.dataset.topic === "All"));
    await loadAll();
  } catch (error) {
    console.error("Post failed:", error);
    feedback.textContent = "Could not send your post. Please try again.";
  }
});

/* ---------------- FILTERS (pehle jaisa) ---------------- */
$("topicFilters").addEventListener("click", (event) => {
  const button = event.target.closest("[data-topic]");
  if (!button) return;
  activeTopic = button.dataset.topic;
  document
    .querySelectorAll("[data-topic]")
    .forEach((item) => item.classList.toggle("active", item === button));
  renderPosts();
});

document.querySelectorAll("[data-sidebar-topic]").forEach((button) => {
  button.addEventListener("click", () => {
    const filter = document.querySelector(
      `[data-topic="${CSS.escape(button.dataset.sidebarTopic)}"]`,
    );
    filter?.click();
    list.scrollIntoView({ behavior: "smooth" });
  });
});

/* ---------------- START ---------------- */
sb.auth.onAuthStateChange((_event, session) => {
  const newUser = session?.user || null;
  if ((newUser?.id || null) === (user?.id || null)) return;
  user = newUser;
  updateAuthUI();
  renderPosts();
  // supabase callback ke andar await nahi karte, is liye setTimeout
  setTimeout(loadAll, 0);
});

const {
  data: { session },
} = await sb.auth.getSession();
user = session?.user || null;
setAuthMode("login");
updateAuthUI();
await loadAll();
