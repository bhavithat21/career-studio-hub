'use client';
import {useEffect, useState} from 'react';
import {Mail, ShieldCheck, RefreshCw, Unplug, Send, FileText} from 'lucide-react';
import {connectGmail} from '../lib/auth-client';

type Draft = {id:string; to:string; subject:string; body:string; digest:string; status:string; lastError?:string; updatedAt?:string};
type MailSummary = {id:string; subject:string; from:string; date:string};
type GmailData = {connection:{connected:boolean; status:string; email?:string; lastSyncAt?:string; lastError?:string}; messages:MailSummary[]; drafts:Draft[]};
const statusLabel = (status:string) => ({pending:'Ready for review', sending:'Sending', sent:'Sent', unknown:'Check Sent Mail'}[status] || status);

async function request(path:string, body?:unknown) {
  const response = await fetch(path, {method:body ? 'POST':'GET', headers:body ? {'Content-Type':'application/json'}:undefined, body:body ? JSON.stringify(body):undefined});
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'The request could not be completed.');
  return result;
}

export function GmailConnectionPanel() {
  const [data,setData] = useState<GmailData|null>(null);
  const [busy,setBusy] = useState('');
  const [error,setError] = useState('');
  const [consent,setConsent] = useState(false);
  const [draft,setDraft] = useState<Draft|null>(null);
  const [saved,setSaved] = useState(false);
  const [reviewed,setReviewed] = useState(false);
  const connected = !!data?.connection.connected;
  const editable = !!draft && draft.status === 'pending';

  async function load():Promise<GmailData> {
    const value = await request('/api/gmail');
    setData(value);
    return value;
  }
  useEffect(() => {
    let active = true;
    request('/api/gmail').then(value => {if(active) setData(value);}).catch(e => {if(active) setError(e.message);});
    return () => {active = false;};
  }, []);
  async function perform(action:string, fn:()=>Promise<void>) {
    setBusy(action); setError('');
    try {await fn();}
    catch(e) {setError(e instanceof Error ? e.message:'Please try again.');}
    finally {setBusy('');}
  }
  function openDraft(value:Draft) {setDraft(value); setSaved(true); setReviewed(false);}
  function change(key:'to'|'subject'|'body', value:string) {
    if (draft) setDraft({...draft,[key]:value});
    setSaved(false); setReviewed(false);
  }
  async function sendDraft() {
    if (!draft) return;
    const selected = draft;
    // Disable another send even if the browser never receives the delivery result.
    setReviewed(false); setDraft({...selected,status:'sending'});
    try {
      const result = await request('/api/gmail/send',{draftId:selected.id,digest:selected.digest,reviewed:true});
      setDraft(result.draft);
      await load();
    } catch(error) {
      setDraft({...selected,status:'unknown'});
      try {
        const latest = await load();
        const stored = latest.drafts.find(value => value.id === selected.id);
        if (stored) setDraft(stored);
      } catch { /* Preserve the blocked state until the saved result can be read. */ }
      throw error;
    }
  }

  return <div className="connections">
    <section className="panel">
      <div className="section-heading"><div><div className="eyebrow">OPTIONAL CONNECTION</div><h2><Mail size={21}/> Gmail</h2></div><span className="badge">{connected?'Connected':'Not connected'}</span></div>
      <p>Bring application-related email updates into this workspace and prepare follow-ups. You can disconnect at any time.</p>
      <div className="cloud-note"><ShieldCheck size={18}/><span>Your connection belongs to your account. Gmail content is not sent to the resume AI providers.</span></div>
      {error && <p className="connection-error" role="alert">{error}</p>}
      {!data && !error && <p role="status">Checking your connection…</p>}
      {data && !connected && <>
        <label className="check-label"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I want Career Studio Hub to read application-related Gmail messages and send the follow-ups I review and approve.</label>
        <p className="fine">Google’s read permission can access mailbox messages. This app imports application-related sender, subject, and date details. It does not import bodies or attachments, or request permission to delete mail or change mailbox settings.</p>
        <button className="primary" disabled={!consent||!!busy} onClick={()=>perform('connect',async()=>{await connectGmail();})}><Mail size={16}/>{busy==='connect'?'Opening Google…':'Connect Gmail'}</button>
        <p className="fine">Gmail access may be limited to approved test accounts until Google completes verification.</p>
      </>}
      {connected && <>
        <p>Connected to <strong>{data?.connection.email || 'the Google account you signed in with'}</strong>.</p>
        <div className="connection-actions">
          <button className="primary" disabled={!!busy} onClick={()=>perform('sync',async()=>{await request('/api/gmail/sync',{});await load();})}><RefreshCw size={16}/>{busy==='sync'?'Checking messages…':'Check application updates'}</button>
          <button disabled={!!busy} onClick={()=>perform('disconnect',async()=>{const result=await request('/api/gmail/disconnect',{});setDraft(null);setReviewed(false);await load();if(result.revocation==='needs_manual_revocation')setError('Local Gmail access has been removed. Complete revocation in your Google Account connected-app settings.');})}><Unplug size={16}/>Disconnect Gmail</button>
        </div>
        <p className="fine">Disconnecting removes copied mail details and drafts and stops access from this workspace.</p>
      </>}
    </section>
    {connected && <section className="panel">
      <div className="section-heading"><h2>Application conversations</h2><span className="badge">{data?.messages.length||0} updates</span></div>
      <p>Open the original conversation in Gmail before recording an application outcome. A subject line alone does not confirm a rejection or interview.</p>
      {(data?.messages||[]).map(message=><article className="mail-row" key={message.id}>
        <div><strong>{message.subject||'(No subject)'}</strong><p>{message.from||'Sender unavailable'}{message.date && ` · ${new Date(message.date).toLocaleDateString()}`}</p></div>
        <button disabled={!!busy} onClick={()=>perform('draft',async()=>{const result=await request('/api/gmail/drafts',{messageId:message.id});openDraft(result.draft);await load();})}><FileText size={15}/>Draft follow-up</button>
      </article>)}
      {!data?.messages.length && <div className="empty"><Mail size={26}/><h3>No application updates synced yet.</h3><p>Check application updates to import recent matching message details.</p></div>}
    </section>}
    {connected && !!data?.drafts.length && <section className="panel">
      <div className="section-heading"><h2>Your follow-ups</h2><span className="badge">{data.drafts.length} saved</span></div>
      {data.drafts.map(value=><article className="mail-row" key={value.id}><div><strong>{value.subject}</strong><p>{value.to} · {statusLabel(value.status)}</p></div><button disabled={!!busy} onClick={()=>openDraft(value)}>{value.status==='pending'?'Review draft':'View details'}</button></article>)}
    </section>}
    {draft && <section className="panel followup-editor">
      <div className="section-heading"><h2>Review your follow-up</h2><span className="badge">{statusLabel(draft.status)}</span></div>
      {draft.lastError && <p className="connection-error" role="status">{draft.lastError}</p>}
      {['unknown','sending'].includes(draft.status) && <p role="status">Sending again is blocked until delivery is confirmed. Check your Gmail Sent Mail before taking further action.</p>}
      <label>Recipient<input type="email" value={draft.to} disabled={!editable||!!busy} onChange={e=>change('to',e.target.value)}/></label>
      <label>Subject<input value={draft.subject} disabled={!editable||!!busy} onChange={e=>change('subject',e.target.value)}/></label>
      <label>Message<textarea rows={9} value={draft.body} disabled={!editable||!!busy} onChange={e=>change('body',e.target.value)}/></label>
      {editable && <>
        <button disabled={!!busy||saved} onClick={()=>perform('save',async()=>{const result=await request('/api/gmail/drafts',{draftId:draft.id,to:draft.to,subject:draft.subject,body:draft.body});openDraft(result.draft);await load();})}>{saved?'Draft saved':'Save draft'}</button>
        <label className="check-label"><input type="checkbox" checked={reviewed} disabled={!saved||!!busy} onChange={e=>setReviewed(e.target.checked)}/>I reviewed this exact recipient, subject, and message and want to send it.</label>
        <button className="primary" disabled={!!busy||!saved||!reviewed} onClick={()=>perform('send',sendDraft)}><Send size={16}/>Send reviewed follow-up</button>
      </>}
    </section>}
  </div>;
}
