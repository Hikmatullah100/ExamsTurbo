(() => {
  const form = document.getElementById("contactForm");
  const feedback = document.getElementById("contactFeedback");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const button = form.querySelector('[type="submit"]');
    if (button) button.disabled = true;
    feedback.textContent = "Sending...";
    try {
      if (!window.submitContact) throw new Error("Contact service not ready");
      await window.submitContact({
        name: document.getElementById("contactName").value.trim(),
        email: document.getElementById("contactEmail").value.trim(),
        subject: document.getElementById("contactSubject").value.trim(),
        message: document.getElementById("contactMessage").value.trim(),
      });
      feedback.textContent = "Thank you! Your message has been received.";
      form.reset();
    } catch (error) {
      console.error("Contact form failed:", error);
      feedback.textContent =
        "Sorry, your message could not be sent. Please try again.";
    } finally {
      if (button) button.disabled = false;
    }
  });
})();
