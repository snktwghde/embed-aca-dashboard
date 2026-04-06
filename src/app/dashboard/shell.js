"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@/lib/supabase-browser";

export default function Shell({ children, user, tenantId, role }) {
  const router = useRouter();
  const pathname = usePathname();
  const [signingOut, setSigningOut] = useState(false);

  const supabase = createBrowserClient();

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.push("/login");
  };

  const nav = [
    { label: "Overview", href: "/dashboard", icon: "📊" },
    { label: "Invoices", href: "/dashboard/invoices", icon: "📄" },
    { label: "Vendors", href: "/dashboard/vendors", icon: "🏢", soon: true },
    { label: "Rules", href: "/dashboard/rules", icon: "⚙️", soon: true },
    { label: "Audit", href: "/dashboard/audit", icon: "📋", soon: true },
  ];

  const isActive = (href) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 text-stone-300 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-6 py-5 border-b border-stone-800">
          <h1 className="text-white text-lg font-semibold tracking-tight">
            Embed ACA
          </h1>
          <p className="text-stone-500 text-xs mt-0.5">
            AP Operations Control
          </p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((item) => {
            const active = isActive(item.href);
            if (item.soon) {
              return (
                <div
                  key={item.label}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-stone-600 cursor-not-allowed"
                >
                  <span className="text-sm">{item.icon}</span>
                  <span className="text-sm">{item.label}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-stone-700 bg-stone-800 px-1.5 py-0.5 rounded">
                    Soon
                  </span>
                </div>
              );
            }
            return (
              <button
                key={item.label}
                onClick={() => router.push(item.href)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-stone-800 text-white"
                    : "text-stone-400 hover:bg-stone-800/50 hover:text-stone-200"
                }`}
              >
                <span className="text-sm">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User info */}
        <div className="px-4 py-4 border-t border-stone-800">
          <p className="text-xs text-stone-500 truncate">{user}</p>
          <p className="text-[10px] uppercase tracking-wider text-stone-600 mt-0.5">
            {role || "user"}
          </p>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="mt-3 w-full text-xs text-stone-500 hover:text-stone-300 transition-colors text-left"
          >
            {signingOut ? "Signing out..." : "Sign out →"}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto bg-stone-50">
        {children}
      </main>
    </div>
  );
}