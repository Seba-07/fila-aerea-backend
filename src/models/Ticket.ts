import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ITicket extends Document {
  userId: Types.ObjectId;
  codigo_ticket: string;
  turno_global: number;
  estado: 'activo' | 'usado' | 'anulado';
  cooldownUntil?: Date;
  seatChanges: number;
  lastSeatChangeAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    codigo_ticket: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    turno_global: {
      type: Number,
      required: true,
      min: 1,
    },
    estado: {
      type: String,
      enum: ['activo', 'usado', 'anulado'],
      default: 'activo',
    },
    cooldownUntil: {
      type: Date,
    },
    seatChanges: {
      type: Number,
      default: 0,
    },
    lastSeatChangeAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ userId: 1 });
ticketSchema.index({ codigo_ticket: 1 });
ticketSchema.index({ turno_global: 1 });
ticketSchema.index({ estado: 1 });

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);
