import mongoose, { Schema, Document } from 'mongoose';

export interface IAircraft extends Document {
  matricula: string;
  modelo: string;
  capacidad: number;
  habilitado: boolean;
  max_circuitos_sin_reabastecimiento?: number; // Previously: max_tandas_sin_reabastecimiento
  createdAt: Date;
  updatedAt: Date;
}

const aircraftSchema = new Schema<IAircraft>(
  {
    matricula: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    modelo: {
      type: String,
      required: true,
      trim: true,
    },
    capacidad: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },
    habilitado: {
      type: Boolean,
      default: true,
    },
    max_circuitos_sin_reabastecimiento: {
      type: Number,
      min: 1,
    },
  },
  {
    timestamps: true,
  }
);

aircraftSchema.index({ matricula: 1 });

export const Aircraft = mongoose.model<IAircraft>('Aircraft', aircraftSchema);
