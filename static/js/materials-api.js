(function () {
  const API_BASE = window.TUTORSHIP_API_BASE || "http://localhost:4000";
  const TOKEN_KEY = "TutorshipAdminToken";
  const state = { token: localStorage.getItem(TOKEN_KEY) || "", user: null, directions: [], semesters: [], users: [] };

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date).replace(/\./g, "-");
  }

  function materialHref(material) { return material.externalUrl || material.fileUrl || "/"; }
  function authHeaders() { return state.token ? { Authorization: "Bearer " + state.token } : {}; }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }
  function availableDirections() {
    if (!state.token) return [];
    if (state.user?.role === "ADMIN") return state.directions;
    const allowed = new Set((state.user?.directions || []).map((direction) => direction.slug));
    return state.directions.filter((direction) => allowed.has(direction.slug));
  }
  function canManageDirection(directionSlug) {
    if (!state.token) return false;
    if (state.user?.role === "ADMIN") return true;
    return (state.user?.directions || []).some((direction) => direction.slug === directionSlug);
  }
  function canManageMaterial(material) {
    return canManageDirection(material.direction?.slug);
  }

  async function api(path, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    if (options.body !== undefined && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(API_BASE + path, { ...options, credentials: "include", headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Backend error");
    }
    return response.json();
  }

  function renderCard(material, options = {}) {
    const card = document.createElement("div");
    card.className = "post-card";
    card.dataset.materialId = material.id;
    const link = document.createElement("a");
    link.className = "card-link";
    link.href = materialHref(material);
    if (/^https?:\/\//.test(materialHref(material))) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    const title = document.createElement("div");
    title.className = "post-card-title";
    title.textContent = material.title;
    const description = document.createElement("div");
    description.className = "post-card-content";
    description.textContent = material.description || "";
    const date = document.createElement("div");
    date.className = "post-card-content";
    date.textContent = formatDate(material.publishedAt || material.createdAt);
    card.append(link, title, description, date);

    if (canManageMaterial(material)) {
      const actions = document.createElement("div");
      actions.className = "material-actions";
      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = options.archived ? "Вернуть на доску" : "В архив";
      archive.className = options.archived ? "material-action material-action-return" : "material-action material-action-archive";
      archive.setAttribute("aria-label", options.archived ? "Вернуть материал на доску" : "Переместить материал в архив");
      archive.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const action = options.archived ? "unarchive" : "archive";
        archive.disabled = true;
        try {
          await api("/api/admin/materials/" + material.id + "/" + action, { method: "POST" });
          setPanelStatus(options.archived ? "Материал вернулся на доску" : "Материал отправлен в архив", false);
          await loadMaterials();
        } catch (error) {
          setPanelStatus(error.message, true);
          archive.disabled = false;
        }
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Удалить";
      remove.className = "material-action material-action-delete";
      remove.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        if (!confirm("Удалить материал «" + material.title + "»?")) return;
        await api("/api/admin/materials/" + material.id, { method: "DELETE" });
        await loadMaterials();
      });
      actions.append(archive, remove);
      card.append(actions);
    }
    return card;
  }

  function renderEmpty(board, direction) {
    const empty = document.createElement("div");
    empty.className = "board-empty";
    empty.dataset.materialsEmpty = "";
    empty.dataset.direction = direction;
    empty.innerHTML = '<span class="board-empty-stamp">Скоро</span><p class="board-empty-text">Гайды для этого направления ещё пишутся.</p><p class="board-empty-hint">Учишься здесь и хочешь помочь собрать материалы? Напиши нам — доска ждёт своих авторов.</p>';
    board.append(empty);
  }

  function ensureArchiveFolder(board, direction) {
    let folder = board.querySelector(".archive-folder");
    if (folder) return folder;
    folder = document.createElement("section");
    folder.className = "archive-folder";
    folder.innerHTML = '<button type="button" class="archive-folder-cover"><span>Материалы предыдущих годов</span><small data-archive-count>Открыть архив</small></button><div class="archive-drawer" hidden><div class="archive-list"></div></div>';
    folder.querySelector(".archive-folder-cover").addEventListener("click", async () => {
      const drawer = folder.querySelector(".archive-drawer");
      drawer.hidden = !drawer.hidden;
      if (!drawer.hidden) await loadArchive(board, direction);
    });
    board.append(folder);
    return folder;
  }

  async function loadArchive(board, direction) {
    const folder = ensureArchiveFolder(board, direction);
    const list = folder.querySelector(".archive-list");
    list.innerHTML = '<p class="archive-empty">Загружаю...</p>';
    try {
      const data = await api("/api/materials?direction=" + encodeURIComponent(direction) + "&archived=true&limit=100");
      const materials = data.items || [];
      folder.querySelector("[data-archive-count]").textContent = materials.length ? materials.length + " в архиве" : "Архив пуст";
      list.innerHTML = "";
      if (!materials.length) { list.innerHTML = '<p class="archive-empty">В архиве пока пусто.</p>'; return; }
      materials.forEach((material) => list.append(renderCard(material, { archived: true })));
    } catch (error) { list.innerHTML = '<p class="archive-empty">Архив пока недоступен.</p>'; }
  }

  async function loadMaterials() {
    const boards = Array.from(document.querySelectorAll(".board-main[data-direction]"));
    await Promise.all(boards.map(async (board) => {
      const direction = board.dataset.direction;
      if (!direction) return;
      try {
        const data = await api("/api/materials?direction=" + encodeURIComponent(direction) + "&limit=50");
        const materials = data.items || [];
        board.innerHTML = "";
        if (materials.length) {
          const list = document.createElement("div");
          list.className = "posts-cards board-cards";
          list.dataset.materialsList = "";
          list.dataset.direction = direction;
          materials.forEach((material) => list.append(renderCard(material)));
          board.append(list);
        } else renderEmpty(board, direction);
        ensureArchiveFolder(board, direction);
        loadArchiveCount(board, direction);
      } catch (error) { console.warn("Materials API unavailable, static cards are kept.", error); }
    }));
  }

  async function loadArchiveCount(board, direction) {
    try {
      const data = await api("/api/materials?direction=" + encodeURIComponent(direction) + "&archived=true&limit=1");
      const folder = ensureArchiveFolder(board, direction);
      folder.querySelector("[data-archive-count]").textContent = data.total ? data.total + " в архиве" : "Архив пуст";
    } catch (_error) {}
  }

  function setPanelStatus(message, isError) {
    const status = document.querySelector("[data-admin-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  function renderAdminPanel() {
    const panel = document.createElement("section");
    panel.className = "admin-panel";
    panel.innerHTML = '<button class="admin-panel-toggle" type="button">Тьюторский режим</button><div class="admin-panel-body" hidden><div data-admin-panel-content></div><p class="admin-panel-status" data-admin-status></p></div>';
    document.body.append(panel);
    const body = panel.querySelector(".admin-panel-body");
    const toggle = panel.querySelector(".admin-panel-toggle");
    toggle.addEventListener("click", () => { body.hidden = !body.hidden; });
    refreshAdminPanel();
  }

  function refreshAdminPanel() {
    const content = document.querySelector("[data-admin-panel-content]");
    if (!content) return;
    if (state.token) {
      content.innerHTML = '<div class="admin-tabs"><button type="button" class="is-active" data-admin-tab="materials">Материалы</button>' + (state.user?.role === "ADMIN" ? '<button type="button" data-admin-tab="users">Тьюторы</button>' : "") + '</div><div data-admin-tab-panel="materials"><form class="admin-material-form"><input name="title" placeholder="Название" required><input name="description" placeholder="Описание"><select name="directionSlug" required></select><select name="semesterNumber"></select><select name="type"><option value="GUIDE">Гайд</option><option value="NOTES">Конспект</option><option value="EXAM">Экзамен</option><option value="LINKS">Ссылки</option><option value="OTHER">Другое</option></select><input name="externalUrl" type="url" placeholder="Ссылка на материал"><button type="submit">Добавить</button><button type="button" data-admin-logout>Выйти</button></form></div>' + (state.user?.role === "ADMIN" ? '<div data-admin-tab-panel="users" hidden><form class="admin-user-form"><input name="name" placeholder="Имя тьютора" required><input name="email" type="email" placeholder="Почта" required><input name="password" type="text" placeholder="Пароль от 8 символов" required><div class="admin-direction-checks" data-new-user-directions></div><button type="submit">Создать тьютора</button></form><div class="admin-users-list" data-admin-users-list></div></div>' : "");
      content.querySelector(".admin-material-form").addEventListener("submit", onCreateMaterial);
      content.querySelector("[data-admin-logout]").addEventListener("click", onLogout);
      content.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => switchAdminTab(button.dataset.adminTab)));
      const userForm = content.querySelector(".admin-user-form");
      if (userForm) userForm.addEventListener("submit", onCreateUser);
      fillSelects();
      fillUserDirectionChecks();
      renderUsers();
      if (state.user?.role === "ADMIN") loadUsers();
    } else {
      content.innerHTML = '<form class="admin-login-form"><input name="email" type="email" placeholder="Почта" autocomplete="username" required><input name="password" type="password" placeholder="Пароль" autocomplete="current-password" required><button type="submit">Войти</button></form>';
      content.querySelector(".admin-login-form").addEventListener("submit", onLogin);
    }
    const toggle = document.querySelector(".admin-panel-toggle");
    if (toggle) toggle.textContent = state.token ? "Тьюторский режим включён" : "Тьюторский режим: войти";
    const directions = availableDirections();
    setPanelStatus(state.token ? "Доступ: " + (state.user?.role === "ADMIN" ? "все направления" : directions.map((d) => d.shortName).join(", ") || "нет направлений") : "", false);
  }

  function switchAdminTab(tab) {
    document.querySelectorAll("[data-admin-tab]").forEach((button) => button.classList.toggle("is-active", button.dataset.adminTab === tab));
    document.querySelectorAll("[data-admin-tab-panel]").forEach((panel) => { panel.hidden = panel.dataset.adminTabPanel !== tab; });
    if (tab === "users") loadUsers();
  }

  function fillSelects() {
    const directionSelect = document.querySelector('.admin-material-form select[name="directionSlug"]');
    const semesterSelect = document.querySelector('.admin-material-form select[name="semesterNumber"]');
    if (!directionSelect || !semesterSelect) return;
    const directions = availableDirections();
    directionSelect.innerHTML = directions.map((d) => '<option value="' + d.slug + '">' + d.shortName + '</option>').join("");
    directionSelect.disabled = state.user?.role !== "ADMIN" && directions.length <= 1;
    semesterSelect.innerHTML = '<option value="">Без семестра</option>' + state.semesters.map((s) => '<option value="' + s.number + '">' + s.title + '</option>').join("");
    const submit = document.querySelector('.admin-material-form button[type="submit"]');
    if (submit) submit.disabled = directions.length === 0;
  }

  function directionCheckboxes(selected = []) {
    const selectedSet = new Set(selected);
    return state.directions.map((direction) => '<label><input type="checkbox" name="directionSlugs" value="' + escapeHtml(direction.slug) + '"' + (selectedSet.has(direction.slug) ? " checked" : "") + '> <span>' + escapeHtml(direction.shortName) + '</span></label>').join("");
  }

  function fillUserDirectionChecks() {
    const target = document.querySelector("[data-new-user-directions]");
    if (target) target.innerHTML = directionCheckboxes(["pi"]);
  }

  async function loadUsers() {
    if (state.user?.role !== "ADMIN") return;
    try {
      state.users = await api("/api/admin/users");
      renderUsers();
    } catch (error) {
      setPanelStatus(error.message, true);
    }
  }

  function renderUsers() {
    const list = document.querySelector("[data-admin-users-list]");
    if (!list) return;
    if (!state.users.length) {
      list.innerHTML = '<p class="admin-empty">Тьюторов пока нет.</p>';
      return;
    }
    list.innerHTML = state.users.map((user) => {
      const selected = (user.directions || []).map((direction) => direction.slug);
      return '<article class="admin-user-card" data-user-id="' + escapeHtml(user.id) + '"><div class="admin-user-head"><strong>' + escapeHtml(user.name) + '</strong><small>' + escapeHtml(user.email) + '</small></div><span class="admin-user-role">' + (user.role === "ADMIN" ? "Админ" : "Тьютор") + '</span><div class="admin-direction-checks">' + directionCheckboxes(selected) + '</div><div class="admin-user-actions"><button type="button" data-save-user>Сохранить доступ</button><button type="button" data-toggle-user>' + (user.isActive ? "Отключить" : "Включить") + '</button></div></article>';
    }).join("");
    list.querySelectorAll("[data-save-user]").forEach((button) => button.addEventListener("click", onSaveUserAccess));
    list.querySelectorAll("[data-toggle-user]").forEach((button) => button.addEventListener("click", onToggleUser));
  }

  async function onLogin(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) }); state.token = data.accessToken; state.user = data.user; localStorage.setItem(TOKEN_KEY, state.token); refreshAdminPanel(); await loadMaterials(); }
    catch (error) { setPanelStatus(error.message, true); }
  }

  async function onCreateMaterial(event) {
    event.preventDefault(); const form = new FormData(event.currentTarget); const semester = form.get("semesterNumber");
    try { await api("/api/admin/materials", { method: "POST", body: JSON.stringify({ title: form.get("title"), description: form.get("description") || undefined, directionSlug: form.get("directionSlug"), semesterNumber: semester ? Number(semester) : undefined, type: form.get("type"), externalUrl: form.get("externalUrl") || undefined }) }); event.currentTarget.reset(); setPanelStatus("Материал добавлен", false); await loadMaterials(); }
    catch (error) { setPanelStatus(error.message, true); }
  }

  async function onCreateUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const directionSlugs = data.getAll("directionSlugs");
    try {
      await api("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          role: "TUTOR",
          directionSlugs
        })
      });
      form.reset();
      fillUserDirectionChecks();
      setPanelStatus("Тьютор создан", false);
      await loadUsers();
    } catch (error) {
      setPanelStatus(error.message, true);
    }
  }

  async function onSaveUserAccess(event) {
    const card = event.currentTarget.closest("[data-user-id]");
    const user = state.users.find((item) => item.id === card?.dataset.userId);
    if (!card || !user) return;
    const directionSlugs = Array.from(card.querySelectorAll('input[name="directionSlugs"]:checked')).map((input) => input.value);
    try {
      await api("/api/admin/users/" + user.id, { method: "PATCH", body: JSON.stringify({ directionSlugs }) });
      setPanelStatus("Доступ обновлён", false);
      await loadUsers();
    } catch (error) {
      setPanelStatus(error.message, true);
    }
  }

  async function onToggleUser(event) {
    const card = event.currentTarget.closest("[data-user-id]");
    const user = state.users.find((item) => item.id === card?.dataset.userId);
    if (!card || !user) return;
    try {
      if (user.isActive) {
        await api("/api/admin/users/" + user.id + "/disable", { method: "POST" });
        setPanelStatus("Тьютор отключён", false);
      } else {
        await api("/api/admin/users/" + user.id, { method: "PATCH", body: JSON.stringify({ isActive: true }) });
        setPanelStatus("Тьютор включён", false);
      }
      await loadUsers();
    } catch (error) {
      setPanelStatus(error.message, true);
    }
  }

  async function onLogout() { try { await api("/api/auth/logout", { method: "POST" }); } catch (_error) {} state.token = ""; state.user = null; localStorage.removeItem(TOKEN_KEY); refreshAdminPanel(); await loadMaterials(); }

  async function bootstrap() {
    renderAdminPanel();
    if (state.token) {
      try {
        const me = await api("/api/auth/me");
        state.user = me.user;
      } catch (_error) {
        state.token = "";
        state.user = null;
        localStorage.removeItem(TOKEN_KEY);
      }
    }
    try { const result = await Promise.all([api("/api/directions"), api("/api/semesters")]); state.directions = result[0]; state.semesters = result[1]; refreshAdminPanel(); }
    catch (error) { console.warn("Directory API unavailable.", error); }
    await loadMaterials();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap); else bootstrap();
})();
