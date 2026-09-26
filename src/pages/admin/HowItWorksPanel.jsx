import { Panel } from "../../components/ui";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Where an account actually comes from, and why a PIN cannot be read back —
 * written next to the button that hands one out.
 */
export default function HowItWorksPanel() {
  const { t } = useLanguage();
  return (
    <Panel title={t("admin.howItWorks")}>
      <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
        <li>
          The owner account is created by the <span className="mono">accounts</span>{" "}
          Supabase Edge Function. Its service key never reaches this browser.
        </li>
        <li>
          Supabase Auth stores a hash of the derived username + PIN password. The public
          database never stores a raw PIN or a PIN hash.
        </li>
        <li>
          You choose the owner’s opening PIN and hand it over. Only its hash is kept, so
          it cannot be read back — use <em>Reset PIN</em> above if it is ever lost.
        </li>
        <li>
          Owners create their own managers and attendants from their dashboard, and
          managers and owners can reset a forgotten staff PIN themselves — you only need
          to step in when an owner loses theirs.
        </li>
      </ul>
    </Panel>
  );
}
