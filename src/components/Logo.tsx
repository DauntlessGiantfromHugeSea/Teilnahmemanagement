/* eslint-disable @next/next/no-img-element */
export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <img
      src="/logo-fba.png"
      alt="FB-Akademie"
      className={className}
    />
  );
}
