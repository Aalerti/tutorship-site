import "./footer";
import "./yearSelect";

type SpaNavigateOptions = {
  replace?: boolean;
  scroll?: boolean;
  scrollTarget?: string;
};

declare global {
  interface Window {
    TutorshipSPA?: {
      navigate: (path: string, options?: SpaNavigateOptions) => void;
      currentPath: () => string;
    };
  }
}

function normalizeSpaPath(path: string) {
  if (!path) return "/";

  let nextPath = path;
  try {
    nextPath = new URL(path, window.location.origin).pathname;
  } catch (_error) {
    nextPath = path.split(/[?#]/)[0] || "/";
  }

  nextPath = decodeURIComponent(nextPath);
  if (nextPath.length > 1) nextPath = nextPath.replace(/\/+$/, "");
  return nextPath || "/";
}

function routeFromLegacyHash(hash: string, routes: Set<string>) {
  const value = decodeURIComponent(hash || "").replace(/^#/, "");
  if (!value) return "";
  if (value === "groups") return "/";
  if (value === "inside") return "/inside";

  const directionRoute = "/directions/" + value;
  return routes.has(directionRoute) ? directionRoute : "";
}

function setupSpaNavigation() {
  const root = document.querySelector<HTMLElement>("[data-spa-root]");
  if (!root) return;

  const views = Array.from(root.querySelectorAll<HTMLElement>("[data-spa-view][data-spa-route]"));
  const routes = new Set(views.map((view) => normalizeSpaPath(view.dataset.spaRoute || "/")));
  const defaultTitle = document.title;

  const pathFromLocation = () => {
    if (normalizeSpaPath(window.location.pathname) === "/groups") return "/";
    const legacyRoute = routeFromLegacyHash(window.location.hash, routes);
    if (legacyRoute) return legacyRoute;
    return normalizeSpaPath(window.location.pathname);
  };

  const scrollToTarget = (targetId: string) => {
    const target = document.getElementById(targetId);
    if (target) target.scrollIntoView({ block: "start", behavior: "auto" });
  };

  const setActiveLinks = (path: string) => {
    document.querySelectorAll<HTMLAnchorElement>("[data-spa-link]").forEach((link) => {
      const linkPath = normalizeSpaPath(link.getAttribute("href") || "/");
      if (linkPath === path) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const showRoute = (rawPath: string, options: SpaNavigateOptions = {}) => {
    const path = routes.has(normalizeSpaPath(rawPath)) ? normalizeSpaPath(rawPath) : "/";
    const activeView = views.find((view) => normalizeSpaPath(view.dataset.spaRoute || "/") === path);
    if (!activeView) return;

    views.forEach((view) => {
      view.hidden = view !== activeView;
    });

    root.dataset.spaRoute = path;
    const routeTitle = activeView.dataset.spaTitle || "";
    document.title = routeTitle && routeTitle !== defaultTitle ? routeTitle + " | " + defaultTitle : defaultTitle;
    setActiveLinks(path);

    if (options.scrollTarget) {
      window.requestAnimationFrame(() => scrollToTarget(options.scrollTarget || ""));
    } else if (options.scroll !== false) {
      window.scrollTo({ top: 0, behavior: "auto" });
    }

    window.dispatchEvent(new CustomEvent("tutorship:spa-route", {
      detail: {
        path,
        direction: activeView.dataset.spaDirection || ""
      }
    }));
  };

  const navigate = (rawPath: string, options: SpaNavigateOptions = {}) => {
    const path = routes.has(normalizeSpaPath(rawPath)) ? normalizeSpaPath(rawPath) : "/";
    const current = normalizeSpaPath(window.location.pathname);

    if (current !== path || window.location.hash) {
      const method = options.replace ? "replaceState" : "pushState";
      window.history[method](null, "", path);
    }

    showRoute(path, options);
  };

  window.TutorshipSPA = {
    navigate,
    currentPath: () => normalizeSpaPath(root.dataset.spaRoute || pathFromLocation())
  };

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    const link = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
    if (!link) return;
    if (link.target || link.hasAttribute("download") || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const href = link.getAttribute("href") || "";
    const hashRoute = href.startsWith("#") ? routeFromLegacyHash(href, routes) : "";
    const url = hashRoute ? null : new URL(href, window.location.origin);
    const path = hashRoute || normalizeSpaPath(url?.pathname || href);

    if (!routes.has(path)) return;
    if (url && url.origin !== window.location.origin) return;

    event.preventDefault();
    navigate(path);
  });

  window.addEventListener("popstate", () => {
    showRoute(pathFromLocation(), { scroll: false });
  });

  const initialLegacyRoute = routeFromLegacyHash(window.location.hash, routes);
  const initialPath = pathFromLocation();
  showRoute(initialPath, {
    scroll: false,
    scrollTarget: window.location.hash === "#groups" || normalizeSpaPath(window.location.pathname) === "/groups" ? "groups" : ""
  });
  if (initialLegacyRoute || normalizeSpaPath(window.location.pathname) === "/groups") {
    window.history.replaceState(null, "", initialPath);
  }
}

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
    if (window.TutorshipSPA) {
      window.TutorshipSPA.navigate("/", { scrollTarget: "groups" });
    } else {
      window.location.href = "/#groups";
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    setupSpaNavigation();
    setupSiteHeader();
  });
} else {
  setupSpaNavigation();
  setupSiteHeader();
}
