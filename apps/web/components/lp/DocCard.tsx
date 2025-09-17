interface DocCardProps {
  name: string;
  description?: string;
  href: string;
  meta?: string;
}

export function DocCard({ name, description, href, meta }: DocCardProps) {
  return (
    <a
      href={href}
      className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm text-blue-700 transition hover:border-blue-400 hover:bg-blue-50"
    >
      <div>
        <p className="font-medium text-slate-900">{name}</p>
        {description ? <p className="text-xs text-slate-500">{description}</p> : null}
        {meta ? <p className="text-[11px] text-slate-400">{meta}</p> : null}
      </div>
      <span className="text-xs font-semibold uppercase tracking-wide text-blue-600">Download</span>
    </a>
  );
}
