# Подключение PostgreSQL (Supabase) к Random Parkour Mayhem

Игра уже умеет сохранять:
- **Профиль игрока** (монеты, косметика, статистика, достижения, настройки) → таблица `users.profile` (JSONB)
- **Сессии** (логин/пароль) → `sessions`
- **Лидерборд Time Attack** → `time_attack_scores`
- **Мини-лидерборд** → `mini_scores`

## 1. Создай таблицы в Supabase

1. Открой https://supabase.com → свой проект
2. Слева **SQL Editor** → **New query**
3. Вставь содержимое файла `src/db/migrate.sql` и нажми **Run**

Или через CLI (локально):
```bash
export DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@db.XXXX.supabase.co:5432/postgres?sslmode=require"
npm run db:push
```

## 2. Переменная окружения DATABASE_URL

### Netlify
1. Site configuration → Environment variables
2. Добавь:
   - Key: `DATABASE_URL`
   - Value: строка подключения из Supabase (Connect → URI)
3. Redeploy сайт

### Локально
Создай `.env.local`:
```
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@db.XXXX.supabase.co:5432/postgres?sslmode=require
```

## 3. Проверка

После деплоя открой:
- `https://твой-сайт.netlify.app/api/health` → должно вернуть `{"ok":true}`
- Зарегистрируйся в игре → данные уйдут в Supabase
- Table Editor в Supabase → увидишь users / time_attack_scores

## Важно по безопасности

- Не коммить `.env` / пароли в git
- Для serverless (Netlify) лучше Connection Pooler из Supabase → Connect
