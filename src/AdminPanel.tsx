import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, FloppyDisk, ArrowClockwise, Buildings, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { initTelegram, telegram } from './lib/telegram';
import './admin.css';
import { VenueMap } from './VenueMap';

type Place = { id: string; name: string; district: string; address: string; category: 'coffee'|'workspace'|'cafe'|'restaurant'; active: boolean; latitude: number | null; longitude: number | null; source_id?:string|null };
type Form = Omit<Place, 'id' | 'source_id'>;
type Analytics={totalUsers:number;totalOpens:number;todayUsers:number;weekUsers:number;returningUsers:number;daily:{date:string;users:number;opens:number}[]};
type Suggestion={id:string;name:string;district:string;address:string;category:Place['category'];created_at:string};
function readLocation(value: string): { latitude: number; longitude: number } | null {
 const text=value.trim();
 const direct=text.match(/(-?\d{1,2}\.\d+)\s*[,;\s]\s*(-?\d{1,3}\.\d+)/);
 const at=text.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
 const tagged=text.match(/!3d(-?\d+\.\d+).*?!4d(-?\d+\.\d+)/);
 const matched=at||tagged||direct;
 if(!matched)return null;
 const latitude=Number(matched[1]),longitude=Number(matched[2]);
 return Number.isFinite(latitude)&&Number.isFinite(longitude)&&Math.abs(latitude)<=90&&Math.abs(longitude)<=180?{latitude,longitude}:null;
}
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
  const [analytics,setAnalytics]=useState<Analytics|null>(null);
  const [analyticsError,setAnalyticsError]=useState('');
  const [analyticsLoading,setAnalyticsLoading]=useState(false);
  const [suggestions,setSuggestions]=useState<Suggestion[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [query, setQuery] = useState('');
  const [locationText,setLocationText]=useState('');
  const [locationHelp,setLocationHelp]=useState('');
  const [locationExpanded,setLocationExpanded]=useState(false);
  const [streetHints,setStreetHints]=useState<Record<string,{street:string;distanceMeters:number}>>({});
  const [nameOptions,setNameOptions]=useState<Record<string,string[]>>({});
  const [qualityFilter,setQualityFilter]=useState(false);
  const [archiveConfirm,setArchiveConfirm]=useState(false);
  async function loadAnalytics(){
    const initData=telegram()?.initData;
    if(!initData)return;
    setAnalyticsLoading(true);setAnalyticsError('');
    try{
      const response=await fetch('/api/admin?analytics=1',{headers:{'X-Telegram-Init-Data':initData},cache:'no-store'});
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.analytics)throw new Error(result?.error||'Статистика пока недоступна');
      setAnalytics(result.analytics as Analytics);
    }catch(e){setAnalyticsError(e instanceof Error?e.message:'Ошибка статистики')}
    finally{setAnalyticsLoading(false)}
  }
  async function refresh() {
    setLoading(true); setError('');
    try { const data = await request('GET'); setPlaces(data.places);setSuggestions(data.suggestions||[]); }
    catch (e) { setError(e instanceof Error ? e.message : 'Ошибка загрузки'); }
    finally { setLoading(false); }
  }
  useEffect(() => { initTelegram(); if (telegram()?.initData) { void refresh(); void loadAnalytics(); } else { setLoading(false); } }, []);
  useEffect(()=>{const controller=new AbortController();fetch('/osm-location-hints.json',{signal:controller.signal}).then(r=>r.ok?r.json():null).then(d=>{if(d?.suggestions)setStreetHints(d.suggestions);if(d?.nameOptions)setNameOptions(d.nameOptions)}).catch(()=>{});return()=>controller.abort()},[]);
  function edit(place: Place) {
    setSelected(place.id);setArchiveConfirm(false);
    setLocationText('');setLocationHelp('');
    setForm({ name: place.name, district: place.district, address: place.address, category: place.category, active: place.active, latitude: place.latitude, longitude: place.longitude });
    setNotice(''); setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function create() { setArchiveConfirm(false);setLocationText('');setLocationHelp('');setSelected(null); setForm({ ...blank }); setNotice(''); setError(''); }
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
  async function moderate(suggestion:Suggestion,action:'approve'|'reject'){
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('PATCH',{suggestionAction:action,suggestionId:suggestion.id});
      await refresh();
      setNotice(action==='approve'?'Заведение добавлено в каталог. Проверь координаты в списке ниже.':'Предложение отклонено.');
    }catch(e){setError(e instanceof Error?e.message:'Ошибка проверки');}
    finally{setBusy(false)}
  }
  async function setPlaceArchived(archive:boolean){
    if(!selected||busy)return;
    setBusy(true);setError('');setNotice('');
    try{
      await request('PATCH',{placeAction:archive?'archive':'restore',id:selected});
      setForm(old=>({...old,active:!archive}));
      setArchiveConfirm(false);
      await refresh();
      setNotice(archive?'Заведение скрыто с карты. Его можно восстановить в любое время.':'Заведение снова опубликовано.');
    }catch(e){setError(e instanceof Error?e.message:'Не удалось изменить публикацию.');}
    finally{setBusy(false)}
  }
  const telegramAuthorized = Boolean(telegram()?.initData);
  const missingAddress=(p:Place)=>!p.address||p.address==='Адрес не указан в OpenStreetMap'||/^\d+[a-zа-я]?\/?\d*$/i.test(p.address.trim());
  const missingCount=places.filter(missingAddress).length;
  const filtered = places.filter(p => (!qualityFilter||missingAddress(p)||Boolean(p.source_id&&nameOptions[p.source_id]?.length))&&[p.name, p.district, p.address].some(v => v.toLowerCase().includes(query.toLowerCase())));
  const alternatives=selected?nameOptions[places.find(p=>p.id===selected)?.source_id||'']||[]:[];
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
      {telegramAuthorized&&<section className="admin-analytics">
        <div className="admin-analytics-head"><div><span className="eyebrow">BOR / АНАЛИТИКА</span><h2>Посетители приложения</h2></div><button type="button" className="admin-analytics-refresh" disabled={analyticsLoading} onClick={()=>void loadAnalytics()}><ArrowClockwise size={16}/> Обновить</button></div>
        <p className="admin-analytics-note">Учёт начинается после подключения аналитики. Учитываются открытия BOR внутри Telegram, без администратора. Данные не являются статистикой подписчиков бота.</p>
        {analyticsError&&<p className="admin-analytics-error" role="alert">{analyticsError}</p>}
        <div className="admin-analytics-grid">
          {([['Уникальные посетители',analytics?.totalUsers],['Открытия приложения',analytics?.totalOpens],['Посетители сегодня',analytics?.todayUsers],['За последние 7 дней',analytics?.weekUsers],['Вернулись повторно',analytics?.returningUsers]] as const).map(([label,value])=><div className="admin-analytics-metric" key={label}><strong>{analytics?Number(value||0).toLocaleString('ru-RU'):analyticsLoading?'…':'—'}</strong><span>{label}</span></div>)}
        </div>
        {analytics?.daily&&<div className="admin-analytics-trend"><h3>Уникальные посетители по дням</h3><div className="admin-analytics-bars">{analytics.daily.map(day=><div key={day.date} className="admin-analytics-day"><span>{day.users}</span><div className="admin-analytics-track"><div style={{height:Math.max(3,Math.round(100*day.users/Math.max(1,...analytics.daily.map(d=>d.users))))+'%'}}/></div><small>{day.date.slice(5)}</small></div>)}</div></div>}
      </section>}
      {telegramAuthorized&&<section className="admin-suggestions"><div className="admin-suggestions-heading"><h2>Предложения пользователей</h2><span>{suggestions.length} ожидают</span></div>{suggestions.length===0?<p className="admin-muted">Пока нет предложений на проверку.</p>:suggestions.map(item=><div className="admin-suggestion" key={item.id}><strong>{item.name}</strong><span>{item.district} · {item.category==='restaurant'?'Ресторан':item.category==='cafe'?'Кафе':item.category==='coffee'?'Кофейня':'Рабочее пространство'}</span><p>{item.address}</p><div className="admin-suggestion-actions"><button type="button" disabled={busy} onClick={()=>void moderate(item,'reject')}>Отклонить</button><button type="button" disabled={busy} onClick={()=>void moderate(item,'approve')}>Добавить в каталог</button></div></div>)}</section>}
      <form className="admin-form" onSubmit={save}>
        <div className="admin-form-title"><h2>{selected ? 'Редактировать место' : 'Новое заведение'}</h2>{selected && <button type="button" className="admin-textbutton" onClick={create}><Plus size={16}/> Новое</button>}</div>
        <label>Название<input required minLength={2} maxLength={120} value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} placeholder="Например, название кофейни"/></label>
        {selected&&alternatives.length>0&&<div className="admin-name-options"><strong>Другие названия из OpenStreetMap</strong><p>Это варианты из картографических тегов, не подтверждённые официальные переименования. Выбери подходящий, затем сохрани.</p>{alternatives.map(n=><button type="button" key={n} onClick={()=>setForm(f=>({...f,name:n}))}>{n}</button>)}</div>}
        <label>Район<input required minLength={2} maxLength={80} value={form.district} onChange={e => setForm(f => ({...f, district: e.target.value}))} placeholder="Например, Юнусабад"/></label>
        <label>Адрес<input required minLength={5} maxLength={240} value={form.address} onChange={e => setForm(f => ({...f, address: e.target.value}))} placeholder="Улица, дом, ориентир"/></label>
        <div className="admin-two">
          <label>Категория<select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value as Form['category']}))}><option value="coffee">Кофейня</option><option value="cafe">Кафе</option><option value="restaurant">Ресторан</option><option value="workspace">Рабочее пространство</option></select></label>
          <label>Публикация<select value={form.active ? 'yes':'no'} onChange={e => setForm(f => ({...f, active: e.target.value === 'yes'}))}><option value="yes">Активно</option><option value="no">Скрыто</option></select></label>
        </div>
        <div className="admin-location-box">
          <div className="admin-location-title"><strong>Местоположение</strong><span>Необязательно</span></div>
          <p>Самый простой способ — коснись нужной точки на карте. Или вставь координаты через запятую / полную ссылку Google Maps.</p>
          <label className="admin-location-paste">Ссылка или координаты
            <input type="text" autoComplete="off" placeholder="41.311081, 69.240562" value={locationText} onChange={e=>{const value=e.target.value;setLocationText(value);const p=readLocation(value);if(p){setForm(f=>({...f,...p}));setLocationHelp('Координаты определены — проверь точку на карте.')}else if(value.trim())setLocationHelp('Вставь две координаты через запятую или полную ссылку с координатами. Короткие ссылки maps.app.goo.gl не содержат координаты.');else setLocationHelp('')}}/>
          </label>
          {locationHelp&&<p className="admin-location-help">{locationHelp}</p>}
          <button className="admin-textbutton admin-map-toggle" type="button" onClick={()=>setLocationExpanded(v=>!v)}>{locationExpanded?'Свернуть карту':'Указать точку на карте'}</button>
          {locationExpanded&&<><VenueMap compact picked={form.latitude!==null&&form.longitude!==null?{latitude:form.latitude,longitude:form.longitude}:null} onPick={(latitude,longitude)=>{setForm(f=>({...f,latitude:Number(latitude.toFixed(6)),longitude:Number(longitude.toFixed(6))}));setLocationHelp('Точка выбрана. Проверь, что это вход в заведение.')}}/><p>Нажми на нужное здание или вход — координаты сохранятся в форму.</p></>}
          {form.latitude!==null&&form.longitude!==null&&<div className="admin-location-coords"><span>{form.latitude.toFixed(6)}, {form.longitude.toFixed(6)}</span><button type="button" onClick={()=>{setForm(f=>({...f,latitude:null,longitude:null}));setLocationText('');setLocationHelp('')}}>Очистить</button></div>}
        </div>
        {error && <div className="admin-message admin-error" role="alert"><WarningCircle size={19}/>{error}</div>}
        {notice && <div className="admin-message admin-success" role="status"><CheckCircle size={19}/>{notice}</div>}
        <button className="primary" disabled={busy || loading || !telegramAuthorized} type="submit"><FloppyDisk size={19}/> {busy ? 'Сохраняем…' : selected ? 'Сохранить изменения' : 'Добавить заведение'}</button>
        {selected&&<div className="admin-archive">
          {!archiveConfirm&&<button type="button" disabled={busy||loading} className={form.active?'admin-archive-toggle':'admin-restore-toggle'} onClick={()=>form.active?setArchiveConfirm(true):void setPlaceArchived(false)}>{form.active?'Убрать заведение с карты':'Восстановить на карте'}</button>}
          {archiveConfirm&&<div className="admin-archive-warning" role="group" aria-label="Подтверждение скрытия"><strong>Скрыть это заведение?</strong><p>Оно исчезнет из публичной карты. Отчёты останутся в базе, а заведение можно будет восстановить.</p><div><button type="button" disabled={busy} onClick={()=>setArchiveConfirm(false)}>Отмена</button><button type="button" disabled={busy} onClick={()=>void setPlaceArchived(true)}>Да, убрать</button></div></div>}
        </div>}
      </form>
      <div className="admin-list-heading"><h2>Все заведения <span>{places.length}</span></h2><button type="button" className="icon-btn refresh" aria-label="Обновить список" onClick={() => void refresh()}><ArrowClockwise size={20}/></button></div>
      <div className="admin-quality-summary"><span>Без точного адреса: <strong>{missingCount}</strong> из {places.length}</span><button type="button" aria-pressed={qualityFilter} className={qualityFilter?'active':''} onClick={()=>setQualityFilter(v=>!v)}>{qualityFilter?'Все заведения':'Показать для проверки'}</button></div>
      <input className="admin-search" placeholder="Поиск по названию, району, адресу" value={query} onChange={e=>setQuery(e.target.value)} aria-label="Поиск заведений"/>
      {loading ? <div className="admin-muted">Загружаем данные…</div> : filtered.length ? <div className="admin-rows">{filtered.map(p => <button key={p.id} type="button" className={'admin-row ' + (selected===p.id?'admin-row-selected':'')} onClick={()=>edit(p)}><span className="admin-row-icon"><Buildings size={21}/></span><span className="admin-row-info"><strong>{p.name}</strong><small>{p.district} · {missingAddress(p)?p.source_id&&streetHints[p.source_id]?'Ориентир: '+streetHints[p.source_id].street+' (адрес не подтверждён)':'Адрес уточняется':p.address}</small></span><span className={p.active?'admin-pill':'admin-pill admin-pill-off'}>{p.active?'Активно':'Скрыто'}</span></button>)}</div> : <div className="empty"><Buildings size={28}/><h3>{places.length ? 'Ничего не найдено' : 'Пока нет заведений'}</h3><p>{places.length ? 'Попробуй другой запрос.' : 'Добавь первое проверенное место через форму выше.'}</p></div>}
      <p className="footnote">Админ-доступ определяется на сервере по подписанным данным Telegram. Скрытые места не отображаются в публичном каталоге.</p>
    </main>
  </div>;
}
