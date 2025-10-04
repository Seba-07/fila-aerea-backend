import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBoardingPass extends Document {
  ticketId: Types.ObjectId;
  flightId: Types.ObjectId;
  seatNumber: string;
  qr_token: string;
  estado: 'emitido' | 'escaneado';
  scannedAt?: Date;
  scannedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const boardingPassSchema = new Schema<IBoardingPass>(
  {
    ticketId: {
      type: Schema.Types.ObjectId,
      ref: 'Ticket',
      required: true,
    },
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
    },
    seatNumber: {
      type: String,
      required: true,
      uppercase: true,
    },
    qr_token: {
      type: String,
      required: true,
      unique: true,
    },
    estado: {
      type: String,
      enum: ['emitido', 'escaneado'],
      default: 'emitido',
    },
    scannedAt: {
      type: Date,
    },
    scannedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  {
    timestamps: true,
  }
);

boardingPassSchema.index({ ticketId: 1, flightId: 1 });
boardingPassSchema.index({ qr_token: 1 });
boardingPassSchema.index({ estado: 1 });

export const BoardingPass = mongoose.model<IBoardingPass>(
  'BoardingPass',
  boardingPassSchema
);
