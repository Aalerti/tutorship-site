## Tutorship

Материаллы и гайды для перваков КНиИТа чтобы не потеряться в учебе.

---
## Установка и запуск

1. **Скопируйте репозиторий**
```bash
git clone --recursive git@github.com:Chertilas-and-Co/Tutorship2025.git
```
2. Подготовьте локальные переменные окружения:
```bash
cp .env.example .env
```
Для production поменяйте `NODE_ENV=production`, домены, пароль Postgres и оба JWT-секрета.

3. Запустите с помощью *docker compose up*
```bash
cd Tutorship2025
docker compose up --build
```
Сайт будет поднят на http://localhost:1313

Backend доступен напрямую на http://localhost:4000 и через тот же origin сайта по `/api`.

## Деплой

1. На сервере заполните `.env` на основе `.env.example`.
2. Для production используйте реальные значения:
```bash
NODE_ENV=production
PUBLIC_SITE_URL=https://se-tutorship.ru
HUGO_BASEURL=https://se-tutorship.ru
COOKIE_SECURE=true
JWT_ACCESS_SECRET=<случайная строка от 32 символов>
JWT_REFRESH_SECRET=<другая случайная строка от 32 символов>
ADMIN_EMAIL=<почта первого админа>
ADMIN_PASSWORD=<сильный пароль первого админа>
POSTGRES_PASSWORD=<сильный пароль>
```
3. Запустите:
```bash
./deploy.sh
```

Скрипт подтянет submodules, соберёт Docker-образы, применит Prisma migrations при старте backend, заполнит базу через seed и поднимет сервисы через Docker Compose.

## Добавление новых материалов

### Создание нового поста

1. **Создайте новый пост с помощью Hugo:**
	```bash
	hugo new content/posts/2024(или `2025`)/название-поста.md
	```
2. **Отредактируйте созданный файл:**  
    Откройте файл в любом текстовом редакторе и заполните метаданные:
	```text
	--- 
	title: "Название вашего поста" 
	date: 2024-01-15 
	description: "Краткое описание поста" 
	--- 
	
	Содержимое вашего поста в формате Markdown...
	```
3. **Используйте Markdown для форматирования:**
    - `# Заголовок 1`
    - `## Заголовок 2`
    - `**жирный текст**`
    - `*курсив*`
    - `[ссылка](URL)`
    - ` ```код``` `

---
## Структура контента

Материалы организованы следующим образом:
- `content/_index.md` - главная страница
- `content/posts/2024/` - посты за 2024 год
- `content/posts/2025/` - посты за 2025 год (для будущих материалов)
### Добавление изображений
1. Поместите изображения в папку `assets/images/`
2. Ссылайтесь на них в Markdown:
    ```
    ![Описание изображения](/images/название-изображения.png)
	```

--- 
## Контакты

- **Авторы:** [Максим Бретт](https://github.com/Aalerti), [Иван Архипов](https://t.me/gohy279), [Александр Железко](https://t.me/Al_jel)

_Удачи в учебе! 🚀_
