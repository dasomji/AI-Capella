import { createFileRoute } from '@tanstack/react-router';
import { AdminPage } from '../admin-ui';
export const Route=createFileRoute('/admin/$')({component:AdminPage});
