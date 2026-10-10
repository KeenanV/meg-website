import {useCallback, useEffect, useState} from 'react';
import {useClient, useSource} from 'sanity';

type Plan = {labels: Record<string, string>; add: string[]; update: string[]; remove: string[]; retained: string[]; unchanged: string[]; conflicts: {id: string; reason: string}[]};
type Run = {id: string; mode: 'update' | 'reset'; status: string; message: string; plan?: Plan};
const endpoint = 'https://megvandeusen-staging.web.app/api/studio/sync';
const pending = new Set(['queued', 'queued-apply', 'planning', 'applying', 'copied']);

export function StagingSyncTool() {
  const client = useClient({apiVersion: '2025-10-26'});
  const source = useSource();
  const [token, setToken] = useState(client.config().token || '');
  const [run, setRun] = useState<Run | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [confirmation, setConfirmation] = useState('');
  const [id, setId] = useState(() => typeof sessionStorage === 'undefined' ? '' : sessionStorage.getItem('meg-studio-sync') || '');
  useEffect(() => {
    const subscription = source.auth.token?.subscribe(value => setToken(value || ''));
    return () => subscription?.unsubscribe();
  }, [source.auth]);
  const api = useCallback(async (path: string, body: object) => {
    if (!token) throw new Error('Sign in to Studio first.');
    const response = await fetch(endpoint + path, {method: 'POST', credentials: 'omit',
      headers: {'Content-Type': 'application/json', 'X-Sanity-Token': token}, body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000)});
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to contact the sync service.');
    return result;
  }, [token]);
  useEffect(() => {
    if (!id || !token) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const result: Run = await api('/status', {id});
        if (stopped) return;
        setRun(result); setError('');
        if (pending.has(result.status)) timer = setTimeout(poll, 5000);
      } catch (e) {if (!stopped) setError(e instanceof Error ? e.message : 'Cannot read sync status.');}
    }
    void poll();
    return () => {stopped = true; clearTimeout(timer);};
  }, [id, token, api, busy, refresh]);
  async function start(mode: 'update' | 'reset') {
    setBusy(true); setError(''); setConfirmation('');
    try {
      const result = await api('/plan', {mode});
      sessionStorage.setItem('meg-studio-sync', result.id); setId(result.id);
      setRun({id: result.id, mode, status: 'queued', message: 'Preparing a change summary…'});
    } catch (e) {setError(e instanceof Error ? e.message : 'Unable to prepare sync.');}
    finally {setBusy(false);}
  }
  async function apply() {
    if (!run) return;
    setBusy(true); setError('');
    try {await api('/apply', {id: run.id, confirmation}); setRun({...run, status: 'queued-apply', message: 'Starting the reviewed copy…'});}
    catch (e) {setError(e instanceof Error ? e.message : 'Unable to start sync.');}
    finally {setBusy(false);}
  }
  const locked = busy || !token || !!run && pending.has(run.status);
  const phrase = run?.mode === 'reset' ? 'RESET STAGING' : 'UPDATE STAGING';
  return <main className="studio-sync-tool" style={{padding: 32, maxWidth: 900, margin: '0 auto', overflowY: 'auto', height: '100%', boxSizing: 'border-box'}}>
    <style>{`.studio-sync-tool {line-height:1.6} .studio-sync-tool h1 {font-size:2rem;font-weight:650;margin:0 0 16px} .studio-sync-tool h2 {font-size:1.35rem;font-weight:650;margin:0 0 12px} .studio-sync-tool p {margin:12px 0} .studio-sync-tool button {padding:12px 18px;border:1px solid #80808070;border-radius:7px;background:#345be7;color:white;font:inherit;font-weight:600;cursor:pointer} .studio-sync-tool button:disabled {opacity:.5;cursor:default} .studio-sync-tool button:focus-visible,.studio-sync-tool input:focus-visible {outline:2px solid #5787ff;outline-offset:3px} .studio-sync-tool input {font:inherit;border:1px solid #80808080;border-radius:6px;color:inherit;background:transparent} .studio-sync-tool details {margin:12px 0} .studio-sync-tool summary {cursor:pointer;font-weight:600} .studio-sync-tool ul {padding-left:24px;list-style:disc} .studio-sync-tool [role=alert] {color:#e66d72}`}</style>
    <h1>Refresh staging</h1>
    <p>Copy published production content into the private staging site. Production is never changed.</p>
    <p>Images and protected recordings are included. Production drafts, passwords, and environment settings are not copied.</p>
    <div style={{display: 'flex', gap: 16, flexWrap: 'wrap', margin: '24px 0'}}>
      <button type="button" disabled={locked} onClick={() => void start('update')}>Review update from production</button>
      <button type="button" disabled={locked} onClick={() => void start('reset')}>Review complete reset</button>
    </div>
    <p><strong>Update</strong> preserves staging-only experiments and stops on conflicts. <strong>Reset</strong> removes staging-only content and drafts to match published production content.</p>
    <p>A private backup is made before either action changes content. Staging may briefly be unavailable while the copy runs.</p>
    {error && <p role="alert">{error} {id && <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh status</button>}</p>}
    {run && <section aria-label="Sync status" style={{border: '1px solid #80808060', borderRadius: 8, padding: 20, marginTop: 24}}>
      <h2>{run.mode === 'reset' ? 'Reset staging content' : 'Update staging content'}</h2>
      <p role="status" aria-live="polite">{run.message}</p>
      {run.plan && <>
        <p>{run.plan.add.length} added · {run.plan.update.length} replaced · {run.plan.remove.length} removed · {run.plan.retained.length} staging-only items retained · {run.plan.conflicts.length} conflicts</p>
        {(['add', 'update', 'remove', 'retained'] as const).map(key => run.plan![key].length > 0 && <details key={key}>
          <summary>{key === 'remove' ? 'Items to remove (including drafts)' : key === 'update' ? 'Items to replace' : key === 'add' ? 'Items to add' : 'Items kept only in staging'}</summary>
          <ul>{run.plan![key].map(value => <li key={value}>{run.plan!.labels?.[value] || value}{value.startsWith('drafts.') ? ' (unpublished draft)' : ''}</li>)}</ul>
        </details>)}
        {!!run.plan.conflicts.length && <ul>{run.plan.conflicts.map(item => <li key={item.id}>{run.plan!.labels?.[item.id] || item.id}: {item.reason}</li>)}</ul>}
        {run.status === 'review' && !run.plan.conflicts.length && <div style={{marginTop: 24}}>
          <label>Type <strong>{phrase}</strong> to confirm this reviewed copy.
            <input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" style={{display: 'block', margin: '12px 0', padding: 10}} />
          </label>
          <button type="button" disabled={busy || confirmation !== phrase} onClick={() => void apply()}>Back up and {run.mode === 'reset' ? 'reset' : 'update'} staging</button>
        </div>}
      </>}
      <p style={{fontSize: 12}}>Operation: {run.id}</p>
    </section>}
  </main>;
}
