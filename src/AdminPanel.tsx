import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, FloppyDisk, ArrowClockwise, Buildings, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { initTelegram, telegram } from './lib/telegram';
import './admin.css';

type Place = { id: string; name: string; district: string; address: string; category: 'coffee'|'workspace'; active: boolean; latitude: number | null; longitude: number | null };
type Form = Omit<Place, 'id'>;
const blank: Form = { name: '', district: '', address: '', category: 'coffee', active: true, latitude: null, longitude: null };
async function request(method: 'GET'|'POST'|'PATCH', body?: unknown) {
  const initData = telegram()?.initData;
  if (!initData) throw new Error('Открой админ-панель через своего Telegram-бота.');
  const response = await fetch('/api/admin', {
    method, headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || 'Ошибка сервера BOR.');
  return data;
}
export default function AdminPanel() {
  const [places, setPlaces] = useState<Place[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  async function refresh() {
    setLoading(true); setError('');
    try { const data = await request('GET'); setPlaces(data.places); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    finally { setLoading(false); }
  }
  useEffect(() => { initTelegram(); if (telegram()?.initData) { void refresh(); } else { setLoading(false); } }, []);
  function edit(place: Place) {
    setSelected(place.id);
    setForm({ name: place.name, district: place.district, address: place.address, category: place.category, active: place.active, latitude: place.latitude, longitude: place.longitude });
    setNotice(''); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function create() { setSelected(null); setForm({ ...blank }); setNotice(''); setError(''); }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(''); setNotice('');
    try {
      if ((form.latitude === null) !== (form.longitude === null)) throw new Error('Для карты нужны и широта, и долгота.');
      await request(selected ? 'PATCH' : 'POST', selected ? { ...form, id: selected } : form);
      setNotice(selected ? 'Изменения сохранены.' : 'Заведение добавлено.');
      await refresh();
      if (!selected) setForm({ ...blank });
    } catch (e) { setError(e instanceof Error ? e.message : 'Ошибка сохранения'); }
    finally { setBusy(false); }
  }
  const telegramAuthorized = Boolean(telegram()?.initData);
  const filtered = places.filter(p => [p.name, p.district, p.address].some(v => v.toLowerCase().includes(query.toLowerCase())));
  return <div className="shell admin-shell">
    <header className="header"><a href="/" className="admin-brand">bor<span>.</span></a><span className="admin-label">Управление местами</span></header>
    <main className="content">
      <a className="back admin-link" href="/"><ArrowLeft size={18}/> К приложению</a>
      <div className="eyebrow">BOR / АДМИНИСТРАТОР</div>
      <h1>Заведения</h1>
      <p className="intro">Добавляй только существующие места с проверенными адресами. Изменения сразу сохраняются в Supabase.</p>
      {!telegramAuthorized && <section className="admin-auth-info" role="status">
        <WarningCircle size={23}/>
        <div><h2>Нужен вход через Telegram</h2>
        <p>Страница открылась, но Telegram не передал подписанные данные пользователя. Такое бывает, если ссылка открыта в Safari, Chrome или встроенном браузере другого приложения.</p>
        <p>Скопируй ссылку <strong>t.me/bor_city_bot?startapp=admin</strong> и отправь её себе в «Избранное» Telegram. Нажми на ссылку <strong>внутри Telegram</strong> и выбери «Открыть приложение».</p>
        <button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText('https://t.me/bor_city_bot?startapp=admin');setNotice('Ссылка скопирована. Открой её внутри Telegram.')}catch{setError('Не удалось скопировать. Скопируй ссылку вручную.')}}}>Скопировать ссылку для Telegram</button>
        <button type="button" className="admin-textbutton" onClick={()=>{if(telegram()?.initData){void refresh()}else{setError('Telegram всё ещё не передал данные. Открой ссылку в самом Telegram.')}}}>Проверить вход повторно</button></div>
      </section>}
      <form className="admin-form" onSubmit={save}>
        <div className="admin-form-title"><h2>{selected ? 'Редактировать место' : 'Новое заведение'}</h2>{selected && <button type="button" className="admin-textbutton" onClick={create}><Plus size={16}/> Новое</button>}</div>
        <label>Название<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Например, название кофейни"/></label>
        <label>Район<input required minLength={2} maxLength={80} value={form.district} onChange={e => setForm(f => ({...f, district: e.target.value}))} placeholder="Например, Юнусабад"/></label>
        <label>Адрес<input required minLength={5} maxLength={240} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Улица, дом, ориентир"/></label>
        <div className="admin-two">
          <label>Категория<select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as Form['category']}))}><option value="coffee">Кофейня</option><option value="workspace">Рабочее место</option></select></label>
          <label>Публикация<select value={form.active ? 'yes':'no'} onChange={e => setForm(f => ({...f, active: e.target.value === 'yes'}))}><option value="yes">Активно</option><option value="no">Скрыто</option></select></label>
        </div>
        <div className="admin-location-box">
          <div className="admin-location-title"><strong>Точка на карте</strong><span>Необязательно</span></div>
          <p>Укажи точные координаты входа в заведение из карт. Оба поля заполняются вместе; без них место остаётся в каталоге без маршрута.</p>
          <div className="admin-two">
            <label>Широта<input type="number" inputMode="decimal" step="any" min="-90" max="90" placeholder="41.311081" value={form.latitude ?? ''} onChange={e=>setForm(f=>({...f,latitude:e.target.value===''?null:Number(e.target.value)}))}/></label>
            <label>Долгота<input type="number" inputMode="decimal" step="any" min="-180" max="180" placeholder="69.240562" value={form.longitude ?? ''} onChange={e=>setForm(f=>({...f,longitude:e.target.value===''?null:Number(e.target.value)}))}/></label>
          </div>
          {form.latitude!==null&&form.longitude!==null&&<a className="admin-map-preview" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${form.latitude}%2C${form.longitude}`}>Проверить точку в Google Maps ↗</a>}
        </div>
        {error && <div className="admin-message admin-error" role="alert"><WarningCircle size={19}/>{error}</div>}
        {notice && <div className="admin-message admin-success" role="status"><CheckCircle size={19}/>{notice}</div>}
        <button className="primary" disabled={busy || loading || !telegramAuthorized} type="submit"><FloppyDisk size={19}/> {busy ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Добавить заведение'}</button>
      </form>
      <div className="admin-list-heading"><h2>Все заведения <span>{places.length}</span></h2><button type="button" className="icon-btn refresh" aria-label="Обновить список" onClick={() => void refresh()}><ArrowClockwise size={20}/></button></div>
      <input className="admin-search" placeholder="Поиск по названию, району, адресу" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск заведений"/>
      {loading ? <div className="admin-muted">Загружаем данные…</div> : filtered.length ? <div className="admin-rows">{filtered.map(p => <button key={p.id} type="button" className={'admin-row ' + (selected===p.id?'admin-row-selected':'')} onClick={()=>edit(p)}><span className="admin-row-icon"><Buildings size={21}/></span><span className="admin-row-info"><strong>{p.name}</strong><small>{p.district} · {p.address}</small></span><span className={p.active?'admin-pill':'admin-pill admin-pill-off'}>{p.active?'Активно':'Скрыто'}</span></button>)}</div> : <div className="empty"><Buildings size={28}/><h3>{places.length ? 'Ничего не найдено' : 'Пока нет заведений'}</h3><p>{places.length ? 'Попробуй другой запрос.' : 'Добавь первое проверенное место через форму выше.'}</p></div>}
      <p className="footnote">Админ-доступ определяется на сервере по подписанным данным Telegram. Скрытые места не отображаются в публичном каталоге.</p>
    </main>
  </div>;
}
