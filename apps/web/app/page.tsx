export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-2">
        <div className="mx-auto h-10 w-10 rounded bg-[#2563EB]" />
        <h1 className="text-xl font-semibold">JBV Investment Platform</h1>
        <p className="text-slate-600">Open <a className="text-[#2563EB] underline" href="/admin">/admin</a> to view the Admin grid.</p>
      </div>
    </main>
  );
}

