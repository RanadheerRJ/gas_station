import { useLanguage } from "../state/LanguageContext.jsx";

export default function StationPicker({ stations, value, onChange }) {
  const { t } = useLanguage();
  if (stations.length <= 1) return null;
  return (
    <label className="field" style={{ minWidth: 240 }}>
      <span>{t("common.station")}</span>
      <select value={value || ""} onChange={(e) => onChange(e.target.value)}>
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
