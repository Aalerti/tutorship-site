(function () {
  const API_BASE = window.TUTORSHIP_API_BASE || "http://localhost:4000";
  const TOKEN_KEY = "TutorshipAdminToken";
  const state = { token: localStorage.getItem(TOKEN_KEY) || "", user: null, directions: [], semesters: [] };

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date).replace(/\./g, "-");
  }

  function materialHref(material) { return material.externalUrl || material.fileUrl || "/"; }
  function authHeaders() { return state.token ? { Authorization: "Bearer " + state.token } : {}; }

  async function api(path, options = {}) {
    const response = await fetch(API_BASE + path, { ...options, credentials: "include", headers: { "Content-Type": "application/json", ...authHeaders(), ...(options.headers || {}) } });
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

    if (state.token) {
      const actions = document.createElement("div");
      actions.className = "material-actions";
      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = options.archived ? "Вернуть" : "В архив";
      archive.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const action = options.archived ? "unarchive" : "archive";
        await api("/api/admin/materials/" + material.id + "/" + action, { method: "POST" });
        await loadMaterials();
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "Удалить";
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
    panel.innerHTML = '<button class="admin-panel-toggle" type="button">Тьюторский режим</button><div class="admin-panel-body" hidden><form class="admin-login-form"><input name="email" type="email" placeholder="Почта" autocomplete="username" required><input name="password" type="password" placeholder="Пароль" autocomplete="current-password" required><button type="submit">Войти</button></form><form class="admin-material-form" hidden><input name="title" placeholder="Название" required><input name="description" placeholder="Описание"><select name="directionSlug" required></select><select name="semesterNumber"></select><select name="type"><option value="GUIDE">Гайд</option><option value="NOTES">Конспект</option><option value="EXAM">Экзамен</option><option value="LINKS">Ссылки</option><option value="OTHER">Другое</option></select><input name="externalUrl" type="url" placeholder="Ссылка на материал"><button type="submit">Добавить</button><button type="button" data-admin-logout>Выйти</button></form><p class="admin-panel-status" data-admin-status></p></div>';
    document.body.append(panel);
    const body = panel.querySelector(".admin-panel-body");
    const toggle = panel.querySelector(".admin-panel-toggle");
    toggle.addEventListener("click", () => { body.hidden = !body.hidden; });
    panel.querySelector(".admin-login-form").addEventListener("submit", onLogin);
    panel.querySelector(".admin-material-form").addEventListener("submit", onCreateMaterial);
    panel.querySelector("[data-admin-logout]").addEventListener("click", onLogout);
    refreshAdminPanel();
  }

  function refreshAdminPanel() {
    const login = document.querySelector(".admin-login-form");
    const material = document.querySelector(".admin-material-form");
    if (!login || !material) return;
    login.hidden = Boolean(state.token); material.hidden = !state.token; fillSelects();
    const toggle = document.querySelector(".admin-panel-toggle");
    if (toggle) toggle.textContent = state.token ? "Тьюторский режим включён" : "Тьюторский режим: войти";
    setPanelStatus(state.token ? "Режим тьютора включён. На карточках из базы доступны: В архив и Удалить." : "", false);
  }

  function fillSelects() {
    const directionSelect = document.querySelector('.admin-material-form select[name="directionSlug"]');
    const semesterSelect = document.querySelector('.admin-material-form select[name="semesterNumber"]');
    if (!directionSelect || !semesterSelect) return;
    directionSelect.innerHTML = state.directions.map((d) => '<option value="' + d.slug + '">' + d.shortName + '</option>').join("");
    semesterSelect.innerHTML = '<option value="">Без семестра</option>' + state.semesters.map((s) => '<option value="' + s.number + '">' + s.title + '</option>').join("");
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

  async function onLogout() { try { await api("/api/auth/logout", { method: "POST" }); } catch (_error) {} state.token = ""; state.user = null; localStorage.removeItem(TOKEN_KEY); refreshAdminPanel(); await loadMaterials(); }

  async function bootstrap() {
    renderAdminPanel();
    try { const result = await Promise.all([api("/api/directions"), api("/api/semesters")]); state.directions = result[0]; state.semesters = result[1]; refreshAdminPanel(); }
    catch (error) { console.warn("Directory API unavailable.", error); }
    await loadMaterials();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap); else bootstrap();
})();
