"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import backgroundImage from "@/app/assets/image/unsplash.png";
import backgroundImageLeft from "@/app/assets/image/degrade.png";

const schema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ["confirmPassword"],
  });

type FormData = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => setEmail(params.get("email") ?? ""));
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { password: "", confirmPassword: "" },
  });

  const onSubmit = () => {
    router.push("/auth/signin");
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] font-sans">
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-20 bg-white">
        <div className="w-full max-w-md mx-auto">
          <h1 className="text-3xl lg:text-4xl font-bold text-black mb-2">
            Reset password
          </h1>
          <p className="text-sm lg:text-base text-gray-500 mb-8">
            Choose a new password for {email || "your account"}.
          </p>

          <form onSubmit={handleSubmit(onSubmit)}>
            <div className="mb-6">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                New password
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

            <div className="mb-6">
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Confirm password
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
                <p className="mt-1 text-sm text-red-600">
                  {errors.confirmPassword.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              className="w-full cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-4 text-base"
            >
              Save new password
            </button>
          </form>

          <div className="text-center text-sm text-gray-700">
            Back to{" "}
            <Link href="/auth/signin" className="text-blue-600 font-medium hover:underline">
              Sign in
            </Link>
          </div>
        </div>
      </div>

      <div className="relative hidden lg:block lg:w-1/2">
        <Image src={backgroundImage} alt="Background" fill priority />
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




