"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import backgroundImage from "@/app/assets/image/unsplash.png";
import backgroundImageLeft from "@/app/assets/image/degrade.png";

const schema = z.object({
  code: z
    .string()
    .regex(/^\d{6}$/, "Enter the 6-digit code"),
});

type FormData = z.infer<typeof schema>;

export default function VerifyCodePage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [info, setInfo] = useState<string | null>(null);
  const OTP_LENGTH = 6;
  const [otp, setOtp] = useState<string[]>(() => Array.from({ length: OTP_LENGTH }, () => ""));
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const codeValue = useMemo(() => otp.join(""), [otp]);
  const [showOtpError, setShowOtpError] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    queueMicrotask(() => setEmail(params.get("email") ?? ""));
  }, []);

  const {
    register,
    setValue,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { code: "" },
  });

  useEffect(() => {
    setValue("code", codeValue, { shouldValidate: false });
  }, [codeValue, setValue]);

  const onSubmit = ({ code }: FormData) => {
    setShowOtpError(false);
    router.push(
      `/auth/reset-password?email=${encodeURIComponent(email)}&code=${encodeURIComponent(code)}`
    );
  };

  const setAt = (index: number, value: string) => {
    setOtp((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const focusIndex = (index: number) => {
    inputsRef.current[index]?.focus();
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] font-sans">
      <div className="flex w-full lg:w-1/2 flex-col justify-center px-8 py-12 lg:px-20 bg-white">
        <div className="w-full max-w-md mx-auto">
          <h1 className="text-3xl lg:text-4xl font-bold text-black mb-2">
            Verify code
          </h1>
          <p className="text-sm lg:text-base text-gray-500 mb-2">
            Enter the 6-digit code we sent to:
          </p>
          <p className="text-sm lg:text-base text-black mb-8 break-all">{email || "your email"}</p>

          <form
            onSubmit={handleSubmit(onSubmit, () => {
              setShowOtpError(true);
            })}
          >
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Code
              </label>
              <input type="hidden" {...register("code")} />

              <div
                className="flex items-center justify-between gap-2"
                onPaste={(e) => {
                  const text = e.clipboardData.getData("text");
                  const digits = text.replace(/\D/g, "").slice(0, OTP_LENGTH).split("");
                  if (digits.length === 0) return;
                  e.preventDefault();
                  setHasInteracted(true);
                  setOtp((prev) => {
                    const next = [...prev];
                    for (let i = 0; i < OTP_LENGTH; i++) next[i] = digits[i] ?? "";
                    return next;
                  });
                  focusIndex(Math.min(digits.length, OTP_LENGTH - 1));
                }}
              >
                {otp.map((digit, idx) => (
                  <input
                    key={idx}
                    ref={(el) => {
                      inputsRef.current[idx] = el;
                    }}
                    aria-label={`OTP digit ${idx + 1}`}
                    inputMode="numeric"
                    autoComplete={idx === 0 ? "one-time-code" : "off"}
                    value={digit}
                    onChange={(e) => {
                      setHasInteracted(true);
                      const raw = e.target.value;
                      const nextDigit = raw.replace(/\D/g, "").slice(-1);
                      setAt(idx, nextDigit);
                      if (nextDigit && idx < OTP_LENGTH - 1) focusIndex(idx + 1);
                    }}
                    onKeyDown={(e) => {
                      setHasInteracted(true);
                      if (e.key === "Backspace") {
                        if (otp[idx]) {
                          setAt(idx, "");
                        } else if (idx > 0) {
                          focusIndex(idx - 1);
                          setAt(idx - 1, "");
                        }
                        e.preventDefault();
                      }
                      if (e.key === "ArrowLeft" && idx > 0) {
                        focusIndex(idx - 1);
                        e.preventDefault();
                      }
                      if (e.key === "ArrowRight" && idx < OTP_LENGTH - 1) {
                        focusIndex(idx + 1);
                        e.preventDefault();
                      }
                    }}
                    className={`h-12 w-11 sm:h-14 sm:w-12 rounded-lg border text-center text-lg font-semibold tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.code && (showOtpError || hasInteracted) ? "border-red-500" : "border-gray-300"
                    }`}
                  />
                ))}
              </div>
              {errors.code && (showOtpError || hasInteracted) && (
                <p className="mt-1 text-sm text-red-600">{errors.code.message}</p>
              )}
            </div>

            {info && <p className="mb-4 text-sm text-green-700">{info}</p>}

            <button
              type="submit"
              className="w-full cursor-pointer bg-blue-600 text-white py-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors mb-4 text-base"
            >
              Verify
            </button>
          </form>

          <div className="flex items-center justify-between text-sm">
            <button
              type="button"
              onClick={() => setInfo("Code resent (front-only demo).")}
              className="cursor-pointer text-blue-600 font-medium hover:underline"
            >
              Resend code
            </button>
            <Link href="/auth/forgot-password" className="text-gray-700 hover:underline">
              Change email
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




