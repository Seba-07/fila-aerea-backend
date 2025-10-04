import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  tipo: 'recordatorio' | 'boarding' | 'cambio';
  status: 'pendiente' | 'enviado' | 'error';
  scheduledAt: Date;
  sentAt?: Date;
  payload: Record<string, any>;
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
      enum: ['recordatorio', 'boarding', 'cambio'],
      required: true,
    },
    status: {
      type: String,
      enum: ['pendiente', 'enviado', 'error'],
      default: 'pendiente',
    },
    scheduledAt: {
      type: Date,
      required: true,
    },
    sentAt: {
      type: Date,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
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
