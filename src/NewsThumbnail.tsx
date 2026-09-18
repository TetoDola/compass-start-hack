import { useState } from 'react';
import { Newspaper } from 'lucide-react';
import type { ContextItem } from './lib/briefing';

export function NewsThumbnail({ item }: { item: ContextItem }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return <a className="ws-news-thumbnail" href={item.url} target="_blank" rel="noreferrer" aria-label={`Read: ${item.title}`}>
    {item.imageUrl && item.imageUrl !== failedUrl
      ? <img src={item.imageUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(item.imageUrl)}/>
      : <Newspaper size={25} aria-hidden="true"/>}
  </a>;
}
