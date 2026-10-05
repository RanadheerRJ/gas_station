import { useEffect, useState } from "react";
import Sheet, { useSheetSubject } from "../../components/Sheet.jsx";
import { Field, Notice } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

const EMPTY = { name: "", address: "", ownerId: "" };

/**
 * One station, start to finish: create it for an owner, correct its name or
 * address, move it to the right owner, archive or reopen it, clear it out,
 * or delete it.
 *
 * Everything destructive sits below a rule at the bottom, apart from the
 * form and never pre-focused, and both destructive actions hand off to their
 * own confirmation sheet — nothing here deletes on a single click.
 */
export default function StationSheet({
  open,
  station: subject,
  defaultOwnerId,
  owners,
  busy,
  error,
  onClose,
  onCreate,
  onSave,
  onSetState,
  onResetData,
  onDelete,
}) {
  const { t } = useLanguage();
  const [form, setForm] = useState(EMPTY);
  // Held so the sheet keeps its station while it slides out.
  const station = useSheetSubject(subject, open);
  const editing = !!station;

  // Re-seed whenever the sheet opens on a different station, so a half-typed
  // correction never leaks into the next row the developer opens.
  useEffect(() => {
    if (!open) return;
    setForm(
      station
        ? {
            name: station.name || "",
            address: station.address || "",
            ownerId: station.ownerId || "",
          }
        : { ...EMPTY, ownerId: defaultOwnerId || owners[0]?.uid || "" }
    );
  }, [open, station, defaultOwnerId, owners]);

  const set = (key) => (event) =>
    setForm((current) => ({ ...current, [key]: event.target.value }));

  const complete = form.name.trim() && form.address.trim() && form.ownerId;
  const archived = station?.state !== "active";

  const submit = (event) => {
    event.preventDefault();
    if (!complete || busy) return;
    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      ownerId: form.ownerId,
    };
    if (editing) onSave(station, payload);
    else onCreate(payload);
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={editing ? station.name : t("admin.newStation")}
      wide
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        {editing && (
          <div className="dev-sheet__status">
            <span className={`tag ${archived ? "" : "green"}`}>
              {archived ? t("owner.archived") : t("setup.active")}
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => onSetState(station, archived ? "active" : "archived")}
            >
              {archived ? t("admin.reactivate") : t("owner.archive")}
            </button>
          </div>
        )}

        <div className="form-grid">
          <Field label={t("admin.stationName")} required>
            <input
              value={form.name}
              onChange={set("name")}
              required
              maxLength={120}
              disabled={busy}
              placeholder="Highway 44 Fuel Point"
            />
          </Field>
          <Field label={t("admin.stationAddress")} required>
            <input
              value={form.address}
              onChange={set("address")}
              required
              maxLength={300}
              disabled={busy}
              placeholder="NH-44, Shamirpet, Hyderabad"
            />
          </Field>
          <Field
            label={t("admin.owner")}
            hint={editing ? t("admin.transferHint") : undefined}
            required
          >
            <select value={form.ownerId} onChange={set("ownerId")} disabled={busy}>
              {owners.map((owner) => (
                <option key={owner.uid} value={owner.uid}>
                  {owner.name} ({owner.username})
                </option>
              ))}
            </select>
          </Field>
        </div>

        {error && <Notice kind="error">{error}</Notice>}

        <div className="row" style={{ gap: 8 }}>
          <button className="primary" type="submit" disabled={busy || !complete}>
            {busy
              ? t("common.saving")
              : editing
                ? t("common.save")
                : t("admin.createStation")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>

      {editing && (
        <div className="dev-danger">
          <div className="dev-subhead">
            <span>{t("station.resetDangerZone")}</span>
          </div>
          <div className="dev-danger__row">
            <div>
              <b>{t("station.resetData")}</b>
              <div className="small muted">{t("station.resetWarningShort")}</div>
            </div>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => onResetData(station)}
            >
              {t("station.resetShort")}
            </button>
          </div>
          <div className="dev-danger__row">
            <div>
              <b>{t("admin.deleteStation")}</b>
              <div className="small muted">{t("admin.deleteStationShort")}</div>
            </div>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => onDelete(station)}
            >
              {t("admin.deleteStation")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}
