"use client";

export function DeleteParticipantButton({
  participantId,
  name,
}: {
  participantId: string;
  name: string;
}) {
  return (
    <form
      method="post"
      action={`/api/participants/${participantId}/delete`}
      className="inline w-full"
      onSubmit={(e) => {
        if (
          !confirm(
            `Anmeldung von ${name} endgültig löschen?\n\nDie Daten werden komplett aus der Datenbank entfernt. Diese Aktion kann nicht rückgängig gemacht werden.`
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <button className="btn-secondary text-sm w-full text-red-700 border-red-200 hover:bg-red-50">
        Endgültig löschen
      </button>
    </form>
  );
}
