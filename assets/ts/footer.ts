
// Модуль для управления темой и дополнительными функциями футера

// Сначала восстановим тему из localStorage или системных настроек
function initTheme() {
  const saved = localStorage.getItem('theme') || localStorage.getItem('StackColorScheme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-scheme', saved);
  } else {
    // Если ничего не сохранено — используем настойку системы
    const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.setAttribute('data-scheme', prefers);
  }
}

// Переключатель темы
function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-scheme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-scheme', next);
    localStorage.setItem('theme', next);
    localStorage.setItem('StackColorScheme', next);
  });
}

// Модальное окно обратной связи
function setupFeedbackModal() {
  const modal = document.getElementById('feedback-modal');
  const closeBtn = modal?.querySelector<HTMLElement>('.close');
  
  function toggle() {
    modal?.classList.toggle('show');
  }

  // Открыть по ссылке
  document.querySelectorAll('[data-feedback-toggle]').forEach(el =>
    el.addEventListener('click', (e) => {
      e.preventDefault();
      toggle();
    })
  );

  // Закрыть по крестику
  closeBtn?.addEventListener('click', () => toggle());

  // Закрыть по клику вне содержимого
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) toggle();
  });
}

// Кнопка «наверх»
function setupScrollToTop() {
  const btn = document.querySelector<HTMLElement>('.scroll-to-top');
  if (!btn) return;

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  let ticking = false;
  const updateVisibility = () => {
    btn.classList.toggle('is-visible', window.scrollY > 300);
    ticking = false;
  };

  updateVisibility();
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(updateVisibility);
  }, { passive: true });
}

// Инициализация всех функций после загрузки DOM
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setupThemeToggle();
  setupFeedbackModal();
  setupScrollToTop();
});
