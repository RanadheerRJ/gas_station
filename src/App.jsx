import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminInviteOwner from "./pages/AdminInviteOwner";
import OwnerDashboard from "./pages/OwnerDashboard";
import OwnerStaff from "./pages/OwnerStaff";
import DailyLedger from "./pages/DailyLedger";
import CreditCustomers from "./pages/CreditCustomers";
import Shifts from "./pages/Shifts";
import StationSetup from "./pages/StationSetup";
import GroundStock from "./pages/GroundStock";
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
        <Route
          path="/admin"
          element={
            <Protect roles={["admin"]}>
              <AdminInviteOwner />
            </Protect>
          }
        />
        <Route
          path="/owner"
          element={
            <Protect roles={["owner"]}>
              <OwnerDashboard />
            </Protect>
          }
        />
        <Route
          path="/owner/shifts"
          element={
            <Protect roles={["owner"]}>
              <Shifts />
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
              <GroundStock />
            </Protect>
          }
        />
        <Route
          path="/owner/ledger"
          element={
            <Protect roles={["owner"]}>
              <DailyLedger />
            </Protect>
          }
        />
        <Route
          path="/owner/credit"
          element={
            <Protect roles={["owner"]}>
              <CreditCustomers />
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
        <Route
          path="/station"
          element={
            <Protect roles={["manager"]}>
              <Shifts />
            </Protect>
          }
        />
        <Route
          path="/station/stock"
          element={
            <Protect roles={["manager"]}>
              <GroundStock />
            </Protect>
          }
        />
        <Route
          path="/station/ledger"
          element={
            <Protect roles={["manager"]}>
              <DailyLedger />
            </Protect>
          }
        />
        <Route
          path="/station/credit"
          element={
            <Protect roles={["manager"]}>
              <CreditCustomers />
            </Protect>
          }
        />
        <Route
          path="/today"
          element={
            <Protect roles={["attendant"]}>
              <Shifts />
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
