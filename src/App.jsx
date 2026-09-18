import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import AdminInviteOwner from "./pages/AdminInviteOwner";
import OwnerDashboard from "./pages/OwnerDashboard";
import OwnerStaff from "./pages/OwnerStaff";
import StationLedger from "./pages/StationLedger";
import CreditCustomers from "./pages/CreditCustomers";
import AttendantEntry from "./pages/AttendantEntry";
import { useAuth } from "./state/AuthContext";

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
        <div className="muted">Loading…</div>
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
      <Route path="/login" element={<Navigate to={HOME[profile.role] || "/"} replace />} />
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
          path="/owner/ledger"
          element={
            <Protect roles={["owner"]}>
              <StationLedger />
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
              <StationLedger />
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
              <AttendantEntry />
            </Protect>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to={HOME[profile.role] || "/login"} replace />} />
    </Routes>
  );
}
