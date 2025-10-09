import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IReservation extends Document {
  flightId: Types.ObjectId;
  cantidadPasajeros: number;
  status: 'active' | 'expired' | 'confirmed' | 'cancelled';
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const reservationSchema = new Schema<IReservation>(
  {
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
    },
    cantidadPasajeros: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['active', 'expired', 'confirmed', 'cancelled'],
      default: 'active',
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient querying
reservationSchema.index({ flightId: 1 });
reservationSchema.index({ status: 1 });
reservationSchema.index({ expiresAt: 1 });
reservationSchema.index({ flightId: 1, status: 1 });

export const Reservation = mongoose.model<IReservation>('Reservation', reservationSchema);
