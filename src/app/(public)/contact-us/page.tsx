"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, ChevronUp, Facebook, Instagram, Twitter, Linkedin } from "lucide-react";
import { toast } from "sonner";
import logo from "@/app/assets/image/logo.png";
import { PhoneInput } from "react-international-phone";
import { isValidPhoneNumber } from "libphonenumber-js";

const schema = z.object({
  name: z.string().min(2, "Please enter your name"),
  email: z.string().email("Please enter a valid email"),
  phone: z.string().refine((v) => v === "" || isValidPhoneNumber(v), "Invalid phone number"),
  message: z.string().min(10, "Please enter a message"),
});

type FormData = z.infer<typeof schema>;

export default function ContactUsPage() {
  const [showTop, setShowTop] = useState(false);
  const year = useMemo(() => new Date().getFullYear(), []);

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    watch,
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", message: "" },
  });

  const phoneValue = watch("phone");

  const onSubmit = (data: FormData) => {
    localStorage.setItem("nexus_contact_last", JSON.stringify({ ...data, createdAt: Date.now() }));
    toast.success("Message sent successfully!");
    reset();
  };

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

      <section className="relative mx-auto max-w-7xl px-6 pt-40 pb-24 lg:px-10">
        <div className="absolute right-10 top-48 hidden lg:flex flex-col gap-6">
          <a href="#" className="text-black hover:text-blue-600 transition-colors p-3 rounded-full border border-gray-200"><Facebook size={20} /></a>
          <a href="#" className="text-black hover:text-blue-600 transition-colors p-3 rounded-full border border-gray-200"><Instagram size={20} /></a>
          <a href="#" className="text-black hover:text-blue-600 transition-colors p-3 rounded-full border border-gray-200"><Twitter size={20} /></a>
        </div>

        <div className="max-w-4xl">
          <p className="text-sm font-bold tracking-wider text-gray-500 uppercase">Get Started</p>
          <h1 className="mt-6 text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl">
            Get in touch with us.<br />
            We&apos;re here to assist you.
          </h1>

          <form onSubmit={handleSubmit(onSubmit)} className="mt-20">
            <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-3">
              <div className="relative">
                <label className="text-sm font-bold text-gray-900">Your Name</label>
                <input
                  {...register("name")}
                  className="mt-2 w-full border-b-2 border-zinc-900 py-3 text-base outline-none transition-colors focus:border-[#0047FF] placeholder:text-gray-500"
                  placeholder="John Doe"
                />
                {errors.name && <p className="mt-1 text-xs font-medium text-red-500">{errors.name.message}</p>}
              </div>

              <div className="relative">
                <label className="text-sm font-bold text-gray-900">Email Address</label>
                <input
                  {...register("email")}
                  className="mt-2 w-full border-b-2 border-zinc-900 py-3 text-base outline-none transition-colors focus:border-[#0047FF] placeholder:text-gray-500"
                  placeholder="you@company.com"
                />
                {errors.email && <p className="mt-1 text-xs font-medium text-red-500">{errors.email.message}</p>}
              </div>

              <div className="relative">
                <label className="text-sm font-bold text-gray-900">Phone Number (optional)</label>
                <div className="mt-2 border-b-2 border-gray-100 focus-within:border-[#0047FF] transition-colors">
                  <PhoneInput
                    defaultCountry="pt"
                    value={phoneValue}
                    onChange={(v) => setValue("phone", v, { shouldValidate: true })}
                    className="w-full"
                    inputClassName="!w-full !border-none !bg-transparent !py-3 !text-base !h-auto !ps-2 focus:!ring-0"
                    countrySelectorStyleProps={{
                      buttonClassName: "!border-none !bg-transparent !h-full !px-0",
                      dropdownStyleProps: { className: "shadow-2xl border border-gray-100 rounded-xl mt-4" }
                    }}
                  />
                </div>
                {errors.phone && <p className="mt-1 text-xs font-medium text-red-500">{errors.phone.message}</p>}
              </div>
            </div>

            <div className="mt-12 relative">
              <label className="text-sm font-bold text-gray-900">Message</label>
              <textarea
                {...register("message")}
                rows={1}
                className="mt-2 w-full border-b-2 border-zinc-900 py-3 text-base outline-none transition-colors focus:border-[#0047FF] placeholder:text-gray-500 resize-none"
                placeholder="Tell us what you need..."
              />
              {errors.message && <p className="mt-1 text-xs font-medium text-red-500">{errors.message.message}</p>}
            </div>

            <button
              type="submit"
              className="mt-12 inline-flex items-center gap-3 rounded-full bg-[#0047FF] px-10 py-4 text-sm font-bold text-white transition-all hover:bg-blue-700 hover:shadow-xl active:scale-95 group"
            >
              Leave us a Messag
              <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
            </button>
          </form>
        </div>
      </section>

      <section className="relative bg-[#F9FAFB] py-24 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none" 
             style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M54.62 10.38L49.24 15.76c-.78.78-.78 2.05 0 2.83.78.78 2.05.78 2.83 0l5.38-5.38c.78-.78.78-2.05 0-2.83-.78-.78-2.05-.78-2.83 0zM10.38 54.62L15.76 49.24c.78-.78 2.05-.78 2.83 0 .78.78.78 2.05 0 2.83l-5.38 5.38c-.78.78-2.05.78-2.83 0-.78-.78-.78-2.05 0-2.83z' fill='%23000' fill-opacity='1' fill-rule='evenodd'/%3E%3C/svg%3E")` }}>
        </div>

        <div className="relative mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-sm font-bold tracking-wider text-gray-500 uppercase">Contact Info</p>
              <h2 className="mt-6 text-4xl font-extrabold leading-[1.1] text-black sm:text-5xl">
                We are always<br />happy to assist you
              </h2>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-12 lg:pt-12">
              <div>
                <p className="text-sm font-bold text-gray-900">Email Address</p>
                <div className="mt-4 h-0.5 w-8 bg-black"></div>
                <div className="mt-6 space-y-4">
                  <p className="text-lg font-bold text-[#0047FF]">support@nexus.com</p>
                  <p className="text-sm leading-relaxed text-gray-500">
                    <span className="font-bold text-gray-900">Assistance hours:</span><br />
                    Monday - Friday 6 am to<br />8 pm GMT
                  </p>
                </div>
              </div>

              <div>
                <p className="text-sm font-bold text-gray-900">Number</p>
                <div className="mt-4 h-0.5 w-8 bg-black"></div>
                <div className="mt-6 space-y-4">
                  <p className="text-lg font-bold text-[#0047FF]">(+11) 900 000 000</p>
                  <p className="text-sm leading-relaxed text-gray-500">
                    <span className="font-bold text-gray-900">Assistance hours:</span><br />
                    Monday - Friday 6 am to<br />8 pm GMT
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#0047FF] py-20 relative">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="flex flex-col items-center justify-between gap-10 lg:flex-row">
            <div className="text-white max-w-lg">
              <h3 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Subscribe to our Newsletter</h3>
              <p className="mt-4 text-blue-100/80">Subscribe for Updates: Stay informed about the latest updates and announcements by subscribing to our newsletter.</p>
            </div>
            <div className="flex w-full max-w-md items-center gap-3">
              <input 
                type="email" 
                placeholder="Enter your email" 
                className="h-14 flex-1 rounded-2xl bg-white/10 px-6 text-white placeholder:text-blue-100/50 outline-none ring-1 ring-white/20 focus:ring-2 focus:ring-white/60 transition-all"
              />
              <button className="h-14 rounded-2xl bg-white px-8 text-sm font-bold text-[#0047FF] transition-all hover:bg-blue-50 active:scale-95 shadow-xl">
                Subscribe
              </button>
            </div>
          </div>
        </div>

        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className={`absolute left-1/2 -top-7 h-14 w-14 -translate-x-1/2 flex items-center justify-center rounded-full bg-white shadow-2xl text-[#0047FF] transition-all hover:-translate-y-1 active:scale-90 ${showTop ? 'opacity-100 visible' : 'opacity-0 invisible'}`}
        >
          <ChevronUp size={28} />
        </button>
      </section>

      <footer className="bg-[#111] py-20 text-white">
        <div className="mx-auto max-w-7xl px-6 lg:px-10">
          <div className="grid grid-cols-1 gap-16 lg:grid-cols-12">
            <div className="lg:col-span-4">
            <Link href="/" className="flex items-center relative">
            <Image src={logo} alt="Logo" width={50} height={50} priority />
              <span className="text-2xl absolute top-[10px] left-9 font-semibold tracking-tight text-white">
                exus
              </span>
            </Link>
              <p className="mt-6 text-gray-400 leading-relaxed max-w-xs">
                exus — automation and community management platform designed for the future of digital communities.
              </p>
              <div className="mt-8 flex items-center gap-4">
                <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-[#0047FF] transition-all group">
                  <Facebook size={18} className="text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-[#0047FF] transition-all group">
                  <Instagram size={18} className="text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-[#0047FF] transition-all group">
                  <Twitter size={18} className="text-gray-400 group-hover:text-white" />
                </a>
                <a href="#" className="h-10 w-10 flex items-center justify-center rounded-full bg-white/5 hover:bg-[#0047FF] transition-all group">
                  <Linkedin size={18} className="text-gray-400 group-hover:text-white" />
                </a>
              </div>
            </div>

            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-10">
       
              <div className="space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest">Business</h4>
                <ul className="space-y-4 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">Enterprise</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Solutions</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Case Studies</a></li>
                </ul>
              </div>
              <div className="space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest">Support</h4>
                <ul className="space-y-4 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">Help Center</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Contact Us</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Status</a></li>
                </ul>
              </div>
              <div className="space-y-6">
                <h4 className="text-sm font-bold uppercase tracking-widest">Company</h4>
                <ul className="space-y-4 text-sm text-gray-400">
                  <li><a href="#" className="hover:text-white transition-colors">About Us</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Privacy Policy</a></li>
                  <li><a href="#" className="hover:text-white transition-colors">Terms of Service</a></li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-20 border-t border-white/10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-500">
            <p>© {year} Nexus. All Rights Reserved.</p>
            <div className="flex gap-6">
              <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
