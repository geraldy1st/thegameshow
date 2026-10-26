import { useEffect, useRef, type ReactNode } from 'react';
import manifest from '../data/assets-manifest.json';

export /** Modal built on <dialog>: native focus trap, Escape closes, focus returns to the opener. */
function Modal(props: {
  open: boolean;
  onClose: () => void;
  labelId: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (props.open && !d.open) {
      opener.current = document.activeElement;
      d.showModal();
    } else if (!props.open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [props.open]);
  // Unmounted while open (e.g. `{x && <Modal open />}`): close and give focus back (DEF-GS-09).
  useEffect(
    () => () => {
      const d = ref.current;
      if (d?.open) d.close();
      if (opener.current instanceof HTMLElement && opener.current.isConnected)
        opener.current.focus();
    },
    [],
  );
  return (
    <dialog ref={ref} aria-labelledby={props.labelId} onClose={props.onClose}>
      {props.children}
    </dialog>
  );
}

type PortraitId = keyof typeof manifest;

/** Portrait from the lot 2 manifest: light WebP with a JPEG fallback (ASSET-REUSE). */
export function Portrait(props: { id: PortraitId; alt: string; className?: string }) {
  const a = manifest[props.id];
  const base = import.meta.env.BASE_URL;
  return (
    <picture className={props.className}>
      <source type="image/webp" srcSet={base + a.webp} />
      <img
        src={base + a.jpg}
        alt={props.alt}
        width={a.width}
        height={a.height}
        loading="lazy"
        decoding="async"
      />
    </picture>
  );
}
