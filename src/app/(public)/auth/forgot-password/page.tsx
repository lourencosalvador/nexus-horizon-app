"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import backgroundImage from "@/app/assets/image/unsplash.png";
import backgroundImageLeft from "@/app/assets/image/degrade.png";

const schema = z.object({
  email: z.string().email("Invalid email address"),
});

type FormData = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  });

  const onSubmit = ({ email }: FormData) => {
    router.push(`/auth/verify-code?email=${encodeURIComponent(email)}`);
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] font-sans">
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-20 bg-white">
        <div className="w-full max-w-md mx-auto">
          <h1 className="text-3xl lg:text-4xl font-bold text-black mb-2">
            Forgot your password?
          </h1>
          <p className="text-sm lg:text-base text-gray-500 mb-8">
            Enter your email and we’ll send you a verification code.
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

            <button
              type="submit"
              className="w-full cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-4 text-base"
            >
              Send code
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


