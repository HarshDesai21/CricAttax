"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase/client";

type CheckState = { status: "loading" | "ok" | "error"; detail: string };

export default function Home() {
  const [anonCheck, setAnonCheck] = useState<CheckState>({
    status: "loading",
    detail: "",
  });
  const [serverCheck, setServerCheck] = useState<CheckState>({
    status: "loading",
    detail: "",
  });

  useEffect(() => {
    // 1. Anon-key read straight from the browser, gated by the RLS policy
    //    "anon read players" in supabase/schema.sql.
    supabase
      .from("players")
      .select("*", { count: "exact", head: true })
      .then(({ count, error }) => {
        if (error) {
          setAnonCheck({ status: "error", detail: error.message });
        } else {
          setAnonCheck({
            status: "ok",
            detail: `${count ?? 0} players readable via anon key + RLS`,
          });
        }
      });

    // 2. Server-side read via /api/health, using the service_role key.
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        if (!data.ok) {
          setServerCheck({ status: "error", detail: data.error });
        } else {
          setServerCheck({
            status: "ok",
            detail: `${data.playerCount} players readable via service_role key`,
          });
        }
      })
      .catch((err) => setServerCheck({ status: "error", detail: String(err) }));
  }, []);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 bg-[#0c2620] px-6 py-20 text-[#f2d879]">
      <div className="text-center">
        <h1 className="font-serif text-4xl tracking-wide text-[#f2d879]">
          Cricattax
        </h1>
        <p className="mt-2 text-sm text-[#cdd3db]">
          Pipeline check: Next.js -&gt; Vercel -&gt; Supabase
        </p>
      </div>

      <div className="w-full max-w-md space-y-4">
        <CheckRow
          label="Browser -> Supabase (anon key + RLS)"
          check={anonCheck}
        />
        <CheckRow
          label="Server -> Supabase (service role key)"
          check={serverCheck}
        />
      </div>

      <p className="max-w-md text-center text-xs text-[#cdd3db]/70">
        Once both rows say OK, the schema is loaded, the players table is
        seeded, and your env vars are wired up correctly end to end. This
        page gets replaced by the real lobby flow next.
      </p>
    </div>
  );
}

function CheckRow({ label, check }: { label: string; check: CheckState }) {
  const color =
    check.status === "ok"
      ? "text-green-400 border-green-400/40"
      : check.status === "error"
        ? "text-red-400 border-red-400/40"
        : "text-[#cdd3db] border-[#cdd3db]/30";

  const icon =
    check.status === "ok" ? "OK" : check.status === "error" ? "FAIL" : "...";

  return (
    <div className={`rounded border bg-black/20 p-4 ${color}`}>
      <div className="flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span>{icon}</span>
      </div>
      {check.detail && (
        <p className="mt-1 text-xs opacity-80">{check.detail}</p>
      )}
    </div>
  );
}
