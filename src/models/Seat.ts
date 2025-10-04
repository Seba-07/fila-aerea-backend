import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ISeat extends Document {
  flightId: Types.ObjectId;
  seatNumber: string;
  status: 'libre' | 'hold' | 'confirmado' | 'embarcado' | 'no_show';
  ticketId?: Types.ObjectId;
  hold_expires_at?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const seatSchema = new Schema<ISeat>(
  {
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
    },
    seatNumber: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ['libre', 'hold', 'confirmado', 'embarcado', 'no_show'],
      default: 'libre',
    },
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
    },
    hold_expires_at: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Índice único compuesto
seatSchema.index({ flightId: 1, seatNumber: 1 }, { unique: true });
seatSchema.index({ flightId: 1, status: 1 });
seatSchema.index({ ticketId: 1 });
seatSchema.index({ hold_expires_at: 1 }, { sparse: true });

// Validación: no permitir más de un asiento confirmado/embarcado por ticket
seatSchema.pre('save', async function (next) {
  if (
    this.ticketId &&
    (this.status === 'confirmado' || this.status === 'embarcado') &&
    this.isModified('ticketId')
  ) {
    const existingSeat = await mongoose.models.Seat.findOne({
      ticketId: this.ticketId,
      flightId: this.flightId,
      status: { $in: ['confirmado', 'embarcado'] },
      _id: { $ne: this._id },
    });

    if (existingSeat) {
      throw new Error('Este ticket ya tiene un asiento confirmado en este vuelo');
    }
  }
  next();
});

export const Seat = mongoose.model<ISeat>('Seat', seatSchema);
