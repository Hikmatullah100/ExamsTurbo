import { supabaseClient } from "./supabase.js";

export async function signIn(email, password) {
  const { data, error } = await supabaseClient.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function signUp(fullName, email, password) {
  const { data, error } = await supabaseClient.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: new URL("../login/", window.location.href).href,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

export async function sendPasswordReset(email) {
  const redirectTo = new URL("../forgot-password/", window.location.href).href;
  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo,
  });

  if (error) {
    throw error;
  }
}

export async function updatePassword(password) {
  const { data, error } = await supabaseClient.auth.updateUser({ password });

  if (error) {
    throw error;
  }

  return data;
}

export async function getAuthenticatedUser() {
  const { data: sessionData, error: sessionError } =
    await supabaseClient.auth.getSession();

  if (sessionError) {
    throw sessionError;
  }

  if (!sessionData.session) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getUser();

  if (error) {
    throw error;
  }

  return data.user;
}

export async function signOut() {
  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    throw error;
  }
}

export function getAuthErrorMessage(error, action) {
  const code = error?.code || "";
  const message = (error?.message || "").toLowerCase();

  if (code === "invalid_credentials" || message.includes("invalid login credentials")) {
    return "Invalid email or password.";
  }

  if (code === "email_not_confirmed") {
    return "Please verify your email address before signing in.";
  }

  if (
    code === "user_already_exists" ||
    code === "user_already_registered" ||
    message.includes("already registered")
  ) {
    return "An account with this email already exists.";
  }

  if (code === "weak_password" || message.includes("password should be")) {
    return "Choose a stronger password with at least 8 characters.";
  }

  if (code === "over_email_send_rate_limit") {
    return "Please wait before requesting another email.";
  }

  if (action === "register" && message.includes("signup is disabled")) {
    return "Account registration is currently unavailable. Please try again later.";
  }

  return "Something went wrong. Please try again.";
}
