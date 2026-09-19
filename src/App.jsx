import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminInviteOwner from "./pages/AdminInviteOwner";
import OwnerHome from "./pages/OwnerHome";
import OwnerStaff from "./pages/OwnerStaff";
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
import StockList from "./pages/stock/StockList.jsx";
import TankDetail from "./pages/stock/TankDetail.jsx";
import CreditList from "./pages/credit/CreditList.jsx";
import CustomerDetail from "./pages/credit/CustomerDetail.jsx";
import { useAuth } from "./state/AuthContext";
import { SkeletonLine } from "./components/motion.jsx";

/** Where each role lands after sign-in. */
const HOME = {
  admin: "/admin",
  owner: "/owner",
  manager: "/station",
  attendant: "/today",
};

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
    return (
      <div className="login-wrap">
        {/* Signing in checks a session against the backend; show the shape of
            the panel that is coming rather than a bare word. */}
        <div style={{ width: 320 }}>
          <div className="loading-bar" />
          <div className="skeleton-panel" style={{ marginTop: 12 }}>
            <SkeletonLine width="short" />
            <SkeletonLine width="wide" />
            <SkeletonLine width="half" />
          </div>
        </div>
      </div>
    );
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

        {/* ---- owner ---- */}
        <Route
          path="/owner"
          element={
            <Protect roles={["owner"]}>
              <OwnerHome />
            </Protect>
          }
        />
        <Route
          path="/owner/shifts"
          element={
            <Protect roles={["owner"]}>
              <ShiftsList />
            </Protect>
          }
        />
        <Route
          path="/owner/shifts/start"
          element={
            <Protect roles={["owner"]}>
              <StartShift />
            </Protect>
          }
        />
        <Route
          path="/owner/shifts/:id"
          element={
            <Protect roles={["owner"]}>
              <ShiftDetail />
            </Protect>
          }
        />
        <Route
          path="/owner/shifts/:id/close"
          element={
            <Protect roles={["owner"]}>
              <CloseShift />
            </Protect>
          }
        />
        <Route
          path="/owner/setup"
          element={
            <Protect roles={["owner"]}>
              <StationSetup />
            </Protect>
          }
        />
        <Route
          path="/owner/stock"
          element={
            <Protect roles={["owner"]}>
              <StockList />
            </Protect>
          }
        />
        <Route
          path="/owner/stock/:tankId"
          element={
            <Protect roles={["owner"]}>
              <TankDetail />
            </Protect>
          }
        />
        <Route
          path="/owner/ledger"
          element={
            <Protect roles={["owner"]}>
              <LedgerList />
            </Protect>
          }
        />
        <Route
          path="/owner/ledger/:date"
          element={
            <Protect roles={["owner"]}>
              <LedgerDay />
            </Protect>
          }
        />
        <Route
          path="/owner/credit"
          element={
            <Protect roles={["owner"]}>
              <CreditList />
            </Protect>
          }
        />
        <Route
          path="/owner/credit/:customerId"
          element={
            <Protect roles={["owner"]}>
              <CustomerDetail />
            </Protect>
          }
        />
        <Route
          path="/owner/staff"
          element={
            <Protect roles={["owner"]}>
              <OwnerStaff />
            </Protect>
          }
        />

        {/* ---- manager ---- */}
        <Route
          path="/station"
          element={
            <Protect roles={["manager"]}>
              <ShiftsList />
            </Protect>
          }
        />
        <Route
          path="/station/start"
          element={
            <Protect roles={["manager"]}>
              <StartShift />
            </Protect>
          }
        />
        <Route
          path="/station/shift/:id"
          element={
            <Protect roles={["manager"]}>
              <ShiftDetail />
            </Protect>
          }
        />
        <Route
          path="/station/shift/:id/close"
          element={
            <Protect roles={["manager"]}>
              <CloseShift />
            </Protect>
          }
        />
        <Route
          path="/station/stock"
          element={
            <Protect roles={["manager"]}>
              <StockList />
            </Protect>
          }
        />
        <Route
          path="/station/stock/:tankId"
          element={
            <Protect roles={["manager"]}>
              <TankDetail />
            </Protect>
          }
        />
        <Route
          path="/station/ledger"
          element={
            <Protect roles={["manager"]}>
              <LedgerList />
            </Protect>
          }
        />
        <Route
          path="/station/ledger/:date"
          element={
            <Protect roles={["manager"]}>
              <LedgerDay />
            </Protect>
          }
        />
        <Route
          path="/station/credit"
          element={
            <Protect roles={["manager"]}>
              <CreditList />
            </Protect>
          }
        />
        <Route
          path="/station/credit/:customerId"
          element={
            <Protect roles={["manager"]}>
              <CustomerDetail />
            </Protect>
          }
        />

        {/* ---- attendant: a real multi-screen flow under /today ---- */}
        <Route
          path="/today"
          element={
            <Protect roles={["attendant"]}>
              <TodayHome />
            </Protect>
          }
        />
        <Route
          path="/today/start"
          element={
            <Protect roles={["attendant"]}>
              <StartShift />
            </Protect>
          }
        />
        <Route
          path="/today/shift/:id"
          element={
            <Protect roles={["attendant"]}>
              <ShiftRun />
            </Protect>
          }
        />
        <Route
          path="/today/shift/:id/close"
          element={
            <Protect roles={["attendant"]}>
              <CloseShift />
            </Protect>
          }
        />
        <Route
          path="/today/history"
          element={
            <Protect roles={["attendant"]}>
              <TodayHistory />
            </Protect>
          }
        />
        <Route
          path="/today/history/:id"
          element={
            <Protect roles={["attendant"]}>
              <ShiftDetail />
            </Protect>
          }
        />
        <Route
          path="/today/account"
          element={
            <Protect roles={["attendant"]}>
              <TodayAccount />
            </Protect>
          }
        />
      </Route>
      <Route
        path="*"
        element={<Navigate to={HOME[profile.role] || "/login"} replace />}
      />
    </Routes>
  );
}
