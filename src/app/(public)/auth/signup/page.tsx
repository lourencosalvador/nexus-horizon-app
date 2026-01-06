"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { PhoneInput } from "react-international-phone";
import { isValidPhoneNumber } from "libphonenumber-js";
import backgroundImage from "@/app/assets/image/unsplash.png";
import backgroundImageLeft from "@/app/assets/image/degrade.png";
import { getSupabaseBrowserClient } from "@/shared/lib/supabase/browser";

const signUpSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .regex(/^[a-z0-9_]+$/i, "Use only letters, numbers, and '_'"),
  phone: z.string().refine((v) => v === "" || isValidPhoneNumber(v), "Invalid phone number"),
  terms: z.boolean().refine((val) => val === true, "You must agree to the terms"),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type SignUpFormData = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const router = useRouter();
  const [preview, setPreview] = useState<string | null>(null);
  const [step, setStep] = useState<0 | 1>(0);
  const [googleLoading, setGoogleLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    trigger,
    control,
  } = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      phone: "",
      terms: false,
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const onSubmit = async (data: SignUpFormData) => {
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email, password: data.password, name: data.name }),
      });
      const payload = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        toast.error(payload.error ?? "Sign up failed.");
        return;
      }
      toast.success("Account created.");
      router.replace("/connect-instance");
    } catch {
      toast.error("Sign up failed. Please try again.");
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
            Create Your Account!
          </h1>
          <p className="text-sm lg:text-base text-gray-500 mb-8">
            Join us and start your journey today!
          </p>

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
              <span className="text-gray-700 font-medium">{googleLoading ? "Opening Google..." : "Sign up with Google"}</span>
            </button>
          </div>

          <div className="relative flex items-center mb-8">
            <div className="flex-grow border-t border-gray-300"></div>
            <span className="px-4 text-sm text-gray-500 bg-white">OR</span>
            <div className="flex-grow border-t border-gray-300"></div>
          </div>

          <div className="flex items-center mb-8">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step === 0 ? "bg-blue-600 text-white" : "bg-green-500 text-white"
                }`}
              >
                {step === 0 ? "1" : "✓"}
              </div>
              <span className={`text-sm font-medium ${step === 0 ? "text-black" : "text-gray-500"}`}>
                Account
              </span>
            </div>
            <div className={`flex-1 h-px mx-3 ${step === 0 ? "bg-gray-300" : "bg-green-500"}`} />
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold ${
                  step === 1 ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-600"
                }`}
              >
                2
              </div>
              <span className={`text-sm font-medium ${step === 1 ? "text-black" : "text-gray-500"}`}>
                Personal details
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSubmit)}>
            {step === 0 ? (
              <>
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
                </div>

                <div className="mb-8">
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Confirm Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    {...register("confirmPassword")}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.confirmPassword ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {errors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-600">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    const ok = await trigger(["email", "password", "confirmPassword"]);
                    if (ok) setStep(1);
                  }}
                  className="w-full cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-6 text-base"
                >
                  Continue
                </button>
              </>
            ) : (
              <>
                <div className="mb-6">
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="name"
                    {...register("name")}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.name ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {errors.name && (
                    <p className="mt-1 text-sm text-red-600">{errors.name.message}</p>
                  )}
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="username"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    {...register("username")}
                    className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      errors.username ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                  {errors.username && (
                    <p className="mt-1 text-sm text-red-600">{errors.username.message}</p>
                  )}
                </div>

                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Phone (optional)
                  </label>
                  <div
                    className={`w-full rounded-lg focus-within:ring-2 ${
                      errors.phone ? "focus-within:ring-red-500" : "focus-within:ring-blue-500"
                    }`}
                  >
                    <Controller
                      control={control}
                      name="phone"
                      render={({ field }) => (
                        <PhoneInput
                          defaultCountry="pt"
                          value={field.value}
                          onChange={(phone) => field.onChange(phone)}
                          style={
                            {
                              "--react-international-phone-height": "48px",
                              "--react-international-phone-border-radius": "8px",
                              "--react-international-phone-border-color": errors.phone
                                ? "#ef4444"
                                : "#d1d5db",
                              "--react-international-phone-country-selector-border-color": errors.phone
                                ? "#ef4444"
                                : "#d1d5db",
                              "--react-international-phone-font-size": "16px",
                              "--react-international-phone-flag-width": "18px",
                              "--react-international-phone-flag-height": "18px",
                              "--react-international-phone-dropdown-top": "52px",
                            } as React.CSSProperties
                          }
                          className="w-full"
                          inputClassName="react-international-phone-input w-full"
                          countrySelectorStyleProps={{
                            buttonClassName:
                              "cursor-pointer bg-white hover:bg-gray-50",
                            dropdownStyleProps: {
                              className: "shadow-lg border border-gray-200 rounded-lg",
                            },
                          }}
                          inputProps={{
                            name: field.name,
                            onBlur: field.onBlur,
                            placeholder: "+351 9xx xxx xxx",
                          }}
                        />
                      )}
                    />
                  </div>
                  {errors.phone && (
                    <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
                  )}
                </div>

                <div className="mb-6">
                  <label
                    htmlFor="profilePhoto"
                    className="block text-sm font-medium text-gray-700 mb-2"
                  >
                    Profile Photo
                  </label>
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
                      {preview ? (
                        <img src={preview} alt="Preview" className="w-full h-full object-cover" />
                      ) : (
                        <svg
                          className="w-10 h-10 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                          />
                        </svg>
                      )}
                    </div>
                    <label className="flex-1 cursor-pointer">
                      <input
                        type="file"
                        id="profilePhoto"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                      <div className="cursor-pointer px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-center text-sm text-gray-700">
                        Choose Photo
                      </div>
                    </label>
                  </div>
                </div>

                <div className="mb-6">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      {...register("terms")}
                      className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">
                      By signing up, you are creating a Nexus account, and you agree to Nexus&apos;s{" "}
                      <a href="#" className="text-blue-600 hover:underline">
                        Term of Use
                      </a>{" "}
                      and{" "}
                      <a href="#" className="text-blue-600 hover:underline">
                        Privacy Policy
                      </a>
                      .
                    </span>
                  </label>
                  {errors.terms && (
                    <p className="mt-1 text-sm text-red-600">{errors.terms.message}</p>
                  )}
                </div>

                <div className="flex gap-3 mb-6">
                  <button
                    type="button"
                    onClick={() => setStep(0)}
                    className="w-1/3 cursor-pointer border border-gray-300 text-gray-700 py-3 rounded-lg font-semibold hover:bg-gray-50 transition-colors text-base"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="w-2/3 cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors text-base"
                  >
                    Sign Up
                  </button>
                </div>
              </>
            )}
          </form>

          <div className="text-center text-sm text-gray-700">
            Already have an account?{" "}
            <Link href="/auth/signin" className="text-blue-600 font-medium hover:underline">
              Sign In here!
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
