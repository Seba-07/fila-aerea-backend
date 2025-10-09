import mongoose, { Schema, Document } from 'mongoose';

export interface ISettings extends Document {
  duracion_circuito_minutos: number; // Previously: duracion_tanda_minutos
  max_circuitos_sin_reabastecimiento_default: number; // Previously: max_tandas_sin_reabastecimiento_default
  hora_inicio_primer_circuito?: Date; // Previously: hora_inicio_primera_tanda
  precio_ticket: number;
  timezone_offset_hours: number; // Offset de zona horaria (3 para verano UTC-3, 4 para invierno UTC-4)
  createdAt: Date;
  updatedAt: Date;
}

const settingsSchema = new Schema<ISettings>(
  {
    duracion_circuito_minutos: {
      type: Number,
      default: 20,
      min: 5,
      max: 60,
    },
    max_circuitos_sin_reabastecimiento_default: {
      type: Number,
      default: 4,
      min: 1,
      max: 20,
    },
    hora_inicio_primer_circuito: {
      type: Date,
    },
    precio_ticket: {
      type: Number,
      default: 15000,
      min: 0,
    },
    timezone_offset_hours: {
      type: Number,
      default: 3, // UTC-3 para horario de verano en Chile
      min: 0,
      max: 12,
    },
  },
  {
    timestamps: true,
  }
);

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
