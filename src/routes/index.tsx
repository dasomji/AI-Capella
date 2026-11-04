import { createFileRoute } from '@tanstack/react-router';
import { AuthPage } from '../auth-ui';
export const Route = createFileRoute('/')({ component: AuthPage });
