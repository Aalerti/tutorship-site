(function () {
  const API_BASE = window.TUTORSHIP_API_BASE
    || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && window.location.port !== "4000"
      ? "http://localhost:4000"
      : "");
  const TOKEN_KEY = "TutorshipAdminToken";
  const typeLabels = {
    GUIDE: "Гайд",
    NOTES: "Конспект",
    EXAM: "Экзамен / программа",
    LINKS: "Ссылки",
    OTHER: "Другое"
  };
  const catalogSections = [
    { key: "NOTES", title: "Конспекты по семестру" },
    { key: "EXAM", title: "Экзамены и программы" },
    { key: "GUIDE", title: "Гайды" },
    { key: "LINKS", title: "Полезные ссылки" },
    { key: "OTHER", title: "Остальное" }
  ];
  const fallbackSemesters = Array.from({ length: 8 }, (_, index) => ({
    number: index + 1,
    title: (index + 1) + " семестр"
  }));
  const fallbackSubjects = {
    pi: [
      { slug: "mat-analysis", title: "Математический анализ", shortTitle: "Матан", directionSlug: "pi" },
      { slug: "linear-algebra", title: "Алгебра и геометрия", shortTitle: "Алгем", directionSlug: "pi" },
      { slug: "programming", title: "Программирование", shortTitle: "Прога", directionSlug: "pi" },
      { slug: "theory-of-information", title: "Теория информации", shortTitle: "ТеорИнфа", directionSlug: "pi" },
      { slug: "history", title: "История России", shortTitle: "История", directionSlug: "pi" }
    ]
  };
  const state = {
    token: localStorage.getItem(TOKEN_KEY) || "",
    user: null,
    directions: [],
    semesters: [],
    subjects: [],
    users: [],
    filters: new Map()
  };

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date).replace(/\./g, "-");
  }

  function isMarkdownUrl(href) {
    return /\.md(?:$|[?#])/i.test(href);
  }

  function markdownViewerHref(material, href) {
    const params = new URLSearchParams({
      src: href,
      title: material.title || "Материал",
      description: material.description || ""
    });
    return "/materials/view/?" + params.toString();
  }

  function materialHref(material) {
    const href = material.externalUrl || material.fileUrl || "/";
    if (isMarkdownUrl(href)) {
      return markdownViewerHref(material, href);
    }
    if (API_BASE && href.startsWith("/api/")) {
      return API_BASE + href;
    }
    return href;
  }
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
  function subjectsForDirection(directionSlug, semesterNumber = "") {
    const subjects = state.subjects.filter((subject) => subject.direction?.slug === directionSlug || subject.directionSlug === directionSlug);
    return (subjects.length ? subjects : fallbackSubjects[directionSlug] || [])
      .filter((subject) => {
        if (!semesterNumber || !Array.isArray(subject.semesterNumbers) || !subject.semesterNumbers.length) return true;
        return subject.semesterNumbers.includes(Number(semesterNumber));
      })
      .slice()
      .sort((a, b) => (a.title || a.shortTitle || "").localeCompare(b.title || b.shortTitle || "", "ru"));
  }
  function semesterOptions() {
    return state.semesters.length ? state.semesters : fallbackSemesters;
  }
  function materialTypeOptions(selectedType = "") {
    return Object.entries(typeLabels).map(([type, label]) =>
      '<option value="' + type + '"' + (type === selectedType ? " selected" : "") + '>' + escapeHtml(label) + '</option>'
    ).join("");
  }
  function directionOptions(selectedSlug = "") {
    return availableDirections().map((direction) =>
      '<option value="' + escapeHtml(direction.slug) + '"' + (direction.slug === selectedSlug ? " selected" : "") + '>' + escapeHtml(direction.shortName) + '</option>'
    ).join("");
  }
  function canManageDirection(directionSlug) {
    if (!state.token) return false;
    if (state.user?.role === "ADMIN") return true;
    return (state.user?.directions || []).some((direction) => direction.slug === directionSlug);
  }
  function canManageMaterial(material) {
    return canManageDirection(material.direction?.slug);
  }

  function boardForDirection(direction) {
    return Array.from(document.querySelectorAll(".board-main[data-direction]"))
      .find((board) => board.dataset.direction === direction);
  }

  async function reloadMaterialDirections(...directions) {
    const uniqueDirections = Array.from(new Set(directions.filter(Boolean)));
    await Promise.all(uniqueDirections.map(async (direction) => {
      const board = boardForDirection(direction);
      if (board) await loadDirectionMaterials(board, direction);
    }));
  }

  function syncDirectionCard(direction, hasMaterials) {
    if (!direction || !hasMaterials) return;
    const card = Array.from(document.querySelectorAll(".group-card[data-direction-card]"))
      .find((item) => item.dataset.directionCard === direction);
    if (!card) return;

    card.classList.remove("soon");

    let link = card.querySelector(".group-link");
    if (!link) {
      link = document.createElement("a");
      link.className = "group-link";
      card.prepend(link);
    }
    const label = card.getAttribute("title") || card.querySelector(".group-short")?.textContent?.trim() || direction;
    link.href = "#" + direction;
    link.setAttribute("aria-label", label + " — перейти к доске");

    const stamp = card.querySelector(".group-stamp");
    if (stamp) {
      stamp.className = "group-action";
      stamp.textContent = "Открыть материалы";
    } else if (!card.querySelector(".group-action")) {
      const action = document.createElement("span");
      action.className = "group-action";
      action.textContent = "Открыть материалы";
      card.append(action);
    }
  }

  async function api(path, options = {}) {
    const headers = { ...authHeaders(), ...(options.headers || {}) };
    const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
    if (options.body !== undefined && !isFormData && !headers["Content-Type"] && !headers["content-type"]) {
      headers["Content-Type"] = "application/json";
    }
    const response = await fetch(API_BASE + path, { ...options, credentials: "include", headers });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.message || "Backend error");
    }
    return response.json();
  }

  function filterState(direction) {
    if (!state.filters.has(direction)) {
      state.filters.set(direction, {
        search: "",
        semester: "",
        subject: "",
        type: "",
        archiveSearch: "",
        archiveSemester: "",
        archiveSubject: "",
        archiveType: "",
        archiveSort: "newest"
      });
    }
    return state.filters.get(direction);
  }

  function buildMaterialQuery(direction, archived = false) {
    const filters = filterState(direction);
    const params = new URLSearchParams({ direction, limit: "100" });
    if (archived) params.set("archived", "true");
    if (filters.search) params.set("search", filters.search);
    if (filters.semester) params.set("semester", filters.semester);
    if (filters.subject) params.set("subject", filters.subject);
    if (filters.type) params.set("type", filters.type);
    return params.toString();
  }

  function sortMaterials(materials, sortMode) {
    const dateValue = (material) => new Date(material.publishedAt || material.createdAt || 0).getTime() || 0;
    const copies = [...materials];

    if (sortMode === "oldest") return copies.sort((a, b) => dateValue(a) - dateValue(b));
    if (sortMode === "title") return copies.sort((a, b) => String(a.title || "").localeCompare(String(b.title || ""), "ru"));
    if (sortMode === "subject") {
      return copies.sort((a, b) => {
        const subjectA = a.subject?.shortTitle || a.subject?.title || "";
        const subjectB = b.subject?.shortTitle || b.subject?.title || "";
        return subjectA.localeCompare(subjectB, "ru") || String(a.title || "").localeCompare(String(b.title || ""), "ru");
      });
    }

    return copies.sort((a, b) => dateValue(b) - dateValue(a));
  }

  function filterArchiveMaterials(materials, direction) {
    const filters = filterState(direction);
    const query = filters.archiveSearch.toLowerCase();
    const filtered = materials.filter((material) => {
      const haystack = [
        material.title,
        material.description,
        material.type,
        material.semester?.title,
        material.subject?.title,
        material.subject?.shortTitle
      ].filter(Boolean).join(" ").toLowerCase();

      if (query && !haystack.includes(query)) return false;
      if (filters.archiveSemester && String(material.semester?.number || "") !== filters.archiveSemester) return false;
      if (filters.archiveSubject && material.subject?.slug !== filters.archiveSubject) return false;
      if (filters.archiveType && material.type !== filters.archiveType) return false;

      return true;
    });

    return sortMaterials(filtered, filters.archiveSort);
  }

  function renderCard(material, options = {}) {
    const card = document.createElement("div");
    card.className = "post-card material-card";
    card.classList.toggle("is-pinned", Boolean(material.isPinned));
    card.dataset.materialId = material.id;
    const link = document.createElement("a");
    link.className = "card-link";
    link.href = materialHref(material);
    if (/^https?:\/\//.test(materialHref(material))) { link.target = "_blank"; link.rel = "noopener noreferrer"; }
    const meta = document.createElement("div");
    meta.className = "material-card-meta";
    meta.innerHTML = '<span>' + escapeHtml(typeLabels[material.type] || material.type) + '</span>' +
      (material.semester ? '<span>' + escapeHtml(material.semester.title) + '</span>' : "") +
      (material.subject ? '<span>' + escapeHtml(material.subject.shortTitle || material.subject.title) + '</span>' : "");
    const title = document.createElement("div");
    title.className = "post-card-title";
    title.textContent = material.title;
    const description = document.createElement("div");
    description.className = "post-card-content";
    description.textContent = material.description || "";
    const date = document.createElement("div");
    date.className = "post-card-content";
    date.textContent = formatDate(material.publishedAt || material.createdAt);
    card.append(link, meta, title, description, date);

    if (material.isPinned) {
      const pinBadge = document.createElement("span");
      pinBadge.className = "material-pin-badge";
      pinBadge.textContent = "Закреплено";
      card.append(pinBadge);
    }

    if (canManageMaterial(material)) {
      const actions = document.createElement("div");
      actions.className = "material-actions";
      const edit = document.createElement("button");
      edit.type = "button";
      edit.textContent = "Изменить";
      edit.className = "material-action material-action-edit";
      edit.addEventListener("click", (event) => {
        event.preventDefault(); event.stopPropagation();
        beginMaterialEdit(card, material);
      });
      const pin = document.createElement("button");
      pin.type = "button";
      pin.textContent = material.isPinned ? "Открепить" : "Закрепить";
      pin.className = material.isPinned ? "material-action material-action-unpin" : "material-action material-action-pin";
      pin.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const action = material.isPinned ? "unpin" : "pin";
        pin.disabled = true;
        try {
          await api("/api/admin/materials/" + material.id + "/" + action, { method: "POST" });
          setPanelStatus(material.isPinned ? "Материал откреплён" : "Материал закреплён", false);
          await reloadMaterialDirections(material.direction?.slug);
        } catch (error) {
          setPanelStatus(error.message, true);
          pin.disabled = false;
        }
      });
      const archive = document.createElement("button");
      archive.type = "button";
      archive.textContent = options.archived ? "Вернуть" : "В архив";
      archive.className = options.archived ? "material-action material-action-return" : "material-action material-action-archive";
      archive.addEventListener("click", async (event) => {
        event.preventDefault(); event.stopPropagation();
        const action = options.archived ? "unarchive" : "archive";
        archive.disabled = true;
        try {
          await api("/api/admin/materials/" + material.id + "/" + action, { method: "POST" });
          setPanelStatus(options.archived ? "Материал вернулся на доску" : "Материал отправлен в архив", false);
          await reloadMaterialDirections(material.direction?.slug);
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
        await reloadMaterialDirections(material.direction?.slug);
      });
      actions.append(edit, pin, archive, remove);
      card.append(actions);
    }
    return card;
  }

  function beginMaterialEdit(card, material) {
    card.querySelector(".material-edit-form")?.remove();
    card.classList.add("is-editing");

    const form = document.createElement("form");
    form.className = "material-edit-form";
    const directionSlug = material.direction?.slug || "";
    const semesterNumber = material.semester?.number ? String(material.semester.number) : "";
    form.innerHTML =
      '<label><span>Название</span><input name="title" minlength="2" maxlength="160" required></label>' +
      '<label><span>Описание</span><textarea name="description" maxlength="500" rows="3"></textarea></label>' +
      '<div class="material-edit-grid">' +
      '<label><span>Направление</span><select name="directionSlug" required>' + directionOptions(directionSlug) + '</select></label>' +
      '<label><span>Семестр</span><select name="semesterNumber"><option value="">Без семестра</option>' + semesterOptions().map((semester) => '<option value="' + semester.number + '"' + (String(semester.number) === semesterNumber ? " selected" : "") + '>' + escapeHtml(semester.title) + '</option>').join("") + '</select></label>' +
      '<label><span>Предмет</span><select name="subjectSlug"></select></label>' +
      '<label><span>Тип</span><select name="type">' + materialTypeOptions(material.type) + '</select></label>' +
      '</div>' +
      '<div class="material-edit-actions"><button type="submit">Сохранить</button><button type="button" data-cancel-edit>Отмена</button></div>' +
      '<p class="material-edit-status" data-material-edit-status></p>';

    form.querySelector('input[name="title"]').value = material.title || "";
    form.querySelector('textarea[name="description"]').value = material.description || "";
    const directionSelect = form.querySelector('select[name="directionSlug"]');
    const semesterSelect = form.querySelector('select[name="semesterNumber"]');
    const subjectSelect = form.querySelector('select[name="subjectSlug"]');
    let preserveOriginalSubject = true;
    const fillSubjects = () => {
      const subjects = subjectsForDirection(directionSelect.value, semesterSelect.value);
      const currentSubject = subjects.some((subject) => subject.slug === subjectSelect.value)
        ? subjectSelect.value
        : preserveOriginalSubject ? material.subject?.slug || "" : "";
      const selectedSubject = subjects.some((subject) => subject.slug === currentSubject) ? currentSubject : "";
      subjectSelect.innerHTML = '<option value="">Без предмета</option>' + subjects.map((subject) => '<option value="' + escapeHtml(subject.slug) + '"' + (subject.slug === selectedSubject ? " selected" : "") + '>' + escapeHtml(subject.title || subject.shortTitle) + '</option>').join("");
    };
    directionSelect.addEventListener("change", () => {
      preserveOriginalSubject = false;
      subjectSelect.value = "";
      fillSubjects();
    });
    semesterSelect.addEventListener("change", () => {
      preserveOriginalSubject = false;
      subjectSelect.value = "";
      fillSubjects();
    });
    fillSubjects();
    form.addEventListener("click", (event) => event.stopPropagation());
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      event.stopPropagation();
      const data = new FormData(form);
      const submit = form.querySelector('button[type="submit"]');
      const status = form.querySelector("[data-material-edit-status]");
      submit.disabled = true;
      if (status) {
        status.textContent = "Сохраняю...";
        status.classList.remove("is-error");
      }
      try {
        const nextDirection = String(data.get("directionSlug") || "");
        await api("/api/admin/materials/" + material.id, {
          method: "PATCH",
          body: JSON.stringify({
            title: data.get("title"),
            description: data.get("description"),
            directionSlug: data.get("directionSlug"),
            semesterNumber: data.get("semesterNumber") ? Number(data.get("semesterNumber")) : null,
            subjectSlug: data.get("subjectSlug") || null,
            type: data.get("type")
          })
        });
        syncDirectionCard(nextDirection, true);
        setPanelStatus("Материал обновлён", false);
        if (status) status.textContent = "Сохранено";
        await reloadMaterialDirections(directionSlug, nextDirection);
      } catch (error) {
        if (status) {
          status.textContent = error.message;
          status.classList.add("is-error");
        }
        setPanelStatus(error.message, true);
        submit.disabled = false;
      }
    });
    form.querySelector("[data-cancel-edit]").addEventListener("click", () => {
      form.remove();
      card.classList.remove("is-editing");
    });

    card.append(form);
    form.querySelector('input[name="title"]').focus();
  }

  function renderEmpty(board, direction, filtered = false) {
    const empty = document.createElement("div");
    empty.className = "board-empty";
    empty.dataset.materialsEmpty = "";
    empty.dataset.direction = direction;
    empty.innerHTML = filtered
      ? '<span class="board-empty-stamp">Пусто</span><p class="board-empty-text">По этим фильтрам ничего не нашлось.</p><p class="board-empty-hint">Попробуй убрать предмет, тип или строку поиска.</p>'
      : '<span class="board-empty-stamp">Скоро</span><p class="board-empty-text">Материалы для этого направления ещё пишутся.</p><p class="board-empty-hint">Учишься здесь и хочешь помочь собрать материалы? Напиши нам — доска ждёт своих авторов.</p>';
    board.append(empty);
  }

  function renderCatalogControls(board, direction) {
    const oldControls = board.querySelector("[data-catalog-controls]");
    if (oldControls) oldControls.remove();
    const filters = filterState(direction);
    const subjects = subjectsForDirection(direction, filters.semester);
    if (filters.subject && !subjects.some((subject) => subject.slug === filters.subject)) {
      filters.subject = "";
    }
    const controls = document.createElement("form");
    controls.className = "material-catalog";
    controls.dataset.catalogControls = "";
    controls.innerHTML =
      '<div class="catalog-search"><input name="search" type="search" placeholder="Поиск по материалам, предметам и описаниям" value="' + escapeHtml(filters.search) + '"></div>' +
      '<div class="catalog-filters">' +
      '<select name="semester"><option value="">Все семестры</option>' + semesterOptions().map((semester) => '<option value="' + semester.number + '"' + (String(semester.number) === filters.semester ? " selected" : "") + '>' + escapeHtml(semester.title) + '</option>').join("") + '</select>' +
      '<select name="subject"><option value="">Все предметы</option>' + subjects.map((subject) => '<option value="' + escapeHtml(subject.slug) + '"' + (subject.slug === filters.subject ? " selected" : "") + '>' + escapeHtml(subject.title || subject.shortTitle) + '</option>').join("") + '</select>' +
      '<select name="type"><option value="">Все типы</option>' + Object.keys(typeLabels).map((type) => '<option value="' + type + '"' + (type === filters.type ? " selected" : "") + '>' + escapeHtml(typeLabels[type]) + '</option>').join("") + '</select>' +
      '<button type="button" data-reset-filters>Сбросить</button>' +
      '</div>';
    controls.addEventListener("submit", (event) => event.preventDefault());
    const refresh = () => {
      if (board.dataset.apiFallback === "true") {
        applyStaticFilters(board, direction);
      } else {
        loadDirectionMaterials(board, direction);
      }
    };
    controls.querySelectorAll("select").forEach((select) => select.addEventListener("change", () => {
      filters[select.name] = select.value;
      refresh();
    }));
    const searchInput = controls.querySelector('input[name="search"]');
    let searchTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        filters.search = searchInput.value.trim();
        refresh();
      }, 250);
    });
    controls.querySelector("[data-reset-filters]").addEventListener("click", () => {
      Object.assign(filters, { search: "", semester: "", subject: "", type: "" });
      searchInput.value = "";
      controls.querySelectorAll("select").forEach((select) => { select.value = ""; });
      refresh();
    });
    board.append(controls);
    return controls;
  }

  function applyStaticFilters(board, direction) {
    const filters = filterState(direction);
    const query = filters.search.toLowerCase();
    const cards = Array.from(board.querySelectorAll(".post-card:not(.material-card)"));
    let visible = 0;

    cards.forEach((card) => {
      const matches = !query || card.textContent.toLowerCase().includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });

    let empty = board.querySelector("[data-static-filter-empty]");
    if (!empty) {
      empty = document.createElement("p");
      empty.className = "archive-empty static-filter-empty";
      empty.dataset.staticFilterEmpty = "";
      empty.textContent = "По этим словам в статических карточках ничего не нашлось.";
      board.append(empty);
    }
    empty.hidden = !query || visible > 0;
  }

  function renderGroupedMaterials(target, direction, materials, options = {}) {
    const filters = filterState(direction);
    if (!materials.length) {
      if (options.emptyMessage) {
        const empty = document.createElement("p");
        empty.className = "archive-empty";
        empty.textContent = options.emptyMessage;
        target.append(empty);
      }
      return;
    }

    const grouped = new Map();
    catalogSections.forEach((section) => grouped.set(section.key, []));
    materials.forEach((material) => {
      const key = grouped.has(material.type) ? material.type : "OTHER";
      grouped.get(key).push(material);
    });

    catalogSections.forEach((section) => {
      const sectionMaterials = grouped.get(section.key) || [];
      if (!sectionMaterials.length) return;
      const catalogSection = document.createElement("section");
      catalogSection.className = "catalog-section";
      catalogSection.innerHTML = '<div class="catalog-section-head"><h3>' + escapeHtml(section.title) + '</h3><span>' + sectionMaterials.length + '</span></div>';
      const list = document.createElement("div");
      list.className = "posts-cards board-cards";
      list.dataset.materialsList = "";
      list.dataset.direction = direction;
      sectionMaterials.forEach((material) => list.append(renderCard(material, options.cardOptions || {})));
      catalogSection.append(list);
      target.append(catalogSection);
    });
  }

  function renderShelf(board, direction, title, count, modifier = "") {
    const shelf = document.createElement("section");
    shelf.className = "material-shelf" + (modifier ? " " + modifier : "");
    shelf.innerHTML = '<div class="catalog-section-head material-shelf-head"><h3>' + escapeHtml(title) + '</h3><span>' + count + '</span></div><div data-shelf-content></div>';
    board.append(shelf);
    return shelf.querySelector("[data-shelf-content]");
  }

  function renderMaterials(board, direction, materials) {
    const filters = filterState(direction);
    const filtered = Boolean(filters.search || filters.semester || filters.subject || filters.type);
    const pinnedMaterials = materials.filter((material) => material.isPinned);
    const regularMaterials = materials.filter((material) => !material.isPinned);

    if (pinnedMaterials.length) {
      const pinnedContent = renderShelf(board, direction, "Закреплённое", pinnedMaterials.length, "material-shelf-pinned");
      renderGroupedMaterials(pinnedContent, direction, pinnedMaterials);
    }

    const content = renderShelf(board, direction, "Актуальное", regularMaterials.length, "material-shelf-current");
    if (!regularMaterials.length) {
      renderEmpty(content, direction, filtered);
      return;
    }
    renderGroupedMaterials(content, direction, regularMaterials);
  }

  function renderArchiveControls(target, direction) {
    const filters = filterState(direction);
    const subjects = subjectsForDirection(direction, filters.archiveSemester);
    if (filters.archiveSubject && !subjects.some((subject) => subject.slug === filters.archiveSubject)) {
      filters.archiveSubject = "";
    }
    const controls = document.createElement("form");
    controls.className = "material-catalog archive-catalog";
    controls.dataset.archiveControls = "";
    controls.innerHTML =
      '<div class="catalog-search"><input name="archiveSearch" type="search" placeholder="Поиск внутри архива" value="' + escapeHtml(filters.archiveSearch) + '"></div>' +
      '<div class="catalog-filters archive-filters">' +
      '<select name="archiveSemester"><option value="">Все семестры архива</option>' + semesterOptions().map((semester) => '<option value="' + semester.number + '"' + (String(semester.number) === filters.archiveSemester ? " selected" : "") + '>' + escapeHtml(semester.title) + '</option>').join("") + '</select>' +
      '<select name="archiveSubject"><option value="">Все предметы архива</option>' + subjects.map((subject) => '<option value="' + escapeHtml(subject.slug) + '"' + (subject.slug === filters.archiveSubject ? " selected" : "") + '>' + escapeHtml(subject.title || subject.shortTitle) + '</option>').join("") + '</select>' +
      '<select name="archiveType"><option value="">Все типы архива</option>' + Object.keys(typeLabels).map((type) => '<option value="' + type + '"' + (type === filters.archiveType ? " selected" : "") + '>' + escapeHtml(typeLabels[type]) + '</option>').join("") + '</select>' +
      '<select name="archiveSort"><option value="newest"' + (filters.archiveSort === "newest" ? " selected" : "") + '>Сначала новые</option><option value="oldest"' + (filters.archiveSort === "oldest" ? " selected" : "") + '>Сначала старые</option><option value="title"' + (filters.archiveSort === "title" ? " selected" : "") + '>По названию</option><option value="subject"' + (filters.archiveSort === "subject" ? " selected" : "") + '>По предмету</option></select>' +
      '<button type="button" data-reset-archive-filters>Сбросить архив</button>' +
      '</div>';

    controls.addEventListener("submit", (event) => event.preventDefault());
    controls.querySelectorAll("select").forEach((select) => select.addEventListener("change", () => {
      filters[select.name] = select.value;
      loadDirectionMaterials(target.closest(".board-main"), direction);
    }));

    const searchInput = controls.querySelector('input[name="archiveSearch"]');
    let searchTimer;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        filters.archiveSearch = searchInput.value.trim();
        loadDirectionMaterials(target.closest(".board-main"), direction);
      }, 250);
    });

    controls.querySelector("[data-reset-archive-filters]").addEventListener("click", () => {
      Object.assign(filters, { archiveSearch: "", archiveSemester: "", archiveSubject: "", archiveType: "", archiveSort: "newest" });
      loadDirectionMaterials(target.closest(".board-main"), direction);
    });

    target.append(controls);
  }

  function renderArchive(board, direction, materials, total) {
    const filteredMaterials = filterArchiveMaterials(materials, direction);
    const content = renderShelf(board, direction, "Архив", filteredMaterials.length + " / " + total, "material-shelf-archive");
    renderArchiveControls(content, direction);
    renderGroupedMaterials(content, direction, filteredMaterials, {
      cardOptions: { archived: true },
      emptyMessage: total ? "В архиве по этим фильтрам ничего не нашлось." : "В архиве пока пусто."
    });
  }

  async function loadDirectionMaterials(board, direction) {
    try {
      const [data, archiveData] = await Promise.all([
        api("/api/materials?" + buildMaterialQuery(direction)),
        api("/api/materials?" + buildMaterialQuery(direction, true))
      ]);
      const materials = data.items || [];
      const archivedMaterials = archiveData.items || [];
      syncDirectionCard(direction, Boolean((data.total || materials.length) || (archiveData.total || archivedMaterials.length)));
      delete board.dataset.apiFallback;
      board.innerHTML = "";
      renderCatalogControls(board, direction);
      renderMaterials(board, direction, materials);
      renderArchive(board, direction, archivedMaterials, archiveData.total || archivedMaterials.length);
    } catch (error) {
      console.warn("Materials API unavailable, static cards are kept.", error);
      board.dataset.apiFallback = "true";
      const controls = renderCatalogControls(board, direction);
      board.insertBefore(controls, board.firstChild);
      applyStaticFilters(board, direction);
    }
  }

  async function loadMaterials() {
    const boards = Array.from(document.querySelectorAll(".board-main[data-direction]"));
    await Promise.all(boards.map(async (board) => {
      const direction = board.dataset.direction;
      if (direction) await loadDirectionMaterials(board, direction);
    }));
  }

  function setPanelStatus(message, isError) {
    const status = document.querySelector("[data-admin-status]");
    if (!status) return;
    status.textContent = message;
    status.classList.toggle("is-error", Boolean(isError));
  }

  async function uploadMaterialFile(file, form) {
    if (!file) return;
    const dropzone = form.querySelector("[data-upload-dropzone]");
    const title = form.querySelector("[data-upload-title]");
    const status = form.querySelector("[data-upload-status]");
    const fileUrlInput = form.querySelector('input[name="fileUrl"]');
    const body = new FormData();
    body.append("file", file);

    dropzone.classList.add("is-uploading");
    dropzone.classList.remove("is-error", "is-ready");
    title.textContent = file.name;
    status.textContent = "Загружаю файл...";

    try {
      const uploaded = await api("/api/admin/uploads", { method: "POST", body });
      fileUrlInput.value = uploaded.url;
      dropzone.classList.remove("is-uploading");
      dropzone.classList.add("is-ready");
      status.textContent = "Файл загружен, ссылка подставлена";
      setPanelStatus("Файл загружен", false);
    } catch (error) {
      dropzone.classList.remove("is-uploading");
      dropzone.classList.add("is-error");
      status.textContent = error.message;
      setPanelStatus(error.message, true);
    }
  }

  function initMaterialUpload(form) {
    const dropzone = form.querySelector("[data-upload-dropzone]");
    const input = form.querySelector('input[name="uploadFile"]');
    if (!dropzone || !input) return;

    input.addEventListener("change", () => {
      uploadMaterialFile(input.files?.[0], form);
    });

    ["dragenter", "dragover"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach((eventName) => {
      dropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropzone.classList.remove("is-dragging");
      });
    });

    dropzone.addEventListener("drop", (event) => {
      uploadMaterialFile(event.dataTransfer?.files?.[0], form);
    });
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
      content.innerHTML = '<div class="admin-tabs"><button type="button" class="is-active" data-admin-tab="materials">Материалы</button>' + (state.user?.role === "ADMIN" ? '<button type="button" data-admin-tab="users">Тьюторы</button>' : "") + '</div><div data-admin-tab-panel="materials"><form class="admin-material-form"><input name="title" placeholder="Название" required><input name="description" placeholder="Описание"><select name="directionSlug" required></select><select name="semesterNumber"></select><select name="subjectSlug"></select><select name="type"><option value="GUIDE">Гайд</option><option value="NOTES">Конспект</option><option value="EXAM">Экзамен / программа</option><option value="LINKS">Ссылки</option><option value="OTHER">Другое</option></select><input name="externalUrl" type="url" placeholder="Ссылка на страницу или внешний ресурс"><label class="admin-dropzone" data-upload-dropzone><input name="uploadFile" type="file" accept=".pdf,.doc,.docx,.odt,.md,.png,.jpg,.jpeg,.webp,.zip,.ppt,.pptx,.apkg"><span data-upload-title>Перетащи файл сюда</span><small data-upload-status>или нажми, чтобы выбрать PDF, MD, DOCX, ODT, PPTX, ZIP, APKG или картинку</small></label><input name="fileUrl" placeholder="Путь к файлу заполнится после загрузки"><button type="submit">Добавить</button><button type="button" data-admin-logout>Выйти</button></form></div>' + (state.user?.role === "ADMIN" ? '<div data-admin-tab-panel="users" hidden><form class="admin-user-form"><input name="name" placeholder="Имя тьютора" required><input name="email" type="email" placeholder="Почта" required><input name="password" type="text" placeholder="Пароль от 8 символов" required><div class="admin-direction-checks" data-new-user-directions></div><button type="submit">Создать тьютора</button></form><div class="admin-users-list" data-admin-users-list></div></div>' : "");
      content.querySelector(".admin-material-form").addEventListener("submit", onCreateMaterial);
      content.querySelector("[data-admin-logout]").addEventListener("click", onLogout);
      content.querySelectorAll("[data-admin-tab]").forEach((button) => button.addEventListener("click", () => switchAdminTab(button.dataset.adminTab)));
      const userForm = content.querySelector(".admin-user-form");
      if (userForm) userForm.addEventListener("submit", onCreateUser);
      fillMaterialFormSelects();
      initMaterialUpload(content.querySelector(".admin-material-form"));
      fillUserDirectionChecks();
      renderUsers();
      if (state.user?.role === "ADMIN") loadUsers();
    } else {
      content.innerHTML = '<form class="admin-login-form"><input name="email" type="email" placeholder="Почта" autocomplete="username" required><div class="admin-password-field"><input name="password" type="password" placeholder="Пароль" autocomplete="current-password" minlength="8" required><button type="button" data-toggle-password>Показать</button></div><button type="submit">Войти</button></form>';
      content.querySelector(".admin-login-form").addEventListener("submit", onLogin);
      content.querySelector("[data-toggle-password]").addEventListener("click", onTogglePassword);
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

  function fillMaterialFormSelects() {
    const form = document.querySelector(".admin-material-form");
    if (!form) return;
    const directionSelect = form.querySelector('select[name="directionSlug"]');
    const semesterSelect = form.querySelector('select[name="semesterNumber"]');
    const subjectSelect = form.querySelector('select[name="subjectSlug"]');
    const directions = availableDirections();
    directionSelect.innerHTML = directions.map((direction) => '<option value="' + escapeHtml(direction.slug) + '">' + escapeHtml(direction.shortName) + '</option>').join("");
    directionSelect.disabled = state.user?.role !== "ADMIN" && directions.length <= 1;
    semesterSelect.innerHTML = '<option value="">Без семестра</option>' + state.semesters.map((semester) => '<option value="' + semester.number + '">' + escapeHtml(semester.title) + '</option>').join("");
    const fillSubjects = () => {
      const subjects = subjectsForDirection(directionSelect.value, semesterSelect.value);
      const currentSubject = subjects.some((subject) => subject.slug === subjectSelect.value) ? subjectSelect.value : "";
      subjectSelect.innerHTML = '<option value="">Без предмета</option>' + subjects.map((subject) => '<option value="' + escapeHtml(subject.slug) + '"' + (subject.slug === currentSubject ? " selected" : "") + '>' + escapeHtml(subject.title || subject.shortTitle) + '</option>').join("");
    };
    directionSelect.addEventListener("change", fillSubjects);
    semesterSelect.addEventListener("change", fillSubjects);
    fillSubjects();
    const submit = form.querySelector('button[type="submit"]');
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
      return '<article class="admin-user-card" data-user-id="' + escapeHtml(user.id) + '"><div class="admin-user-head"><strong>' + escapeHtml(user.name) + '</strong><small>Логин: ' + escapeHtml(user.email) + '</small></div><span class="admin-user-role">' + (user.role === "ADMIN" ? "Админ" : "Тьютор") + '</span><div class="admin-direction-checks">' + directionCheckboxes(selected) + '</div><div class="admin-user-password"><label><span>Новый пароль</span><div class="admin-password-field"><input name="password" type="password" placeholder="От 8 символов" minlength="8"><button type="button" data-toggle-password>Показать</button></div></label><button type="button" data-save-user-password>Сменить пароль</button></div><div class="admin-user-actions"><button type="button" data-save-user>Сохранить доступ</button><button type="button" data-toggle-user>' + (user.isActive ? "Отключить" : "Включить") + '</button></div></article>';
    }).join("");
    list.querySelectorAll("[data-save-user]").forEach((button) => button.addEventListener("click", onSaveUserAccess));
    list.querySelectorAll("[data-toggle-user]").forEach((button) => button.addEventListener("click", onToggleUser));
    list.querySelectorAll("[data-toggle-password]").forEach((button) => button.addEventListener("click", onTogglePassword));
    list.querySelectorAll("[data-save-user-password]").forEach((button) => button.addEventListener("click", onSaveUserPassword));
  }

  async function onLogin(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const data = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }) });
      state.token = data.accessToken;
      state.user = data.user;
      localStorage.setItem(TOKEN_KEY, state.token);
      refreshAdminPanel();
      await loadMaterials();
    } catch (error) {
      setPanelStatus(error.message, true);
    }
  }

  function onTogglePassword(event) {
    const button = event.currentTarget;
    const field = button.closest(".admin-password-field");
    const input = field?.querySelector('input[name="password"]');
    if (!input) return;

    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    button.textContent = isHidden ? "Скрыть" : "Показать";
  }

  async function onCreateMaterial(event) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const semester = form.get("semesterNumber");
    try {
      await api("/api/admin/materials", {
        method: "POST",
        body: JSON.stringify({
          title: form.get("title"),
          description: form.get("description") || undefined,
          directionSlug: form.get("directionSlug"),
          semesterNumber: semester ? Number(semester) : undefined,
          subjectSlug: form.get("subjectSlug") || undefined,
          type: form.get("type"),
          externalUrl: form.get("externalUrl") || undefined,
          fileUrl: form.get("fileUrl") || undefined
        })
      });
      formElement.reset();
      fillMaterialFormSelects();
      initMaterialUpload(formElement);
      syncDirectionCard(String(form.get("directionSlug") || ""), true);
      setPanelStatus("Материал добавлен", false);
      await reloadMaterialDirections(String(form.get("directionSlug") || ""));
    } catch (error) {
      setPanelStatus(error.message, true);
    }
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
      setPanelStatus("Тьютор создан. Логин: " + data.get("email") + " Пароль: " + data.get("password"), false);
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

  async function onSaveUserPassword(event) {
    const card = event.currentTarget.closest("[data-user-id]");
    const user = state.users.find((item) => item.id === card?.dataset.userId);
    const passwordInput = card?.querySelector('input[name="password"]');
    const password = passwordInput?.value || "";
    if (!card || !user || password.length < 8) {
      setPanelStatus("Пароль должен быть не короче 8 символов", true);
      return;
    }

    try {
      await api("/api/admin/users/" + user.id, { method: "PATCH", body: JSON.stringify({ password }) });
      passwordInput.value = "";
      setPanelStatus("Пароль обновлён. Логин: " + user.email + " Новый пароль: " + password, false);
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

  async function onLogout() {
    try { await api("/api/auth/logout", { method: "POST" }); } catch (_error) {}
    state.token = "";
    state.user = null;
    localStorage.removeItem(TOKEN_KEY);
    refreshAdminPanel();
    await loadMaterials();
  }

  function initGlobalCatalog() {
    const form = document.querySelector("[data-global-catalog] form");
    if (!form) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const direction = String(data.get("direction") || "pi");
      const filters = filterState(direction);
      Object.assign(filters, {
        search: String(data.get("search") || "").trim(),
        semester: String(data.get("semester") || ""),
        subject: "",
        type: String(data.get("type") || "")
      });

      const board = Array.from(document.querySelectorAll(".board-main[data-direction]"))
        .find((item) => item.dataset.direction === direction);
      if (!board) return;

      board.scrollIntoView({ behavior: "smooth", block: "start" });
      loadDirectionMaterials(board, direction);
    });
  }

  async function bootstrap() {
    initGlobalCatalog();
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
    try {
      const result = await Promise.all([api("/api/directions"), api("/api/semesters"), api("/api/subjects")]);
      state.directions = result[0];
      state.semesters = result[1];
      state.subjects = result[2];
      refreshAdminPanel();
    } catch (error) {
      console.warn("Directory API unavailable.", error);
    }
    await loadMaterials();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap); else bootstrap();
})();
