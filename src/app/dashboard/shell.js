"use client";

import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase-browser";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: "◉" },
  { label: "Invoices", href: "/dashboard/invoices", icon: "◫", disabled: true },
  { label: "Vendors", href: "/dashboard/vendors", icon: "◈", disabled: true },
  { label: "Rules", href: "/dashboard/rules", icon: "⚙", disabled: true },
  { label: "Audit Log", href: "/dashboard/audit", icon: "◷", disabled: true },
];

export default function DashboardShell({ user, tenantId, role, children }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-56 bg-stone-900 flex flex-col shrink-0">
        {/* Brand */}
        <div className="px-5 py-5 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-white rounded-md flex items-center justify-center">
              <span className="text-stone-900 font-bold text-xs">E</span>
            </div>
            <span className="text-white font-semibold text-sm tracking-tight">
              Embed ACA
            </span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <button
                key={item.href}
                onClick={() => !item.disabled && router.push(item.href)}
                disabled={item.disabled}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors text-left
                  ${
                    isActive
                      ? "bg-stone-800 text-white"
                      : item.disabled
                      ? "text-stone-600 cursor-not-allowed"
                      : "text-stone-400 hover:text-stone-200 hover:bg-stone-800/50"
                  }`}
              >
                <span className="text-xs w-4 text-center">{item.icon}</span>
                <span>{item.label}</span>
                {item.disabled && (
                  <span className="ml-auto text-[10px] text-stone-600 uppercase tracking-wider">
                    Soon
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User / Logout */}
        <div className="px-3 py-4 border-t border-stone-800">
          <div className="px-3 mb-3">
            <p className="text-xs text-stone-500 truncate">{user.email}</p>
            <p className="text-[10px] text-stone-600 uppercase tracking-wider mt-0.5">
              {role || "user"}
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-stone-500 hover:text-stone-300
                       hover:bg-stone-800/50 rounded-lg transition-colors text-left"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-stone-50">
        {children}
      </main>
    </div>
  );
}
