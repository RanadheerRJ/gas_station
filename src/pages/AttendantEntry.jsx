import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/Layout";
import { Empty, Notice, Panel } from "../components/ui";
import EntryForm, { blankDraft } from "../components/EntryForm";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import { createEntry, listEntries, readableError } from "../lib/api";
import {
  entryCashPosition,
  entrySalesTotal,
  formatDate,
  formatStamp,
  money,
  todayISO,
} from "../lib/format";

/**
 * Attendant view: log today's numbers, nothing else.
 * Past entries are visible for reference but never editable.
 */
export default function AttendantEntry() {
  const { profile } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const station = stations[0];

  const [entries, setEntries] = useState([]);
  const [draft, setDraft] = useState(blankDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!station) return;
    setLoading(true);
    try {
      setEntries(await listEntries(station.id));
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [station]);

  useEffect(() => {
    load();
  }, [load]);

  const alreadyToday = entries.some((e) => e.date === todayISO());

  const save = async (entry) => {
    setBusy(true);
    setError("");
    try {
      await createEntry(station.id, entry, profile);
      setDraft(blankDraft());
      setSaved(true);
      await load();
      setTimeout(() => setSaved(false), 5000);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Today's entry" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  if (!station) {
    return (
      <>
        <PageHeader title="Today's entry" />
        <div className="content">
          <Notice kind="error">
            No station is assigned to your account. Ask your owner to check your access.
          </Notice>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Today's entry"
        sub={`${station.name} · ${formatDate(todayISO())}`}
      />
      <div className="content stack" style={{ maxWidth: 900 }}>
        {saved && <Notice kind="good">Entry recorded against your name.</Notice>}
        {alreadyToday && !saved && (
          <Notice>
            An entry already exists for today at this station. Adding another will
            record a second shift — ask your manager if you need a correction instead.
          </Notice>
        )}

        <Panel
          title="Sales, readings and cash"
          note="Once saved, only your manager or owner can change an entry."
        >
          <EntryForm
            draft={draft}
            setDraft={setDraft}
            variant="simple"
            onSubmit={save}
            busy={busy}
            error={error}
            submitLabel="Record today's entry"
            lockDate
          />
        </Panel>

        <Panel title="Recent entries at this station" flush>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : entries.length === 0 ? (
            <Empty>Nothing logged yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="num">Sales</th>
                  <th className="num">Cash in hand</th>
                  <th>Entered by</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 10).map((e) => (
                  <tr key={e.id}>
                    <td>{formatDate(e.date)}</td>
                    <td className="num mono">{money(entrySalesTotal(e))}</td>
                    <td className="num mono">{money(entryCashPosition(e))}</td>
                    <td className="small">
                      {e.enteredByName || "—"}
                      <div className="muted" style={{ fontSize: 11.5 }}>
                        {formatStamp(e.createdAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
