export default function GlobalLoading() {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-linear-to-br from-white via-white to-zinc-50" />
      <div className="pointer-events-none absolute -top-24 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 left-1/3 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl" />

      <div className="relative flex w-[min(380px,calc(100vw-48px))] flex-col items-center gap-4 rounded-3xl border border-zinc-200 bg-white/80 px-6 py-6 shadow-[0_28px_90px_rgba(0,0,0,0.12)] backdrop-blur">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full bg-linear-to-tr from-blue-600 via-sky-500 to-violet-500 opacity-90" />
          <div className="absolute inset-[3px] rounded-full bg-white" />
          <div className="absolute inset-0 animate-spin rounded-full [mask:radial-gradient(transparent_52%,black_54%)] bg-linear-to-tr from-blue-600 via-sky-500 to-violet-500" />
        </div>

        <div className="text-center">
          <div className="text-sm font-extrabold tracking-tight text-zinc-900">A carregar o Nexus…</div>
          <div className="mt-1 text-xs font-semibold text-zinc-500">Estamos a preparar o dashboard.</div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 animate-bounce rounded-full bg-blue-600" style={{ animationDelay: "0ms" }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-sky-500" style={{ animationDelay: "120ms" }} />
          <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500" style={{ animationDelay: "240ms" }} />
        </div>

        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-full animate-pulse rounded-full bg-linear-to-r from-blue-600/10 via-blue-600/25 to-violet-600/10" />
        </div>
      </div>
    </div>
  );
}


