import { logger } from '../utils/logger';

interface PushMessage {
  userId: string;
  title: string;
  message: string;
  data?: Record<string, any>;
}

interface PushProvider {
  send(message: PushMessage): Promise<void>;
}

// Adaptador OneSignal
class OneSignalProvider implements PushProvider {
  private appId: string;
  private apiKey: string;

  constructor() {
    this.appId = process.env.ONESIGNAL_APP_ID || '';
    this.apiKey = process.env.ONESIGNAL_API_KEY || '';
  }

  async send(message: PushMessage): Promise<void> {
    if (!this.appId || !this.apiKey) {
      logger.warn('⚠️  OneSignal no configurado');
      return;
    }

    try {
      const response = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Basic ${this.apiKey}`,
        },
        body: JSON.stringify({
          app_id: this.appId,
          include_external_user_ids: [message.userId],
          headings: { en: message.title },
          contents: { en: message.message },
          data: message.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`OneSignal error: ${response.statusText}`);
      }

      logger.info(`✅ Push enviado via OneSignal a usuario ${message.userId}`);
    } catch (error) {
      logger.error('❌ Error al enviar push via OneSignal:', error);
      throw error;
    }
  }
}

// Adaptador FCM
class FCMProvider implements PushProvider {
  private serverKey: string;

  constructor() {
    this.serverKey = process.env.FCM_SERVER_KEY || '';
  }

  async send(message: PushMessage): Promise<void> {
    if (!this.serverKey) {
      logger.warn('⚠️  FCM no configurado');
      return;
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `key=${this.serverKey}`,
        },
        body: JSON.stringify({
          to: `/topics/user_${message.userId}`,
          notification: {
            title: message.title,
            body: message.message,
          },
          data: message.data,
        }),
      });

      if (!response.ok) {
        throw new Error(`FCM error: ${response.statusText}`);
      }

      logger.info(`✅ Push enviado via FCM a usuario ${message.userId}`);
    } catch (error) {
      logger.error('❌ Error al enviar push via FCM:', error);
      throw error;
    }
  }
}

// Adaptador Mock (logs)
class MockProvider implements PushProvider {
  async send(message: PushMessage): Promise<void> {
    logger.info(
      `🔔 [SIMULADO] Push a usuario ${message.userId}: ${message.title} - ${message.message}`
    );
  }
}

class PushService {
  private provider: PushProvider;

  constructor() {
    const providerType = process.env.PUSH_PROVIDER || 'none';

    switch (providerType) {
      case 'onesignal':
        this.provider = new OneSignalProvider();
        break;
      case 'fcm':
        this.provider = new FCMProvider();
        break;
      default:
        this.provider = new MockProvider();
    }

    logger.info(`📱 Push provider: ${providerType}`);
  }

  async sendToUser(
    userId: string,
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    await this.provider.send({ userId, title, message, data });
  }

  async sendBoardingNotification(
    userId: string,
    flightId: string,
    zona: string
  ): Promise<void> {
    await this.sendToUser(
      userId,
      '¡Embarque abierto!',
      `Tu vuelo está listo para embarcar en zona ${zona}`,
      { type: 'boarding', flightId }
    );
  }

  async sendReminderNotification(
    userId: string,
    flightId: string,
    minutes: number
  ): Promise<void> {
    await this.sendToUser(
      userId,
      `Tu vuelo sale en ${minutes} minutos`,
      'Dirígete a la zona de embarque',
      { type: 'recordatorio', flightId, minutes }
    );
  }

  async sendChangeNotification(
    userId: string,
    flightId: string,
    changeType: string,
    details: string
  ): Promise<void> {
    await this.sendToUser(
      userId,
      'Cambio en tu vuelo',
      details,
      { type: 'cambio', flightId, changeType }
    );
  }
}

export const pushService = new PushService();
