import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';
import { ITicket } from '../models/Ticket';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

interface SendTicketsEmailParams {
  to: string;
  tickets: ITicket[];
  nombreComprador: string;
  cantidadTickets: number;
  montoTotal: number;
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

  async sendTickets({
    to,
    tickets,
    nombreComprador,
    cantidadTickets,
    montoTotal,
  }: SendTicketsEmailParams): Promise<void> {
    const APP_URL = process.env.FRONTEND_URL || 'https://fila-aerea-frontend.vercel.app';

    // Generar lista de tickets
    const ticketsList = tickets.map((ticket, index) => {
      const pasajero = ticket.pasajeros[0];
      return `
        <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 15px; margin: 10px 0; border-radius: 5px;">
          <h3 style="margin: 0 0 10px 0; color: #2563eb;">Ticket ${index + 1}</h3>
          <p style="margin: 5px 0;"><strong>Código:</strong> ${ticket.codigo_ticket}</p>
          <p style="margin: 5px 0;"><strong>Pasajero:</strong> ${pasajero.nombre} ${pasajero.apellido}</p>
          <p style="margin: 5px 0;"><strong>RUT:</strong> ${pasajero.rut}</p>
          ${pasajero.esMenor ? '<p style="margin: 5px 0; color: #f59e0b;"><strong>⚠️ MENOR DE EDAD</strong></p>' : ''}
          <p style="margin: 5px 0;"><strong>Estado:</strong> <span style="color: ${ticket.estado === 'disponible' ? '#10b981' : '#3b82f6'};">${ticket.estado === 'disponible' ? 'Disponible' : 'Asignado'}</span></p>
        </div>
      `;
    }).join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Tus Tickets de Vuelo - Club Aéreo de Castro</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #2563eb; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">✈️ Club Aéreo de Castro</h1>
        </div>

        <div style="background-color: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 10px 10px;">
          <h2 style="color: #2563eb; margin-top: 0;">¡Compra Exitosa!</h2>

          <p>Hola <strong>${nombreComprador}</strong>,</p>

          <p>Tu compra ha sido procesada exitosamente. A continuación encontrarás los detalles de tus tickets:</p>

          <div style="background-color: #eff6ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1e40af;">Resumen de Compra</h3>
            <p style="margin: 5px 0;"><strong>Cantidad de tickets:</strong> ${cantidadTickets}</p>
            <p style="margin: 5px 0;"><strong>Monto total:</strong> $${montoTotal.toLocaleString('es-CL')}</p>
          </div>

          <h3 style="color: #2563eb;">Tus Tickets</h3>
          ${ticketsList}

          <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #92400e;">
              <strong>⚠️ Importante:</strong> Los horarios de los vuelos pueden sufrir cambios debido a condiciones climáticas u operacionales.
              Te recomendamos revisar la aplicación regularmente para estar al tanto de cualquier actualización.
            </p>
          </div>

          <div style="background-color: #dbeafe; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #1e40af;">
              <strong>📱 Accede a la aplicación:</strong> Podrás ver tus tickets y recibir notificaciones de embarque en tiempo real visitando
              <a href="${APP_URL}" style="color: #2563eb; text-decoration: underline;">${APP_URL}</a>
            </p>
          </div>

          <div style="background-color: #dcfce7; border-left: 4px solid #10b981; padding: 15px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 0; color: #166534;">
              <strong>🔔 Notificación de embarque:</strong> Recibirás una notificación 15 minutos antes de tu hora de vuelo programada.
              Asegúrate de estar atento a las notificaciones en la aplicación.
            </p>
          </div>

          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 30px 0;">

          <p style="color: #6b7280; font-size: 14px; text-align: center; margin: 0;">
            Si tienes alguna pregunta, no dudes en contactarnos.<br>
            <strong>Club Aéreo de Castro</strong><br>
            Castro, Chiloé
          </p>
        </div>
      </body>
      </html>
    `;

    const textContent = `
Club Aéreo de Castro - Tus Tickets de Vuelo

Hola ${nombreComprador},

Tu compra ha sido procesada exitosamente.

Resumen:
- Cantidad de tickets: ${cantidadTickets}
- Monto total: $${montoTotal.toLocaleString('es-CL')}

Tus Tickets:
${tickets.map((t, i) => {
  const p = t.pasajeros[0];
  return `\nTicket ${i + 1}:
  Código: ${t.codigo_ticket}
  Pasajero: ${p.nombre} ${p.apellido}
  RUT: ${p.rut}
  ${p.esMenor ? 'MENOR DE EDAD' : ''}
  Estado: ${t.estado}`;
}).join('\n')}

IMPORTANTE: Los horarios de los vuelos pueden sufrir cambios debido a condiciones climáticas u operacionales.
Te recomendamos revisar la aplicación regularmente para estar al tanto de cualquier actualización.

Accede a la aplicación en: ${APP_URL}

Recibirás una notificación 15 minutos antes de tu hora de vuelo programada.

Club Aéreo de Castro
Castro, Chiloé
    `;

    await this.send({
      to,
      subject: '✈️ Tus Tickets de Vuelo - Club Aéreo de Castro',
      text: textContent,
      html: htmlContent,
    });

    logger.info(`📧 Email de tickets enviado a ${to} - ${cantidadTickets} tickets`);
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
