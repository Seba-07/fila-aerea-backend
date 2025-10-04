import mongoose, { Schema, Document } from 'mongoose';

export interface IEventLog extends Document {
  type: string;
  entity: string;
  entityId?: string;
  userId?: string;
  payload: Record<string, any>;
  createdAt: Date;
}

const eventLogSchema = new Schema<IEventLog>(
  {
    type: {
      type: String,
      required: true,
      index: true,
    },
    entity: {
      type: String,
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      index: true,
    },
    userId: {
      type: String,
      index: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

eventLogSchema.index({ createdAt: -1 });
eventLogSchema.index({ type: 1, createdAt: -1 });

export const EventLog = mongoose.model<IEventLog>('EventLog', eventLogSchema);
