(function () {
  const API_BASE = window.TUTORSHIP_API_BASE
    || (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname) && window.location.port !== "4000"
      ? "http://localhost:4000"
      : "");
  const params = new URLSearchParams(window.location.search);
  const title = params.get("title") || "Материал";
  const description = params.get("description") || "";
  const src = params.get("src") || "";

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  }

  function resolveSource(value) {
    if (!value) return "";
    if (/^https?:\/\//i.test(value)) return value;
    if (API_BASE && value.startsWith("/api/")) return API_BASE + value;
    return value;
  }

  function inlineMarkdown(value) {
    return escapeHtml(value)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>")
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  }

  function renderTable(lines) {
    const rows = lines.map((line) => line.trim().replace(/^\||\|$/g, "").split("|").map((cell) => inlineMarkdown(cell.trim())));
    const head = rows[0] || [];
    const body = rows.slice(2);
    return '<div class="table-wrapper"><table><thead><tr>' + head.map((cell) => "<th>" + cell + "</th>").join("") + "</tr></thead><tbody>" +
      body.map((row) => "<tr>" + row.map((cell) => "<td>" + cell + "</td>").join("") + "</tr>").join("") +
      "</tbody></table></div>";
  }

  function renderMarkdown(markdown) {
    const lines = markdown.replace(/\r\n/g, "\n").split("\n");
    const html = [];
    let paragraph = [];
    let list = [];
    let table = [];
    let inCode = false;
    let code = [];

    function flushParagraph() {
      if (!paragraph.length) return;
      html.push("<p>" + inlineMarkdown(paragraph.join(" ")) + "</p>");
      paragraph = [];
    }

    function flushList() {
      if (!list.length) return;
      html.push("<ul>" + list.map((item) => "<li>" + inlineMarkdown(item) + "</li>").join("") + "</ul>");
      list = [];
    }

    function flushTable() {
      if (!table.length) return;
      html.push(renderTable(table));
      table = [];
    }

    for (const line of lines) {
      if (/^```/.test(line)) {
        if (inCode) {
          html.push("<pre><code>" + escapeHtml(code.join("\n")) + "</code></pre>");
          code = [];
          inCode = false;
        } else {
          flushParagraph();
          flushList();
          flushTable();
          inCode = true;
        }
        continue;
      }

      if (inCode) {
        code.push(line);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        flushTable();
        continue;
      }

      if (/^\s*\|.+\|\s*$/.test(line)) {
        flushParagraph();
        flushList();
        table.push(line);
        continue;
      }

      flushTable();

      const heading = line.match(/^(#{1,6})\s+(.+)$/);
      if (heading) {
        flushParagraph();
        flushList();
        const level = Math.min(heading[1].length, 4);
        html.push("<h" + level + ">" + inlineMarkdown(heading[2]) + "</h" + level + ">");
        continue;
      }

      const quote = line.match(/^>\s?(.+)$/);
      if (quote) {
        flushParagraph();
        flushList();
        html.push("<blockquote><p>" + inlineMarkdown(quote[1]) + "</p></blockquote>");
        continue;
      }

      const item = line.match(/^\s*[-*]\s+(.+)$/);
      if (item) {
        flushParagraph();
        list.push(item[1]);
        continue;
      }

      paragraph.push(line.trim());
    }

    flushParagraph();
    flushList();
    flushTable();

    return html.join("\n");
  }

  async function bootstrap() {
    const titleNode = document.querySelector("[data-reader-title]");
    const descriptionNode = document.querySelector("[data-reader-description]");
    const contentNode = document.querySelector("[data-markdown-content]");
    if (titleNode) titleNode.textContent = title;
    if (descriptionNode) descriptionNode.textContent = description;
    if (!contentNode) return;

    if (!src) {
      contentNode.innerHTML = "<p>Материал не выбран.</p>";
      return;
    }

    try {
      const response = await fetch(resolveSource(src), { credentials: "include" });
      if (!response.ok) throw new Error("Не удалось загрузить markdown");
      contentNode.innerHTML = renderMarkdown(await response.text());
    } catch (error) {
      contentNode.innerHTML = "<p>" + escapeHtml(error.message) + "</p>";
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bootstrap); else bootstrap();
})();
