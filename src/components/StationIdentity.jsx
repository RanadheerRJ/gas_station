import { useAuth } from "../state/AuthContext.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

function greetingKey(hour) {
  if (hour < 12) return "today.goodMorning";
  if (hour < 17) return "today.goodAfternoon";
  return "today.goodEvening";
}

/**
 * Compact operator and station context for operational screens. Station names
 * are clamped deliberately so a long legal name can never push the page wide.
 */
export default function StationIdentity({ stationName }) {
  const { profile } = useAuth();
  const { t } = useLanguage();
  const greeting = t(greetingKey(new Date().getHours()));

  return (
    <section className="station-identity" aria-label={t("common.station")}>
      <div className="station-identity__copy">
        <div className="station-identity__greeting">
          {greeting}, <strong>{profile.name}</strong>
        </div>
        {stationName && (
          <div className="business-name business-name--multiline" title={stationName}>
            {stationName}
          </div>
        )}
      </div>
      <span className="role-pill role-pill--attendant">{t("role.attendant")}</span>
    </section>
  );
}
