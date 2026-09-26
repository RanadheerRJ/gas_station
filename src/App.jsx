import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
const Login = lazy(() => import("./pages/Login"));
const AdminInviteOwner = lazy(() => import("./pages/AdminInviteOwner"));
const OwnerHome = lazy(() => import("./pages/OwnerHome"));
const OwnerStaff = lazy(() => import("./pages/OwnerStaff"));
const ManagerStaff = lazy(() => import("./pages/ManagerStaff"));
const StationSetup = lazy(() => import("./pages/StationSetup"));
const TodayHome = lazy(() => import("./pages/today/TodayHome.jsx"));
const StartShift = lazy(() => import("./pages/today/StartShift.jsx"));
const ShiftRun = lazy(() => import("./pages/today/ShiftRun.jsx"));
const TodayHistory = lazy(() => import("./pages/today/TodayHistory.jsx"));
const TodayAccount = lazy(() => import("./pages/today/TodayAccount.jsx"));
const ShiftsList = lazy(() => import("./pages/shifts/ShiftsList.jsx"));
const ShiftDetail = lazy(() => import("./pages/shifts/ShiftDetail.jsx"));
const CloseShift = lazy(() => import("./pages/shifts/CloseShift.jsx"));
const LedgerList = lazy(() => import("./pages/ledger/LedgerList.jsx"));
const LedgerDay = lazy(() => import("./pages/ledger/LedgerDay.jsx"));
const Reports = lazy(() => import("./pages/reports/Reports.jsx"));
const StockList = lazy(() => import("./pages/stock/StockList.jsx"));
const TankDetail = lazy(() => import("./pages/stock/TankDetail.jsx"));
const CreditList = lazy(() => import("./pages/credit/CreditList.jsx"));
const CustomerDetail = lazy(() => import("./pages/credit/CustomerDetail.jsx"));
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
      <Suspense fallback={<PetravBoot />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PetravBoot />}>
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
    </Suspense>
  );
}
