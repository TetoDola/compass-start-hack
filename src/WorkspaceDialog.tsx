import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
export function WorkspaceDialog({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null), titleId=useId();
  useEffect(()=>{const d=ref.current; if(open && !d?.open)d?.showModal();else if(!open && d?.open)d.close();},[open]);
  return <dialog ref={ref} className={`workspace-dialog ${wide?'workspace-dialog--wide':''}`} aria-labelledby={titleId} onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{if(e.target===e.currentTarget)onClose();}}><div className="workspace-dialog-body"><header><div><span className="ws-kicker">Client workspace</span><h2 id={titleId}>{title}</h2></div><button className="ws-icon" aria-label={`Close ${title}`} onClick={onClose} autoFocus><X size={20}/></button></header><div className="workspace-dialog-content">{children}</div></div></dialog>;
}
