import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  duracion_tanda_minutos: number;
  max_tandas_sin_reabastecimiento_default: number;
  hora_inicio_primera_tanda?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    duracion_tanda_minutos: {
      type: Number,
      default: 20,
      min: 5,
      max: 60,
    },
    max_tandas_sin_reabastecimiento_default: {
      type: Number,
      default: 4,
      min: 1,
      max: 20,
    },
    hora_inicio_primera_tanda: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
