import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Loading } from '../components/ui';
import { SessionProvider, useSession } from '../lib/session';
import { homeForRole } from '../lib/types';
import { RequireRole } from './components/RequireRole';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';

const AdminConsole = lazy(() =>
  import('./pages/admin/AdminConsole').then((m) => ({ default: m.AdminConsole })),
);
const FacultyCourses = lazy(() =>
  import('./pages/faculty/FacultyCourses').then((m) => ({ default: m.FacultyCourses })),
);
const FacultyWorkspace = lazy(() =>
  import('./pages/faculty/FacultyWorkspace').then((m) => ({ default: m.FacultyWorkspace })),
);
const FacultyPreview = lazy(() =>
  import('./pages/faculty/FacultyPreview').then((m) => ({ default: m.FacultyPreview })),
);
const HodConsole = lazy(() =>
  import('./pages/hod/HodConsole').then((m) => ({ default: m.HodConsole })),
);
const OversightConsole = lazy(() =>
  import('./pages/oversight/OversightConsole').then((m) => ({ default: m.OversightConsole })),
);
const StudentClassroom = lazy(() =>
  import('./pages/student/StudentClassroom').then((m) => ({ default: m.StudentClassroom })),
);
const StudentEndsem = lazy(() =>
  import('./pages/student/StudentEndsem').then((m) => ({ default: m.StudentEndsem })),
);
const StudentExam = lazy(() =>
  import('./pages/student/StudentExam').then((m) => ({ default: m.StudentExam })),
);
const StudentHome = lazy(() =>
  import('./pages/student/StudentHome').then((m) => ({ default: m.StudentHome })),
);
const StudentLab = lazy(() =>
  import('./pages/student/StudentLab').then((m) => ({ default: m.StudentLab })),
);
const StudentLabFile = lazy(() =>
  import('./pages/student/StudentLabFile').then((m) => ({ default: m.StudentLabFile })),
);
const StudentTest = lazy(() =>
  import('./pages/student/StudentTest').then((m) => ({ default: m.StudentTest })),
);
const VerifyLabFile = lazy(() =>
  import('./pages/VerifyLabFile').then((m) => ({ default: m.VerifyLabFile })),
);

function RootRedirect() {
  const { profile, restored } = useSession();
  if (!restored) {
    return (
      <main className="xe-auth-shell">
        <Loading label="Restoring session…" />
      </main>
    );
  }
  if (!profile) return <Navigate to="/login" replace />;
  return <Navigate to={homeForRole(profile.role)} replace />;
}

const router = createBrowserRouter(
  [
    { path: '/', element: <RootRedirect /> },
    { path: '/login', element: <Login /> },
    {
      path: '/admin/*',
      element: (
        <RequireRole roles={['super_admin']}>
          <Suspense fallback={<Loading />}>
            <AdminConsole />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/oversight/*',
      element: (
        <RequireRole roles={['vc', 'coe', 'dean']}>
          <Suspense fallback={<Loading />}>
            <OversightConsole />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/hod/*',
      element: (
        <RequireRole roles={['hod']}>
          <Suspense fallback={<Loading />}>
            <HodConsole />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/faculty',
      element: (
        <RequireRole roles={['faculty', 'hod']}>
          <Suspense fallback={<Loading />}>
            <FacultyCourses />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/faculty/c/:courseId/preview',
      element: (
        <RequireRole roles={['faculty', 'hod']}>
          <Suspense fallback={<Loading />}>
            <FacultyPreview />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/faculty/c/:courseId/:step',
      element: (
        <RequireRole roles={['faculty', 'hod']}>
          <Suspense fallback={<Loading />}>
            <FacultyWorkspace />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/faculty/*',
      element: (
        <RequireRole roles={['faculty', 'hod']}>
          <Suspense fallback={<Loading />}>
            <FacultyCourses />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentHome />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/lab/:sessionId',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentLab />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/test/:sessionId/:bank',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentTest />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/classroom',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentClassroom />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/lab-file',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentLabFile />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/endsem',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentEndsem />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/student/exam/:assessmentId',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentExam />
          </Suspense>
        </RequireRole>
      ),
    },
    {
      path: '/verify/:course/:student',
      element: (
        <Suspense fallback={<Loading />}>
          <VerifyLabFile />
        </Suspense>
      ),
    },
    {
      path: '/student/*',
      element: (
        <RequireRole roles={['student']}>
          <Suspense fallback={<Loading />}>
            <StudentHome />
          </Suspense>
        </RequireRole>
      ),
    },
    { path: '*', element: <NotFound /> },
  ],
  { basename: '/app' },
);

export function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
