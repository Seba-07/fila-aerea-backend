import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  tipo: 'recordatorio' | 'boarding' | 'cambio' | 'reprogramacion' | 'cancelacion' | 'reabastecimiento_pendiente' | 'cambio_hora';
  status: 'pendiente' | 'enviado' | 'error';
  titulo?: string;
  mensaje?: string;
  leido?: boolean;
  scheduledAt?: Date;
  sentAt?: Date;
  payload?: Record<string, any>;
  metadata?: Record<string, any>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    tipo: {
      type: String,
      enum: ['recordatorio', 'boarding', 'cambio', 'reprogramacion', 'cancelacion', 'reabastecimiento_pendiente', 'cambio_hora'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pendiente', 'enviado', 'error'],
      default: 'pendiente',
    },
    titulo: {
      type: String,
    },
    mensaje: {
      type: String,
    },
    leido: {
      type: Boolean,
      default: false,
    },
    scheduledAt: {
      type: Date,
    },
    sentAt: {
      type: Date,
    },
    payload: {
      type: Schema.Types.Mixed,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
    error: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({ userId: 1, status: 1 });
notificationSchema.index({ scheduledAt: 1, status: 1 });

export const Notification = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);
