import { useEffect, useRef, type ReactNode } from 'react';
import manifest from '../data/assets-manifest.json';

export /** Modal built on <dialog>: native focus trap, Escape closes, focus returns to the opener. */
function Modal(props: {
  open: boolean;
  onClose: () => void;
  labelId: string;
  /** Lot 3 (GS-V5-17): give the focus to this element (tabIndex -1) once the dialog opens. */
  initialFocusId?: string;
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
      if (props.initialFocusId) document.getElementById(props.initialFocusId)?.focus();
    } else if (!props.open && d.open) {
      d.close();
      if (opener.current instanceof HTMLElement) opener.current.focus();
    }
  }, [props.open, props.initialFocusId]);
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

/**
 * Pending-quest dot (patch 0.4.2 point 2, D7, D8, R-P42-9): static, no number, no animation,
 * decoration only. The information is a description: the owner sets
 * `aria-describedby={DESC_TODO}` (or DESC_ROW_TODO) in the same render as the dot, so both
 * appear and disappear together, without any live announcement (R-P42-7). The description
 * texts are hidden elements outside the owners, so the accessible names stay exact.
 */
export const DESC_TODO = 'desc-quest-todo';
export const DESC_ROW_TODO = 'desc-quest-row-todo';
export function Dot() {
  return <span className="dot" aria-hidden="true" />;
}
export function DotDescription({ id, label }: { id: string; label: string }) {
  return (
    <span id={id} hidden>
      {label}
    </span>
  );
}
