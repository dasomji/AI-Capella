import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { env } from './env.server';
export interface Mail { idempotencyKey?: string; to: string; subject: string; text: string }
export interface MailAdapter { send(mail: Mail): Promise<void> }
export class CaptureMail implements MailAdapter {
  readonly messages: Mail[] = [];
  async send(mail: Mail) { this.messages.push(mail); }
}
export const captureMail = new CaptureMail();
export const mailer: MailAdapter = env.MAIL_TRANSPORT === 'capture' ? captureMail : env.MAIL_TRANSPORT === 'resend' ? {
  async send(mail) { const {idempotencyKey,...message}=mail; const result = await new Resend(env.RESEND_API_KEY).emails.send({ from: env.MAIL_FROM, ...message }, {idempotencyKey}); if (result.error) throw new Error('Email delivery unavailable'); },
} : { async send(mail) { await nodemailer.createTransport(env.SMTP_URL).sendMail({ from: env.MAIL_FROM, ...mail }); } };
export function accountMail(to: string, url: string, language: string, kind: 'verify' | 'reset'): Mail {
  const de = language === 'de';
  const subject = kind === 'verify' ? (de ? 'E-Mail bestätigen' : 'Verify your email') : (de ? 'Passwort zurücksetzen' : 'Reset your password');
  return { to, subject: `LightScore – ${subject}`, text: `${subject}:\n${url}\n\n${de ? 'Wenn du dies nicht angefordert hast, ignoriere diese Nachricht.' : 'If you did not request this, ignore this message.'}` };
}
