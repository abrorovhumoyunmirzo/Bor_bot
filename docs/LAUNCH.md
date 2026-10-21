# BOR: проверка выхода в live

1. Убедитесь, что в Vercel Environment Variables (Production) заданы:
   - `SUPABASE_URL`: URL вида https://project.supabase.co
   - `SUPABASE_SECRET_KEY`: серверный sb_secret_... (НЕ VITE_*)
   - `TELEGRAM_BOT_TOKEN`: действительный токен из BotFather
2. После изменения переменных выполните Redeploy. Проверьте, что последний deployment использует свежий commit.
3. Откройте `https://ВАШ-ДОМЕН.vercel.app/api/health`:
   - `status: ready`, `database: connected`: API может читать таблицы.
   - `hasActivePlaces: false`: база подключена, но нужно добавить настоящие заведения.
   - `not_configured`: не все переменные заданы или не выполнен redeploy.
   - `database_error`: неправильные параметры Supabase, SQL-схема не применена или БД недоступна.
4. В Supabase → SQL Editor проверьте:
   ```sql
   select count(*) from public.places where active = true;
   select count(*) from public.reports;
   ```
5. Добавьте **реальное, проверенное вами заведение**. Подставьте корректные название, район и адрес:
   ```sql
   insert into public.places (name, district, address, category, active)
   values ('НАЗВАНИЕ РЕАЛЬНОГО МЕСТА', 'РАЙОН', 'ПРОВЕРЕННЫЙ АДРЕС', 'coffee', true);
   ```
   Для рабочего пространства используйте категорию `workspace`. Не публикуйте вымышленные места.
6. В `/api/places` ожидается `mode: live` и массив `places`. У нового места статус «Нет свежих данных», это нормально.
7. Откройте приложение через Main Mini App вашего бота в Telegram. В карточке настоящего места отправьте наблюдение.
8. В SQL Editor проверьте новый отчёт:
   ```sql
   select place_id, crowd, wifi, created_at
   from public.reports
   order by created_at desc
   limit 5;
   ```
9. Повторно откройте `/api/places`: наблюдение должно отражаться в данных. Свежее наблюдение не означает независимого подтверждения.

## Важное

Браузер сам по себе не передаёт подписанный Telegram initData. Поэтому чтение мест доступно через обычный браузер, а запись отчёта только из Telegram. Ключ Supabase и токен бота никогда не должны попадать в GitHub, сообщение или переменные браузера. Если `/api/health` возвращает 404, проверьте настройки проекта Vercel, что серверные функции из `api/` опубликованы.
