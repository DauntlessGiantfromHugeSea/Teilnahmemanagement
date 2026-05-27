"use client";

export function DeleteEventButton({ eventId, title }: { eventId: string; title: string }) {
  return (
    <form
      method="post"
      action={`/api/events/${eventId}/delete`}
      className="inline"
      onSubmit={(e) => {
        if (
          !confirm(
            `Veranstaltung "${title}" endgültig löschen?\n\nDie Veranstaltung wird komplett aus der Datenbank entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button className="btn-secondary text-red-700 border-red-200 hover:bg-red-50">
        Endgültig löschen
      </button>
    </form>
  );
}
