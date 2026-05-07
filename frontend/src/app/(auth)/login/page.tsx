// Página de login — server component wrapper que cumple el requisito de Next.js 15
// de tener useSearchParams() dentro de un Suspense boundary.
import { Suspense } from 'react';

import { LoginForm } from './LoginForm';

export default function LoginPage(): JSX.Element {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
