import "./footer";
import "./yearSelect";

function setupSiteHeader() {
  const toggle = document.querySelector<HTMLButtonElement>("[data-site-menu-toggle]");
  const menu = document.querySelector<HTMLElement>("[data-site-menu]");
  const backButton = document.querySelector<HTMLButtonElement>("[data-history-back]");
  const groupsButton = document.querySelector<HTMLButtonElement>("[data-go-groups]");

  const closeMenu = () => {
    document.body.classList.remove("site-nav-open");
    toggle?.setAttribute("aria-expanded", "false");
  };

  toggle?.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("site-nav-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  menu?.querySelectorAll<HTMLAnchorElement>("a").forEach((link) => {
    link.addEventListener("click", closeMenu);
  });

  menu?.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
    button.addEventListener("click", closeMenu);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (!document.body.classList.contains("site-nav-open")) return;
    const target = event.target as Node;
    if (menu?.contains(target) || toggle?.contains(target)) return;
    closeMenu();
  });

  backButton?.addEventListener("click", () => {
    window.history.back();
  });

  groupsButton?.addEventListener("click", () => {
    const groups = document.getElementById("groups");
    if (groups) {
      history.replaceState(null, "", "/#groups");
      groups.scrollIntoView({ block: "start" });
    } else {
      window.location.href = "/#groups";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", setupSiteHeader);
} else {
  setupSiteHeader();
}
