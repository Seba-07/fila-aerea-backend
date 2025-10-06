import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IRefueling extends Document {
  aircraftId: Types.ObjectId;
  fecha: Date;
  litros: number;
  costo?: number;
  notas?: string;
  registradoPor: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const refuelingSchema = new Schema<IRefueling>(
  {
    aircraftId: {
      type: Schema.Types.ObjectId,
      ref: 'Aircraft',
      required: true,
    },
    fecha: {
      type: Date,
      required: true,
      default: Date.now,
    },
    litros: {
      type: Number,
      required: true,
      min: 0,
    },
    costo: {
      type: Number,
      min: 0,
    },
    notas: {
      type: String,
      maxlength: 500,
    },
    registradoPor: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

refuelingSchema.index({ aircraftId: 1, fecha: -1 });

export const Refueling = mongoose.model<IRefueling>('Refueling', refuelingSchema);
