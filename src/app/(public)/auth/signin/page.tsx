"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import backgroundImage from "@/app/assets/image/unsplash.png";
import backgroundImageLeft from "@/app/assets/image/degrade.png";
import { getSupabaseBrowserClient } from "@/shared/lib/supabase/browser";

const signInSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
  terms: z.boolean().optional(),
  remember: z.boolean().optional(),
});

type SignInFormData = z.infer<typeof signInSchema>;

export default function SignInPage() {
  const router = useRouter();
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: "commitcommunity@gmail.com",
      password: "**********",
      terms: false,
      remember: false,
    },
  });

  const onSubmit = async (data: SignInFormData) => {
    try {
      const res = await fetch("/api/auth/signin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error ?? "Sign in failed.");
        return;
      }
      toast.success("Signed in.");
      router.replace("/connect-instance");
    } catch {
      toast.error("Sign in failed. Please try again.");
    }
  };

  const loginWithGoogle = async () => {
    try {
      setGoogleLoading(true);
      const supabase = getSupabaseBrowserClient();
      const redirectTo = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (error) toast.error(error.message);
    } catch {
      toast.error("Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] font-sans">
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-20 bg-white">
        <div className="w-full max-w-md mx-auto">
          <h1 className="text-3xl lg:text-4xl font-bold text-black mb-2">
            Hey, Welcome Back!
          </h1>
          <p className="text-sm lg:text-base text-gray-500 mb-8">
            We are very happy to see you back!
          </p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-6">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                id="email"
                {...register("email")}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.email ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.email && (
                <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
              )}
            </div>

            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                id="password"
                {...register("password")}
                className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                  errors.password ? "border-red-500" : "border-gray-300"
                }`}
              />
              {errors.password && (
                <p className="mt-1 text-sm text-red-600">{errors.password.message}</p>
              )}
              <div className="mt-2 text-right">
                <Link href="/auth/forgot-password" className="text-sm text-blue-600 hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>

            <div className="mb-4">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  {...register("terms")}
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">
                  By signing up, you are creating a Nexus account, and you agree to Nexus&apos;s{" "}
                  <a href="#" className="text-blue-600 hover:underline">Term of Use</a> and{" "}
                  <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
                </span>
              </label>
            </div>

            <button
              type="submit"
              className="w-full cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-6 text-base"
            >
              Login
            </button>
          </form>

          <div className="relative flex items-center mb-6">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="px-4 text-sm text-gray-500 bg-white">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <div className="space-y-3 mb-6">
            <button
              type="button"
              onClick={() => void loginWithGoogle()}
              disabled={googleLoading}
              className="w-full cursor-pointer flex items-center justify-center gap-3 px-4 py-3 border border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span className="text-gray-700 font-medium">{googleLoading ? "Opening Google..." : "Login with Google"}</span>
            </button>
          </div>

          <div className="text-center text-sm text-gray-700">
            Don&apos;t have account?{" "}
            <Link href="/auth/signup" className="text-blue-600 font-medium hover:underline">
              Sign Up here!
            </Link>
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2">
        <Image
          src={backgroundImage}
          alt="Background"
          fill
          priority
        />
        <Image
          src={backgroundImageLeft}
          alt="Background"
          fill
          className="absolute left-0 top-0"
        />
      </div>
    </div>
  );
}
