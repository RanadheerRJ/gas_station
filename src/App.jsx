import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminInviteOwner from "./pages/AdminInviteOwner";
import OwnerHome from "./pages/OwnerHome";
import OwnerStaff from "./pages/OwnerStaff";
import ManagerStaff from "./pages/ManagerStaff";
import StationSetup from "./pages/StationSetup";
import TodayHome from "./pages/today/TodayHome.jsx";
import StartShift from "./pages/today/StartShift.jsx";
import ShiftRun from "./pages/today/ShiftRun.jsx";
import TodayHistory from "./pages/today/TodayHistory.jsx";
import TodayAccount from "./pages/today/TodayAccount.jsx";
import ShiftsList from "./pages/shifts/ShiftsList.jsx";
import ShiftDetail from "./pages/shifts/ShiftDetail.jsx";
import CloseShift from "./pages/shifts/CloseShift.jsx";
import LedgerList from "./pages/ledger/LedgerList.jsx";
import LedgerDay from "./pages/ledger/LedgerDay.jsx";
import Reports from "./pages/reports/Reports.jsx";
import StockList from "./pages/stock/StockList.jsx";
import TankDetail from "./pages/stock/TankDetail.jsx";
import CreditList from "./pages/credit/CreditList.jsx";
import CustomerDetail from "./pages/credit/CustomerDetail.jsx";
import { useAuth } from "./state/AuthContext";
import { PetravBoot } from "./components/branding.jsx";

/** Where each role lands after sign-in. */
const HOME = {
  admin: "/admin",
  owner: "/owner",
  manager: "/station",
  attendant: "/today",
};

const ROLE_ROUTES = [
  {
    prefix: "/owner",
    roles: ["owner"],
    routes: [
      { path: "", element: <OwnerHome /> },
      { path: "/shifts", element: <ShiftsList /> },
      { path: "/shifts/start", element: <StartShift /> },
      { path: "/shifts/:id", element: <ShiftDetail /> },
      { path: "/shifts/:id/close", element: <CloseShift /> },
      // An owner who reopens a closed shift corrects it here, end to end.
      { path: "/shifts/:id/edit", element: <CloseShift /> },
      { path: "/setup", element: <StationSetup /> },
      { path: "/stock", element: <StockList /> },
      { path: "/stock/:tankId", element: <TankDetail /> },
      { path: "/ledger", element: <LedgerList /> },
      { path: "/ledger/:date", element: <LedgerDay /> },
      { path: "/reports", element: <Reports /> },
      { path: "/credit", element: <CreditList /> },
      { path: "/credit/:customerId", element: <CustomerDetail /> },
      { path: "/staff", element: <OwnerStaff /> },
    ],
  },
  {
    prefix: "/station",
    roles: ["manager"],
    routes: [
      { path: "", element: <ShiftsList /> },
      { path: "/start", element: <StartShift /> },
      { path: "/shift/:id", element: <ShiftDetail /> },
      { path: "/shift/:id/close", element: <CloseShift /> },
      { path: "/stock", element: <StockList /> },
      { path: "/stock/:tankId", element: <TankDetail /> },
      { path: "/ledger", element: <LedgerList /> },
      { path: "/ledger/:date", element: <LedgerDay /> },
      { path: "/reports", element: <Reports /> },
      { path: "/credit", element: <CreditList /> },
      { path: "/credit/:customerId", element: <CustomerDetail /> },
      { path: "/staff", element: <ManagerStaff /> },
    ],
  },
  {
    prefix: "/today",
    roles: ["attendant"],
    routes: [
      { path: "", element: <TodayHome /> },
      { path: "/start", element: <StartShift /> },
      { path: "/shift/:id", element: <ShiftRun /> },
      { path: "/shift/:id/close", element: <CloseShift /> },
      { path: "/stock", element: <StockList /> },
      { path: "/stock/:tankId", element: <TankDetail /> },
      { path: "/history", element: <TodayHistory /> },
      { path: "/history/:id", element: <ShiftDetail /> },
      { path: "/history/:id/edit", element: <CloseShift /> },
      { path: "/account", element: <TodayAccount /> },
      { path: "/credit", element: <CreditList /> },
    ],
  },
];

function Protect({ roles, children }) {
  const { profile } = useAuth();
  if (!profile) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={HOME[profile.role] || "/login"} replace />;
  }
  return children;
}

/**
 * One screen, one concern: every route below is a list, a detail, or a
 * focused action — never several stacked together. The role prefixes keep
 * the same destinations each role has always had; only the shape of what
 * renders behind them changes.
 */
export default function App() {
  const { profile, loading } = useAuth();

  if (loading) {
    /* Checking the session takes a moment; the boot screen carries the
       brand through it instead of bare placeholders. */
    return <PetravBoot />;
  }

  if (!profile) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route
        path="/login"
        element={<Navigate to={HOME[profile.role] || "/"} replace />}
      />
      <Route element={<Layout />}>
        {/* ---- developer ---- */}
        <Route
          path="/admin"
          element={
            <Protect roles={["admin"]}>
              <AdminInviteOwner />
            </Protect>
          }
        />

        {ROLE_ROUTES.flatMap(({ prefix, roles, routes }) =>
          routes.map(({ path, element }) => (
            <Route
              key={`${prefix}${path}`}
              path={`${prefix}${path}`}
              element={<Protect roles={roles}>{element}</Protect>}
            />
          ))
        )}
      </Route>
      <Route
        path="*"
        element={<Navigate to={HOME[profile.role] || "/login"} replace />}
      />
    </Routes>
  );
}
