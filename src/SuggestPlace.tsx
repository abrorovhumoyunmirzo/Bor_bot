import {useState} from 'react';
import {ArrowLeft,CheckCircle,Plus} from '@phosphor-icons/react';
import {telegram} from './lib/telegram';
import type {Place} from './lib/types';
const categories:[Place['category'],string][]=[['coffee','Кофейня'],['cafe','Кафе'],['restaurant','Ресторан'],['workspace','Рабочее пространство']];
export function SuggestPlace({onClose}:{onClose:()=>void}){
 const [name,setName]=useState(''),[district,setDistrict]=useState(''),[address,setAddress]=useState('');
 const [category,setCategory]=useState<Place['category']>('cafe');
 const [busy,setBusy]=useState(false),[success,setSuccess]=useState(false),[error,setError]=useState('');
 async function send(e:React.FormEvent){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const initData=telegram()?.initData;
   if(!initData)throw new Error('Открой BOR через Telegram, чтобы предложить заведение.');
   const res=await fetch('/api/suggestions',{method:'POST',headers:{'Content-Type':'application/json','X-Telegram-Init-Data':initData},body:JSON.stringify({name,district,address,category})});
   const data=await res.json().catch(()=>null);
   if(!res.ok)throw new Error(data?.error||'Не удалось отправить предложение.');
   setSuccess(true);
  }catch(e){setError(e instanceof Error?e.message:'Ошибка отправки');}finally{setBusy(false)}
 }
 return <section className="suggest-screen" role="dialog" aria-modal="true" aria-label="Предложить заведение">
  <header className="report-header"><button type="button" className="report-back" onClick={onClose}><ArrowLeft size={19}/> Назад</button><span className="report-header-brand">bor<span>.</span></span></header>
  {success?<div className="suggest-success"><CheckCircle size={44} weight="fill"/><h1>Спасибо!</h1><p>Заведение отправлено на проверку. После одобрения оно появится в BOR.</p><button type="button" className="primary" onClick={onClose}>Вернуться к карте</button></div>:
  <form className="suggest-form" onSubmit={send}><div className="eyebrow">ПОМОГИ РАСШИРИТЬ BOR</div><h1>Знаешь хорошее место?</h1><p>Предложи реальное заведение в Ташкенте. Мы проверим его перед публикацией.</p>
  <label>Название<input required minLength={2} maxLength={120} placeholder="Название заведения" value={name} onChange={e=>setName(e.target.value)}/></label>
  <label>Категория<select value={category} onChange={e=>setCategory(e.target.value as Place['category'])}>{categories.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
  <label>Район<input required minLength={2} maxLength={80} placeholder="Например, Мирабад" value={district} onChange={e=>setDistrict(e.target.value)}/></label>
  <label>Адрес<input required minLength={5} maxLength={240} placeholder="Улица, дом или ориентир" value={address} onChange={e=>setAddress(e.target.value)}/></label>
  {error&&<p className="inline-error" role="alert">{error}</p>}
  <button type="submit" className="primary" disabled={busy}><Plus size={18}/> {busy?'Отправляем…':'Отправить на проверку'}</button>
  <small>Не добавляй выдуманные места. Информация появится публично только после модерации.</small>
  </form>}
 </section>;
}
