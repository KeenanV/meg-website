import {useState} from 'react';
import {useClient, useCurrentUser, type DocumentActionComponent} from 'sanity';
import {createPreviewSecret} from '@sanity/preview-url-secret/create-secret';

// A fresh handoff is needed for a separate tab: an embedded preview's
// partitioned cookie intentionally does not travel to another browser context.
export const PreviewDraftAction: DocumentActionComponent = props => {
  const client = useClient({apiVersion: '2025-10-26'});
  const user = useCurrentUser();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const document = props.draft || props.published;
  const dataset = client.config().dataset;
  const paths: Record<string, string> = {siteSettings: '/', about: '/about', linksPage: '/links', book: '/books', meditation: '/resources', blogPost: '/blog', newsItem: '/news'};
  if (!paths[props.type] || !['staging', 'production'].includes(dataset || '')) return null;
  return {
    label: busy ? 'Opening preview…' : 'Open private preview',
    title: 'Open an authenticated draft preview in a separate tab. Nothing is published.',
    group: ['default', 'paneActions'], disabled: busy || !document,
    onHandle: () => {
      const popup = window.open('about:blank', '_blank');
      if (!popup) {setError('Allow popup windows for Studio, or use its Preview tool.'); return;}
      popup.opener = null;
      setBusy(true);
      void (async () => {
        try {
          const {secret} = await createPreviewSecret(client, 'meg-studio-document-preview', window.location.origin, user?.id);
          const origin = `https://editorial-preview-${dataset === 'staging' ? '76495183695' : '348807509213'}.us-west1.run.app`;
          const url = new URL('/api/preview/enable', origin);
          let route = paths[props.type];
          const slug = document?.slug as {current?: string} | undefined;
          if (['blogPost', 'newsItem'].includes(props.type) && slug?.current) route += '/' + encodeURIComponent(slug.current);
          url.searchParams.set('sanity-preview-secret', secret);
          url.searchParams.set('sanity-preview-pathname', route);
          popup.location.replace(url.href);
          props.onComplete();
        } catch {
          popup.close();
          setError('The private preview could not be opened. Please sign in again or retry.');
        } finally {setBusy(false);}
      })();
    },
    dialog: error ? {type: 'dialog', header: 'Preview unavailable', content: error,
      onClose: () => {setError(''); props.onComplete();}} : undefined,
  };
};
