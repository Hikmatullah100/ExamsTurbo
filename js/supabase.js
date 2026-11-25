import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://zfmjphrmmomqetwybnvf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_3E-kU_72T0qqWQ7bFEyTaQ_NHKqGCzK";
const REMEMBER_SESSION_KEY = "exams-turbo-remember-session";

const authStorage = {
  getItem(key) {
    const persistent = localStorage.getItem(REMEMBER_SESSION_KEY) === "true";
    const primary = persistent ? localStorage : sessionStorage;
    const fallback = persistent ? sessionStorage : localStorage;
    const value = primary.getItem(key);

    if (value !== null) {
      return value;
    }

    const fallbackValue = fallback.getItem(key);
    if (fallbackValue !== null) {
      primary.setItem(key, fallbackValue);
      fallback.removeItem(key);
    }

    return fallbackValue;
  },
  setItem(key, value) {
    const persistent = localStorage.getItem(REMEMBER_SESSION_KEY) === "true";
    const primary = persistent ? localStorage : sessionStorage;
    const fallback = persistent ? sessionStorage : localStorage;

    primary.setItem(key, value);
    fallback.removeItem(key);
  },
  removeItem(key) {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export function setRememberSession(remember) {
  if (remember) {
    localStorage.setItem(REMEMBER_SESSION_KEY, "true");
  } else {
    localStorage.removeItem(REMEMBER_SESSION_KEY);
  }
}

export const supabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      storage: authStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

window.supabaseClient = supabaseClient;
