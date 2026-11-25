import {
  getAuthenticatedUser,
  getAuthErrorMessage,
  sendPasswordReset,
  signIn,
  signOut,
  signUp,
  updatePassword,
} from "./auth-service.js";
import { setRememberSession, supabaseClient } from "./supabase.js";

const page = document.body.dataset.authPage;

function showMessage(element, message, type) {
  if (!element) {
    return;
  }

  element.textContent = message;
  element.hidden = !message;
  element.classList.toggle("is-success", type === "success");
  element.classList.toggle("is-error", type !== "success");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setLoading(button, loading, loadingText) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent.trim();
  }

  button.disabled = loading;
  button.setAttribute("aria-busy", String(loading));
  button.textContent = loading ? loadingText : button.dataset.defaultText;
}

function initPasswordToggles() {
  document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.passwordToggle);
      if (!input) {
        return;
      }

      const showing = input.type === "text";
      input.type = showing ? "password" : "text";
      button.setAttribute("aria-pressed", String(!showing));
      button.setAttribute(
        "aria-label",
        showing ? "Show password" : "Hide password",
      );
      button.innerHTML = showing
        ? '<i class="fa-solid fa-eye" aria-hidden="true"></i>'
        : '<i class="fa-solid fa-eye-slash" aria-hidden="true"></i>';
    });
  });
}

function initLogin() {
  const form = document.getElementById("loginForm");
  const message = document.getElementById("formMessage");
  const button = form.querySelector('button[type="submit"]');
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(message, "", "error");

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email) {
      showMessage(message, "Email address is required.", "error");
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showMessage(message, "Please enter a valid email address.", "error");
      emailInput.focus();
      return;
    }

    if (!password) {
      showMessage(message, "Password is required.", "error");
      passwordInput.focus();
      return;
    }

    setLoading(button, true, "Signing in...");

    try {
      setRememberSession(document.getElementById("rememberMe").checked);
      const { session } = await signIn(email, password);

      if (!session) {
        showMessage(message, "Something went wrong. Please try again.", "error");
        return;
      }

      window.location.replace("../dashboard/");
    } catch (error) {
      showMessage(message, getAuthErrorMessage(error, "login"), "error");
    } finally {
      setLoading(button, false);
    }
  });
}

function initRegister() {
  const form = document.getElementById("registerForm");
  const message = document.getElementById("formMessage");
  const button = form.querySelector('button[type="submit"]');
  const nameInput = document.getElementById("fullName");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const confirmInput = document.getElementById("confirmPassword");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(message, "", "error");

    const fullName = nameInput.value.trim();
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!fullName) {
      showMessage(message, "Full name is required.", "error");
      nameInput.focus();
      return;
    }

    if (!email) {
      showMessage(message, "Email address is required.", "error");
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showMessage(message, "Please enter a valid email address.", "error");
      emailInput.focus();
      return;
    }

    if (password.length < 8) {
      showMessage(
        message,
        "Choose a password with at least 8 characters.",
        "error",
      );
      passwordInput.focus();
      return;
    }

    if (password !== confirmInput.value) {
      showMessage(message, "Passwords do not match.", "error");
      confirmInput.focus();
      return;
    }

    setLoading(button, true, "Creating account...");

    try {
      const { session } = await signUp(fullName, email, password);

      if (session) {
        window.location.replace("../dashboard/");
        return;
      }

      showMessage(
        message,
        "Account created. Check your email to confirm your account before signing in.",
        "success",
      );
      form.reset();
    } catch (error) {
      showMessage(message, getAuthErrorMessage(error, "register"), "error");
    } finally {
      setLoading(button, false);
    }
  });
}

function initForgotPassword() {
  const requestForm = document.getElementById("forgotForm");
  const recoveryForm = document.getElementById("recoveryForm");
  const message = document.getElementById("formMessage");
  const requestButton = requestForm.querySelector('button[type="submit"]');
  const recoveryButton = recoveryForm.querySelector('button[type="submit"]');
  const emailInput = document.getElementById("email");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const title = document.getElementById("authTitle");
  const description = document.getElementById("authDescription");

  const showRecoveryForm = () => {
    requestForm.hidden = true;
    recoveryForm.hidden = false;
    title.textContent = "Choose a new password";
    description.textContent = "Enter and confirm your new password.";
    showMessage(message, "", "error");
    newPasswordInput.focus();
  };

  if (new URLSearchParams(window.location.hash.slice(1)).get("type") === "recovery") {
    showRecoveryForm();
  }

  supabaseClient.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") {
      showRecoveryForm();
    }
  });

  requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(message, "", "error");

    const email = emailInput.value.trim();
    if (!email) {
      showMessage(message, "Email address is required.", "error");
      emailInput.focus();
      return;
    }

    if (!isValidEmail(email)) {
      showMessage(message, "Please enter a valid email address.", "error");
      emailInput.focus();
      return;
    }

    setLoading(requestButton, true, "Sending...");

    try {
      await sendPasswordReset(email);
      showMessage(
        message,
        "If an account exists for this address, a password reset email has been sent.",
        "success",
      );
    } catch (error) {
      showMessage(message, getAuthErrorMessage(error, "reset"), "error");
    } finally {
      setLoading(requestButton, false);
    }
  });

  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    showMessage(message, "", "error");

    const password = newPasswordInput.value;
    if (password.length < 8) {
      showMessage(
        message,
        "Choose a password with at least 8 characters.",
        "error",
      );
      newPasswordInput.focus();
      return;
    }

    if (password !== confirmPasswordInput.value) {
      showMessage(message, "Passwords do not match.", "error");
      confirmPasswordInput.focus();
      return;
    }

    setLoading(recoveryButton, true, "Updating password...");

    try {
      await updatePassword(password);
      showMessage(message, "Password updated. Signing you in...", "success");
      window.location.replace("../dashboard/");
    } catch (error) {
      showMessage(message, getAuthErrorMessage(error, "reset"), "error");
      setLoading(recoveryButton, false);
    }
  });
}

async function initDashboard() {
  const loadingMessage = document.getElementById("dashboardLoading");
  const content = document.getElementById("dashboardContent");
  const message = document.getElementById("dashboardMessage");
  const retryButton = document.getElementById("retrySession");

  const loadUser = async () => {
    retryButton.hidden = true;
    showMessage(message, "", "error");
    loadingMessage.hidden = false;
    content.hidden = true;

    try {
      const user = await getAuthenticatedUser();
      if (!user) {
        window.location.replace("../login/");
        return;
      }

      const name =
        user.user_metadata?.full_name || user.email?.split("@")[0] || "there";
      document.getElementById("welcomeName").textContent = name;
      document.getElementById("accountEmail").textContent = user.email || "";
      document.getElementById("accountRole").textContent =
        user.app_metadata?.role || "Customer";
      loadingMessage.hidden = true;
      content.hidden = false;
    } catch {
      loadingMessage.hidden = true;
      showMessage(
        message,
        "We couldn't verify your session. Check your connection and try again.",
        "error",
      );
      retryButton.hidden = false;
    }
  };

  retryButton.addEventListener("click", loadUser);
  document.getElementById("logoutButton").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const dashboardMessage = document.getElementById("dashboardMessage");
    showMessage(dashboardMessage, "", "error");
    setLoading(button, true, "Signing out...");

    try {
      await signOut();
      window.location.replace("../login/");
    } catch {
      showMessage(dashboardMessage, "Sign out failed. Please try again.", "error");
      setLoading(button, false);
    }
  });

  await loadUser();
}

initPasswordToggles();

if (page === "login") {
  initLogin();
} else if (page === "register") {
  initRegister();
} else if (page === "forgot-password") {
  initForgotPassword();
} else if (page === "dashboard") {
  initDashboard();
}
