"use client";

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from "react";

// Shared visual primitives for Cricattax, built on the locked design-doc
// palette (black stock / gold / silver / felt-green) and typography
// (Cinzel display, Barlow Condensed body). Every screen in the app should
// compose from these rather than hand-rolling one-off styles, so the lobby,
// draft, and eventual card UI all read as one product.

export function Heading({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <h1
      className={`font-display text-4xl tracking-wide text-gold-light ${className}`}
    >
      {children}
    </h1>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gold/40 bg-stock/60 p-6 shadow-lg shadow-black/30 ${className}`}
    >
      {children}
    </div>
  );
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  const base =
    "font-body font-semibold uppercase tracking-wide text-sm rounded px-5 py-2.5 transition disabled:cursor-not-allowed disabled:opacity-40";
  const variants = {
    primary: "bg-gold text-stock hover:bg-gold-light",
    secondary:
      "border border-gold/60 text-gold-light hover:bg-gold/10",
  };
  return (
    <button className={`${base} ${variants[variant]} ${className}`} {...props} />
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-silver/30 bg-black/30 px-3 py-2 font-body text-silver placeholder:text-silver/40 focus:border-gold focus:outline-none ${props.className ?? ""}`}
    />
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="mb-1 block font-body text-sm uppercase tracking-wide text-silver/70">
      {children}
    </label>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <p className="font-body text-sm text-red-400">{children}</p>;
}

export function RoomCodeBadge({ code }: { code: string }) {
  return (
    <span className="font-display text-2xl tracking-[0.3em] text-gold-light">
      {code}
    </span>
  );
}
