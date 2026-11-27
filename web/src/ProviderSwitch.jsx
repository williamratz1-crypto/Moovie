import { useEffect, useRef, useState } from 'react';

/**
 * Player header control: shows the active server and lets the user switch.
 *
 * Kept as a small popover rather than an inline segmented control so the
 * active server is readable at a glance (`SERVER: VIDFAST`) and there is one
 * clearly labelled button — "Switch Provider" — instead of two peer buttons
 * whose current state has to be inferred.
 *
 * Escape is handled in the capture phase and stopped there, so dismissing the
 * menu does not also close the player (App.jsx listens on window in the bubble
 * phase). The control stays usable when the stream itself fails, because the
 * load-failure notice only covers the frame area, never the header.
 */
export function ProviderSwitch({ value, label, options, onChange }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const triggerRef = useRef(null);
  const activeItemRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    activeItemRef.current?.focus();

    function handlePointerDown(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [open]);

  function choose(providerId) {
    setOpen(false);
    triggerRef.current?.focus();
    if (providerId !== value) onChange(providerId);
  }

  return (
    <div className="player-provider-control" ref={wrapRef}>
      <span className="player-provider-current">
        SERVER: <strong>{String(label).toUpperCase()}</strong>
      </span>
      <button
        ref={triggerRef}
        type="button"
        className="player-provider-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        Switch Provider
      </button>

      {open && (
        <div className="player-provider-menu" role="menu" aria-label="Choose a player">
          {options.map((option) => {
            const active = option.id === value;
            return (
              <button
                key={option.id}
                ref={active ? activeItemRef : undefined}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                className={active ? 'is-active' : ''}
                onClick={() => choose(option.id)}
              >
                <span>{option.label}</span>
                {active && <span className="player-provider-tick" aria-hidden="true">ACTIVE</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
