// Contact form aur newsletter ko Supabase database se jodta hai.
import { supabaseClient } from "./supabase.js";

window.submitContact = async ({ name, email, subject, message }) => {
  const { error } = await supabaseClient
    .from("contact_messages")
    .insert({ name, email, subject, message });
  if (error) throw error;
};

window.submitNewsletter = async (email) => {
  const { error } = await supabaseClient
    .from("newsletter_subscribers")
    .insert({ email: email.trim().toLowerCase() });
  // 23505 = email pehle se subscribed hai, ye error nahi hai
  if (error && error.code !== "23505") throw error;
  return error ? "already" : "new";
};
