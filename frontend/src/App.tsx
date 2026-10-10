import { lazy, ReactNode, Suspense } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { homeFor, useAuth } from "./lib/auth";
import { Shell } from "./ui/Shell";
import { PageSkeleton } from "./ui";
import Login from "./pages/Login";
import ChangePassword from "./pages/ChangePassword";

const Common = {
  Menu: lazy(() => import("./pages/common/Menu")),
  Profile: lazy(() => import("./pages/common/Profile")),
  Notifications: lazy(() => import("./pages/common/Notifications")),
  Announcements: lazy(() => import("./pages/common/Announcements")),
  AnnouncementDetail: lazy(() => import("./pages/common/AnnouncementDetail")),
  Calendar: lazy(() => import("./pages/common/Calendar")),
};
const S = {
  Home: lazy(() => import("./pages/student/Home")),
  Schedule: lazy(() => import("./pages/common/Schedule")),
  Homework: lazy(() => import("./pages/student/Homework")),
  HomeworkDetail: lazy(() => import("./pages/student/HomeworkDetail")),
  Subjects: lazy(() => import("./pages/student/Subjects")),
  Grades: lazy(() => import("./pages/student/Grades")),
};
const T = {
  Home: lazy(() => import("./pages/teacher/Home")),
  Classes: lazy(() => import("./pages/teacher/Classes")),
  ClassDetail: lazy(() => import("./pages/teacher/ClassDetail")),
  Homework: lazy(() => import("./pages/teacher/Homework")),
  HomeworkForm: lazy(() => import("./pages/teacher/HomeworkForm")),
  HomeworkDetail: lazy(() => import("./pages/teacher/HomeworkDetail")),
  Review: lazy(() => import("./pages/teacher/Review")),
  Attendance: lazy(() => import("./pages/teacher/Attendance")),
  Face: lazy(() => import("./pages/teacher/Face")),
};
const D = {
  Home: lazy(() => import("./pages/director/Home")),
  Attendance: lazy(() => import("./pages/director/Attendance")),
  Reports: lazy(() => import("./pages/director/Reports")),
  Classes: lazy(() => import("./pages/director/Classes")),
  ClassDetail: lazy(() => import("./pages/director/ClassDetail")),
  People: lazy(() => import("./pages/director/People")),
  Teachers: lazy(() => import("./pages/director/Teachers")),
  TeacherDetail: lazy(() => import("./pages/director/TeacherDetail")),
  Students: lazy(() => import("./pages/director/Students")),
  Subjects: lazy(() => import("./pages/director/Subjects")),
  Homework: lazy(() => import("./pages/director/Homework")),
  Biometrics: lazy(() => import("./pages/director/Biometrics")),
  Devices: lazy(() => import("./pages/director/Devices")),
  Telegram: lazy(() => import("./pages/director/Telegram")),
  Settings: lazy(() => import("./pages/director/Settings")),
  Audit: lazy(() => import("./pages/director/Audit")),
};
const Kiosk = lazy(() => import("./pages/kiosk/Kiosk"));

function Guard({ roles, children }: { roles?: string[]; children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <Splash />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (user.must_change_password) return <ChangePassword forced />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <>{children}</>;
}

function Splash() {
  return (
    <div style={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
      <div className="brand-mark" style={{ width: 56, height: 56, borderRadius: 16, animation: "breathe 1.2s ease-in-out infinite" }} />
    </div>
  );
}

const Lazy = ({ children }: { children: ReactNode }) => <Suspense fallback={<main className="main"><PageSkeleton /></main>}>{children}</Suspense>;
const MGR = ["director", "admin"];

export default function App() {
  const { user, ready } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/kiosk" element={<Suspense fallback={<Splash />}><Kiosk /></Suspense>} />
      <Route path="/" element={ready ? <Navigate to={user ? homeFor(user.role) : "/login"} replace /> : <Splash />} />
      <Route element={<Guard><Shell /></Guard>}>
        <Route path="/menu" element={<Lazy><Common.Menu /></Lazy>} />
        <Route path="/profile" element={<Lazy><Common.Profile /></Lazy>} />
        <Route path="/notifications" element={<Lazy><Common.Notifications /></Lazy>} />
        <Route path="/announcements" element={<Lazy><Common.Announcements /></Lazy>} />
        <Route path="/announcements/:id" element={<Lazy><Common.AnnouncementDetail /></Lazy>} />
        <Route path="/calendar" element={<Lazy><Common.Calendar /></Lazy>} />

        <Route path="/s" element={<Guard roles={["student"]}><Lazy><S.Home /></Lazy></Guard>} />
        <Route path="/s/schedule" element={<Guard roles={["student"]}><Lazy><S.Schedule /></Lazy></Guard>} />
        <Route path="/s/homework" element={<Guard roles={["student"]}><Lazy><S.Homework /></Lazy></Guard>} />
        <Route path="/s/homework/:id" element={<Guard roles={["student"]}><Lazy><S.HomeworkDetail /></Lazy></Guard>} />
        <Route path="/s/subjects" element={<Guard roles={["student"]}><Lazy><S.Subjects /></Lazy></Guard>} />
        <Route path="/s/grades" element={<Guard roles={["student"]}><Lazy><S.Grades /></Lazy></Guard>} />

        <Route path="/t" element={<Guard roles={["teacher"]}><Lazy><T.Home /></Lazy></Guard>} />
        <Route path="/t/classes" element={<Guard roles={["teacher"]}><Lazy><T.Classes /></Lazy></Guard>} />
        <Route path="/t/classes/:id" element={<Guard roles={["teacher"]}><Lazy><T.ClassDetail /></Lazy></Guard>} />
        <Route path="/t/homework" element={<Guard roles={["teacher"]}><Lazy><T.Homework /></Lazy></Guard>} />
        <Route path="/t/homework/new" element={<Guard roles={["teacher"]}><Lazy><T.HomeworkForm /></Lazy></Guard>} />
        <Route path="/t/homework/:id" element={<Guard roles={["teacher"]}><Lazy><T.HomeworkDetail /></Lazy></Guard>} />
        <Route path="/t/homework/:id/edit" element={<Guard roles={["teacher"]}><Lazy><T.HomeworkForm /></Lazy></Guard>} />
        <Route path="/t/review/:id" element={<Guard roles={["teacher"]}><Lazy><T.Review /></Lazy></Guard>} />
        <Route path="/t/schedule" element={<Guard roles={["teacher"]}><Lazy><S.Schedule /></Lazy></Guard>} />
        <Route path="/t/attendance" element={<Guard roles={["teacher"]}><Lazy><T.Attendance /></Lazy></Guard>} />
        <Route path="/t/face" element={<Guard roles={["teacher"]}><Lazy><T.Face /></Lazy></Guard>} />

        <Route path="/d" element={<Guard roles={MGR}><Lazy><D.Home /></Lazy></Guard>} />
        <Route path="/d/attendance" element={<Guard roles={MGR}><Lazy><D.Attendance /></Lazy></Guard>} />
        <Route path="/d/reports" element={<Guard roles={MGR}><Lazy><D.Reports /></Lazy></Guard>} />
        <Route path="/d/classes" element={<Guard roles={MGR}><Lazy><D.Classes /></Lazy></Guard>} />
        <Route path="/d/classes/:id" element={<Guard roles={MGR}><Lazy><D.ClassDetail /></Lazy></Guard>} />
        <Route path="/d/people" element={<Guard roles={MGR}><Lazy><D.People /></Lazy></Guard>} />
        <Route path="/d/teachers" element={<Guard roles={MGR}><Lazy><D.Teachers /></Lazy></Guard>} />
        <Route path="/d/teachers/:id" element={<Guard roles={MGR}><Lazy><D.TeacherDetail /></Lazy></Guard>} />
        <Route path="/d/students" element={<Guard roles={MGR}><Lazy><D.Students /></Lazy></Guard>} />
        <Route path="/d/subjects" element={<Guard roles={MGR}><Lazy><D.Subjects /></Lazy></Guard>} />
        <Route path="/d/homework" element={<Guard roles={MGR}><Lazy><D.Homework /></Lazy></Guard>} />
        <Route path="/d/homework/:id" element={<Guard roles={MGR}><Lazy><T.HomeworkDetail readOnly /></Lazy></Guard>} />
        <Route path="/d/biometrics" element={<Guard roles={MGR}><Lazy><D.Biometrics /></Lazy></Guard>} />
        <Route path="/d/devices" element={<Guard roles={MGR}><Lazy><D.Devices /></Lazy></Guard>} />
        <Route path="/d/telegram" element={<Guard roles={MGR}><Lazy><D.Telegram /></Lazy></Guard>} />
        <Route path="/d/settings" element={<Guard roles={MGR}><Lazy><D.Settings /></Lazy></Guard>} />
        <Route path="/d/audit" element={<Guard roles={MGR}><Lazy><D.Audit /></Lazy></Guard>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
