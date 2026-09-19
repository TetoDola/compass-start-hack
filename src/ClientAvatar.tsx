import { Building2 } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Row } from './lib/types';
import { clientInitials } from './lib/format';

export function ClientAvatar({ client }: { client: Row }) {
  return <span className={`client-avatar${client.IsClientACompany ? ' client-avatar--company' : ''}`} aria-hidden="true" style={{ '--avatar-hue': Math.abs(Number(client.ClientId) || 0) % 360 } as CSSProperties}>
    {client.IsClientACompany ? <Building2 size={25} strokeWidth={1.6}/> : clientInitials(client)}
  </span>;
}
