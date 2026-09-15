import LoginForm from '@/components/admin/LoginForm';
import { dataMode } from '@/lib/data';

export const metadata = { title: 'Connexion' };

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  /* The demo credentials are shown in development only: a deployed login page
     never prints a password (src/lib/auth/session.js, demoAdminEnabled). */
  return <LoginForm next={next || ''} mode={dataMode()} demoHint={process.env.NODE_ENV !== 'production'} />;
}
