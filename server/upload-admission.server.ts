import { UploadSlots } from './upload-slots.server';
import { env } from './env.server';
export const uploadAdmission=new UploadSlots(env.SCORE_UPLOAD_GLOBAL_MAX);
