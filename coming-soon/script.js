/* ==========================================================================
   3D Ninjaz — Coming Soon
   Countdown + Formspree submit + Toast
   ========================================================================== */

(function () {
  "use strict";

  // ---------- Countdown ----------
  // Target: 2026-06-01T00:00:00+08:00 (Malaysia Time)
  var TARGET_MS = Date.UTC(2026, 5, 1, 0, 0, 0) - (8 * 60 * 60 * 1000);
  //  UTC of Jun 1, 2026 00:00 MYT -> subtract +08:00 offset -> May 31, 2026 16:00 UTC

  var daysEl  = document.getElementById("cd-days");
  var hoursEl = document.getElementById("cd-hours");
  var minsEl  = document.getElementById("cd-mins");
  var secsEl  = document.getElementById("cd-secs");
  var fallbackEl = document.getElementById("cd-fallback");
  var gridEl  = document.getElementById("countdown");

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function tick() {
    var now = Date.now();
    var diff = TARGET_MS - now;

    if (diff <= 0) {
      if (gridEl) gridEl.setAttribute("hidden", "");
      if (fallbackEl) fallbackEl.removeAttribute("hidden");
      return false; // stop
    }

    var totalSec = Math.floor(diff / 1000);
    var days = Math.floor(totalSec / 86400);
    var hours = Math.floor((totalSec % 86400) / 3600);
    var mins = Math.floor((totalSec % 3600) / 60);
    var secs = totalSec % 60;

    if (daysEl)  daysEl.textContent  = pad(days);
    if (hoursEl) hoursEl.textContent = pad(hours);
    if (minsEl)  minsEl.textContent  = pad(mins);
    if (secsEl)  secsEl.textContent  = pad(secs);
    return true;
  }

  if (tick()) {
    setInterval(tick, 1000);
  }

  // ---------- Signup form ----------
  var form    = document.getElementById("signup-form");
  var input   = document.getElementById("email");
  var btn     = document.getElementById("signup-btn");
  var errEl   = document.getElementById("form-error");
  var toast   = document.getElementById("toast");
  var toastText = document.getElementById("toast-text");

  // RFC-pragmatic email regex (good enough for client-side UX)
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function showError(msg) {
    if (!errEl) return;
    errEl.textContent = msg;
    errEl.removeAttribute("hidden");
  }

  function clearError() {
    if (!errEl) return;
    errEl.textContent = "";
    errEl.setAttribute("hidden", "");
  }

  function showToast(msg) {
    if (!toast) return;
    if (toastText && msg) toastText.textContent = msg;
    toast.removeAttribute("hidden");
    // allow the browser to paint with display: flex before adding class
    requestAnimationFrame(function () {
      toast.classList.add("is-visible");
    });
    setTimeout(function () {
      toast.classList.remove("is-visible");
      setTimeout(function () { toast.setAttribute("hidden", ""); }, 300);
    }, 3600);
  }

  if (input) {
    input.addEventListener("input", function () {
      if (!errEl || errEl.hasAttribute("hidden")) return;
      if (EMAIL_RE.test(input.value.trim())) clearError();
    });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearError();

      var email = (input && input.value || "").trim();

      // Honeypot check
      var hp = form.querySelector('input[name="website"]');
      if (hp && hp.value) {
        // silent success for bots
        showToast("You're in. Stay stealthy.");
        form.reset();
        return;
      }

      if (!email) {
        showError("Please enter your email address.");
        input && input.focus();
        return;
      }

      if (!EMAIL_RE.test(email)) {
        showError("That email doesn't look right. Mind checking it?");
        input && input.focus();
        return;
      }

      // If Formspree ID is still the placeholder, fail gracefully.
      var action = form.getAttribute("action") || "";
      if (action.indexOf("REPLACE_WITH_FORMSPREE_ID") !== -1) {
        // Local/preview mode: simulate success so the UX is demonstrable
        showToast("You're in. Stay stealthy.");
        form.reset();
        return;
      }

      btn && (btn.disabled = true);
      var originalLabel = btn ? btn.querySelector(".signup__btn-label") : null;
      var originalText = originalLabel ? originalLabel.textContent : "Notify me";
      if (originalLabel) originalLabel.textContent = "Sending...";

      var data = new FormData(form);

      fetch(action, {
        method: "POST",
        body: data,
        headers: { "Accept": "application/json" }
      })
        .then(function (res) {
          if (res.ok) {
            showToast("You're in. Stay stealthy.");
            form.reset();
          } else {
            return res.json().then(function (body) {
              var msg = "Something went wrong. Please try again.";
              if (body && body.errors && body.errors.length) {
                msg = body.errors.map(function (e) { return e.message; }).join(", ");
              }
              showError(msg);
            }).catch(function () {
              showError("Something went wrong. Please try again.");
            });
          }
        })
        .catch(function () {
          showError("Network error. Please check your connection and try again.");
        })
        .then(function () {
          btn && (btn.disabled = false);
          if (originalLabel) originalLabel.textContent = originalText;
        });
    });
  }
})();
