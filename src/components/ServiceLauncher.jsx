import { Link } from "react-router-dom";
import { useLanguage } from "../state/LanguageContext.jsx";
import { PlusIcon } from "./icons.jsx";

/**
 * A role's landing screen: only the available services are visible here.
 * Dashboard figures, station cards, and operational lists stay unmounted
 * until the person chooses where to go.
 *
 * The destination that points at the current home route is a button rather
 * than a link to itself. It opens the existing home dashboard in place; all
 * other tiles keep their original routes and role protections.
 */
export default function ServiceLauncher({ tabs, more, startPath, homePath, onOpenHome }) {
  const { t } = useLanguage();
  const destinations = [...tabs, ...more];
  const home = destinations.find((item) => item.to === homePath);
  const services = [
    ...(home ? [{ ...home, isHome: true }] : []),
    ...(startPath ? [{ to: startPath, label: "shifts.startShift", Icon: PlusIcon }] : []),
    ...destinations.filter((item) => item.to !== homePath),
  ];

  return (
    <div className="service-launcher">
      <nav aria-label={t("home.services")}>
        <ul className="service-grid">
          {services.map(({ to, label, Icon, isHome }) => {
            const contents = (
              <>
                <span className="service-tile__icon" aria-hidden="true">
                  <Icon size={30} />
                </span>
                <span className="service-tile__label">{t(label)}</span>
              </>
            );

            return (
              <li key={`${to}-${label}`} className="service-grid__item">
                {isHome ? (
                  <button type="button" className="service-tile" onClick={onOpenHome}>
                    {contents}
                  </button>
                ) : (
                  <Link to={to} className="service-tile">
                    {contents}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
