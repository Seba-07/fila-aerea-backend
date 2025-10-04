import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter() {
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;

    if (!smtpHost || !smtpUser || !smtpPass) {
      logger.warn('⚠️  SMTP no configurado, emails serán simulados en logs');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  async sendOTP(email: string, code: string): Promise<void> {
    const subject = 'Tu código de verificación - Fila Aérea';
    const text = `Tu código de verificación es: ${code}\n\nExpira en 10 minutos.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563eb;">Fila Aérea</h2>
        <p>Tu código de verificación es:</p>
        <div style="background: #f3f4f6; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p style="color: #6b7280;">Este código expira en 10 minutos.</p>
        <p style="color: #6b7280; font-size: 12px;">Si no solicitaste este código, ignora este mensaje.</p>
      </div>
    `;

    await this.send({ to: email, subject, text, html });
  }

  async send({ to, subject, text, html }: EmailOptions): Promise<void> {
    if (!this.transporter) {
      logger.info(`📧 [SIMULADO] Email a ${to}:\n${text}`);
      return;
    }

    try {
      const info = await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@filaaerea.com',
        to,
        subject,
        text,
        html,
      });

      logger.info(`✅ Email enviado: ${info.messageId}`);
    } catch (error) {
      logger.error('❌ Error al enviar email:', error);
      throw error;
    }
  }
}

export const emailService = new EmailService();
