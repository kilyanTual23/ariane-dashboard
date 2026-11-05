"use client";

/** Interrupteur marche/arrêt accessible (rôle « switch »). */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-accent" : "bg-surface-3"
      }`}
    >
      <span
        className={`absolute size-4 rounded-full bg-surface shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[1.125rem]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
