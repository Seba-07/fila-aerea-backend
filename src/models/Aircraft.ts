import mongoose, { Schema, Document } from 'mongoose';

export interface IAircraft extends Document {
  matricula: string;
  modelo: string;
  capacidad: number;
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
  },
  {
    timestamps: true,
  }
);

aircraftSchema.index({ matricula: 1 });

export const Aircraft = mongoose.model<IAircraft>('Aircraft', aircraftSchema);
