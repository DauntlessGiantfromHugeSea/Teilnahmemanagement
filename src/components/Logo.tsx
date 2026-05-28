/* eslint-disable @next/next/no-img-element */
export function Logo({ className = "h-10 w-auto" }: { className?: string }) {
  return (
    <img
      src="https://fluessigbodenakademie.de/wp-content/uploads/2025/01/LogoFBAblue.png"
      alt="FB-Akademie"
      className={className}
    />
  );
}
