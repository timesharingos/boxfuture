import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cls, centsToInput, parseYuan } from "../lib/format";

// ---------------------------------------------------------------------------
// toast
// ---------------------------------------------------------------------------

export type ToastTone = "info" | "error" | "success";
interface ToastMsg {
  id: number;
  text: string;
  tone: ToastTone;
}
let seq = 0;
const listeners = new Set<(t: ToastMsg) => void>();

export function toast(text: string, tone: ToastTone = "info") {
  const msg: ToastMsg = { id: ++seq, text, tone };
  listeners.forEach((l) => l(msg));
}

export function Toaster() {
  const [items, setItems] = useState<ToastMsg[]>([]);
  useEffect(() => {
    const fn = (t: ToastMsg) => {
      setItems((prev) => [...prev, t]);
      window.setTimeout(
        () => setItems((prev) => prev.filter((x) => x.id !== t.id)),
        t.tone === "error" ? 7000 : 3500,
      );
    };
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[360px] flex-col gap-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={cls(
            "pointer-events-auto rounded-md border px-3 py-2 text-[13px] shadow-lg backdrop-blur",
            t.tone === "error" && "border-rose-500/40 bg-rose-950/80 text-rose-200",
            t.tone === "success" && "border-emerald-500/40 bg-emerald-950/80 text-emerald-200",
            t.tone === "info" && "border-slate-700 bg-slate-900/90 text-slate-200",
          )}
        >
          {t.text}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// primitives
// ---------------------------------------------------------------------------

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "primary" | "danger" | "warn" | "ghost";
  size?: "sm" | "md";
};

export function Button({ variant = "default", size = "md", className, ...rest }: ButtonProps) {
  return (
    <button
      className={cls(
        "btn",
        variant === "primary" && "btn-primary",
        variant === "danger" && "btn-danger",
        variant === "warn" && "btn-warn",
        variant === "ghost" && "btn-ghost",
        size === "sm" && "btn-sm",
        className,
      )}
      {...rest}
    />
  );
}

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cls("card", className)} {...rest}>
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
  className,
}: {
  label?: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && (
        <label className={cls("label", required && "label-required")}>{label}</label>
      )}
      {children}
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </div>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cls("input", props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={2} {...props} className={cls("input", props.className)} />;
}

export function Select({
  value,
  onChange,
  children,
  className,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      value={value}
      onChange={onChange}
      className={cls("input", className)}
      {...rest}
    >
      {children}
    </select>
  );
}

export function MoneyInput({
  value,
  onChange,
  placeholder,
  className,
  disabled,
}: {
  value: number;
  onChange: (cents: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [text, setText] = useState(() => (value === 0 ? "" : centsToInput(value)));
  const lastValue = useRef(value);
  useEffect(() => {
    if (value !== lastValue.current) {
      lastValue.current = value;
      setText(value === 0 ? "" : centsToInput(value));
    }
  }, [value]);
  return (
    <div className={cls("relative", className)}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-500">
        ¥
      </span>
      <input
        className="input num pl-6"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        placeholder={placeholder ?? "0.00"}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          const cents = parseYuan(v);
          lastValue.current = cents;
          onChange(cents);
        }}
        onBlur={() => {
          const cents = parseYuan(text);
          setText(cents === 0 ? "" : centsToInput(cents));
          onChange(cents);
        }}
      />
    </div>
  );
}

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: "slate" | "sky" | "amber" | "emerald" | "rose" | "violet";
  children: ReactNode;
  className?: string;
}) {
  const tones: Record<string, string> = {
    slate: "bg-slate-700/40 text-slate-300",
    sky: "bg-sky-500/15 text-sky-300",
    amber: "bg-amber-500/15 text-amber-300",
    emerald: "bg-emerald-500/15 text-emerald-300",
    rose: "bg-rose-500/15 text-rose-300",
    violet: "bg-violet-500/15 text-violet-300",
  };
  return <span className={cls("badge", tones[tone], className)}>{children}</span>;
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  width = 560,
}: {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/60 pt-[8vh] backdrop-blur-sm">
      <div
        className="card max-h-[84vh] overflow-hidden shadow-2xl"
        style={{ width }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
          <div className="text-[13px] font-semibold text-slate-200">{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="max-h-[68vh] overflow-auto p-4">{children}</div>
        {footer && (
          <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-2.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <div className="text-[13px] text-slate-400">{title}</div>
      {hint && <div className="text-[12px] text-slate-600">{hint}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "danger" | "ok";
}) {
  return (
    <div className="card card-pad">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div
        className={cls(
          "kpi-value mt-1",
          tone === "danger" && "text-rose-400",
          tone === "ok" && "text-emerald-400",
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-slate-500">{sub}</div>}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-slate-700 bg-slate-950/50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cls(
            "rounded px-2.5 py-1 text-xs transition-colors",
            value === o.value
              ? "bg-slate-700 text-slate-100"
              : "text-slate-400 hover:text-slate-200",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function SectionTitle({
  children,
  right,
}: {
  children: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <div className="section-title">{children}</div>
      {right}
    </div>
  );
}

// ---------------------------------------------------------------------------
// lightweight global bootstrap context
// ---------------------------------------------------------------------------

interface AppCtx {
  bootstrapVersion: number;
  bump: () => void;
}
const Ctx = createContext<AppCtx>({ bootstrapVersion: 0, bump: () => {} });

export function AppProvider({ children }: { children: ReactNode }) {
  const [v, setV] = useState(0);
  const value = useMemo(
    () => ({ bootstrapVersion: v, bump: () => setV((x) => x + 1) }),
    [v],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAppCtx() {
  return useContext(Ctx);
}
