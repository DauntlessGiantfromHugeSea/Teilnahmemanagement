"use client";

import { ReactNode } from "react";

export function ConfirmForm({
  action,
  message,
  className,
  children,
}: {
  action: string;
  message: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <form
      method="post"
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </form>
  );
}
