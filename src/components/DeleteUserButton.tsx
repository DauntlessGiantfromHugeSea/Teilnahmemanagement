"use client";

export function DeleteUserButton({ userId, email }: { userId: string; email: string }) {
  return (
    <form
      method="post"
      action={`/api/admin/users/${userId}/delete`}
      className="inline"
      onSubmit={(e) => {
        if (!confirm(`Nutzer ${email} endgültig löschen?`)) {
          e.preventDefault();
        }
      }}
    >
      <button className="btn-secondary text-xs text-red-700 border-red-200 hover:bg-red-50">
        Löschen
      </button>
    </form>
  );
}
