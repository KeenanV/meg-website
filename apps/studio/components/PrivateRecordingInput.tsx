import {useEffect, useState} from 'react';
import {set, unset, useClient, useSource, type ObjectInputProps} from 'sanity';

type Recording = {_type?: string; objectKey?: string; generation?: string; size?: number};
const endpoint = 'https://megvandeusen-staging.web.app/api/studio/uploads';

export function PrivateRecordingInput(props: ObjectInputProps<Recording>) {
  const client = useClient({apiVersion: '2025-10-26'});
  const source = useSource();
  const [token, setToken] = useState<string | null>(client.config().token || null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const staging = client.config().dataset === 'staging';
  useEffect(() => {
    const subscription = source.auth.token?.subscribe(value => setToken(value));
    return () => subscription?.unsubscribe();
  }, [source.auth]);
  async function upload(file: File) {
    if (!staging || !token) {setMessage('Sign in to staging Studio to upload privately.'); return;}
    if (!file.name.toLowerCase().endsWith('.mp3') || file.size < 4 || file.size > 100 * 1024 * 1024) {
      setMessage('Choose an MP3 smaller than 100 MB.'); return;
    }
    setBusy(true); setMessage('Uploading privately…');
    async function api(route: string, body: object) {
      const response = await fetch(endpoint + route, {method: 'POST', credentials: 'omit',
        headers: {'Content-Type': 'application/json', 'X-Sanity-Token': token!},
        body: JSON.stringify({dataset: 'staging', ...body}), signal: AbortSignal.timeout(30_000)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Private upload failed.');
      return result;
    }
    try {
      const started = await api('/start', {size: file.size, contentType: 'audio/mpeg'});
      const target = new URL(started.url);
      if (target.protocol !== 'https:' || !['storage.googleapis.com', 'megvandeusen-staging-resources.storage.googleapis.com'].includes(target.hostname)) {
        throw new Error('Unexpected upload destination.');
      }
      const form = new FormData();
      for (const [key, value] of Object.entries(started.fields)) form.append(key, String(value));
      form.append('file', file);
      // Never send the Sanity token or cookies to the storage upload URL.
      const response = await fetch(target, {method: 'POST', credentials: 'omit', body: form, signal: AbortSignal.timeout(180_000)});
      if (!response.ok) throw new Error('The private storage upload failed. Please try again.');
      const recording = await api('/finish', {id: started.id});
      props.onChange(set({...recording, _type: props.schemaType.name}));
      setMessage('Private upload complete. Publish this recording when it is ready.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Private upload failed.');
    } finally {setBusy(false);}
  }
  return <div style={{padding: 16, border: '1px solid #80808060', borderRadius: 6}}>
    <p>Stored in private staging storage. Only the file reference is saved in Sanity.</p>
    {props.value?.objectKey && <p>MP3 attached · {((props.value.size || 0) / 1024 / 1024).toFixed(1)} MB</p>}
    <label>
      {props.value?.objectKey ? 'Replace MP3' : 'Choose MP3'}
      <input type="file" accept="audio/mpeg,.mp3" disabled={!staging || props.readOnly || busy || !token}
        onChange={event => {const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void upload(file);}} />
    </label>
    {props.value && <button type="button" disabled={props.readOnly || busy || !staging} onClick={() => props.onChange(unset())}>Remove attachment</button>}
    <p role="status">{message || (!staging ? 'Private uploads will be enabled in production after staging review.' : !token ? 'Sign in again if the upload control remains disabled.' : '')}</p>
  </div>;
}
