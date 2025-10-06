import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFlight extends Document {
  aircraftId: Types.ObjectId;
  numero_tanda: number;
  fecha_hora: Date;
  capacidad_total: number;
  asientos_ocupados: number;
  estado: 'abierto' | 'en_vuelo' | 'finalizado' | 'reprogramado';
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
    numero_tanda: {
      type: Number,
      required: true,
      min: 1,
    },
    fecha_hora: {
      type: Date,
      required: true,
    },
    capacidad_total: {
      type: Number,
      required: true,
      min: 1,
    },
    asientos_ocupados: {
      type: Number,
      default: 0,
      min: 0,
    },
    estado: {
      type: String,
      enum: ['abierto', 'en_vuelo', 'finalizado', 'reprogramado'],
      default: 'abierto',
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
flightSchema.index({ fecha_hora: 1 });
flightSchema.index({ aircraftId: 1 });
flightSchema.index({ numero_tanda: 1 });

export const Flight = mongoose.model<IFlight>('Flight', flightSchema);
