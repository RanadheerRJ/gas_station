import { ScreenHeader } from "../../components/Layout.jsx";
import AccountPanel from "../../components/AccountPanel.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useStation } from "../../state/useStation.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

export default function TodayAccount() {
  const { t } = useLanguage();
  const { station, loading } = useStation();
  return (
    <>
      <ScreenHeader title={t("nav.account")} />
      <div className="content account-screen">
        {loading ? (
          <LoadingPanels count={2} lines={2} label={t("common.loading")} />
        ) : (
          <AccountPanel stationName={station?.name || ""} />
        )}
      </div>
    </>
  );
}
