import { createFileRoute, notFound } from '@tanstack/react-router';
import { confirmAdmin } from '../admin-access';
import { AdminPage } from '../admin-ui';
export const Route=createFileRoute('/admin/$')({beforeLoad:async()=>{if(!await confirmAdmin())throw notFound();},component:AdminPage});
