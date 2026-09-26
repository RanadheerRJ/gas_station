import { useEffect, useState } from "react";
import Sheet from "./Sheet.jsx";
import { Field, Notice } from "./ui.jsx";
import { resetStationData, readableError } from "../lib/api.js";
import { useLanguage } from "../state/LanguageContext.jsx";

export default function ResetStationSheet({ open, station, onClose, onDone }) {
  const { t } = useLanguage();
  const [confirmName, setConfirmName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const stationName = station?.name || "";
  const stationId = station?.id || station?.stationId;

  useEffect(() => {
    if (open) {
      setConfirmName("");
      setError("");
      setBusy(false);
    }
  }, [open, station]);

  const matches =
    stationName.trim() !== "" &&
    confirmName.trim().toLowerCase() === stationName.trim().toLowerCase();

  const handleReset = async (e) => {
    e?.preventDefault();
    if (!matches || !stationId || busy) return;
    setBusy(true);
    setError("");
    try {
      await resetStationData(stationId);
      if (onDone) await onDone();
      onClose();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={busy ? () => {} : onClose}
      title={t("station.resetTitle", { name: stationName })}
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={handleReset}>
        <Notice kind="error">{t("station.resetWarning")}</Notice>

        {error && <Notice kind="error">{error}</Notice>}

        <Field label={t("station.resetConfirmPrompt", { name: stationName })} required>
          <input
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={stationName}
            disabled={busy}
            autoFocus
          />
        </Field>

        <div className="row" style={{ gap: 8 }}>
          <button type="submit" className="danger" disabled={busy || !matches}>
            {busy ? t("station.resetting") : t("station.resetAction")}
          </button>
          <button type="button" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
