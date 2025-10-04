import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFlight extends Document {
  aircraftId: Types.ObjectId;
  fechaHoraProg: Date;
  estado: 'draft' | 'abierto' | 'boarding' | 'cerrado' | 'despegado' | 'finalizado';
  zona: string;
  puerta?: string;
  turno_max_permitido: number;
  notas?: string;
  createdAt: Date;
  updatedAt: Date;
}

const flightSchema = new Schema<IFlight>(
  {
    aircraftId: {
      type: Schema.Types.ObjectId,
      ref: 'Aircraft',
      required: true,
    },
    fechaHoraProg: {
      type: Date,
      required: true,
    },
    estado: {
      type: String,
      enum: ['draft', 'abierto', 'boarding', 'cerrado', 'despegado', 'finalizado'],
      default: 'draft',
    },
    zona: {
      type: String,
      required: true,
      trim: true,
      default: 'A',
    },
    puerta: {
      type: String,
      trim: true,
    },
    turno_max_permitido: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    notas: {
      type: String,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

flightSchema.index({ estado: 1 });
flightSchema.index({ fechaHoraProg: 1 });
flightSchema.index({ aircraftId: 1 });

export const Flight = mongoose.model<IFlight>('Flight', flightSchema);
