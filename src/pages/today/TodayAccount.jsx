import { ScreenHeader } from "../../components/Layout.jsx";
import AccountPanel from "../../components/AccountPanel.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The attendant's Account tab. Signing out is a frequent act on a shared
 * forecourt device, so it gets a whole calm screen rather than hiding behind
 * a gesture — same content as the account sheet other roles see.
 */
export default function TodayAccount() {
  const { t } = useLanguage();
  return (
    <>
      <ScreenHeader title={t("nav.account")} />
      <div className="content">
        <section className="card">
          <AccountPanel />
        </section>
      </div>
    </>
  );
}
