import Image from "next/image";
import Link from "next/link";
import logo from "@/app/assets/image/logo.png";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white font-sans text-black">
      <header className="fixed inset-x-0 top-0 z-50 h-16 border-b border-gray-200 bg-white/70 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="mx-auto flex h-full max-w-7xl items-center justify-between px-6 lg:px-10">
          <Link href="/" className="flex items-center relative">
            <Image src={logo} alt="Logo" width={78} height={78} priority />
            <span className="absolute top-7 left-14 text-2xl font-semibold tracking-tight text-black">
              exus
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              href="/contact-us"
              className="hidden sm:inline-flex cursor-pointer items-center justify-center rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              Contact us
            </Link>
            <Link
              href="/auth/signin"
              className="inline-flex cursor-pointer items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <main className="min-h-screen pt-16">{children}</main>
    </div>
  );
}

