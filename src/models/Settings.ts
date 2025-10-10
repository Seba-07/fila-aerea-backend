import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface ISettings extends Document {
  duracion_circuito_minutos: number; // Previously: duracion_tanda_minutos
  max_circuitos_sin_reabastecimiento_default: number; // Previously: max_tandas_sin_reabastecimiento_default
  hora_inicio_primer_circuito?: Date; // Previously: hora_inicio_primera_tanda
  precio_ticket: number;
  timezone_offset_hours: number; // Offset de zona horaria (3 para verano UTC-3, 4 para invierno UTC-4)
  minutos_antes_embarque: number; // Minutos antes de la hora prevista para notificar embarque
  admin_password: string; // Contraseña del administrador
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
    minutos_antes_embarque: {
      type: Number,
      default: 15, // 15 minutos antes del vuelo para notificar embarque
      min: 5,
      max: 60,
    },
    admin_password: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Helper para hashear la contraseña admin al crear o actualizar
settingsSchema.pre('save', async function(next) {
  if (this.isModified('admin_password')) {
    // Solo hashear si la contraseña no está ya hasheada (no empieza con $2a$)
    if (!this.admin_password.startsWith('$2a$')) {
      this.admin_password = await bcrypt.hash(this.admin_password, 10);
    }
  }
  next();
});

// Método estático para inicializar settings con contraseña hasheada por defecto
settingsSchema.statics.getOrCreateDefault = async function() {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({
      duracion_circuito_minutos: 20,
      max_circuitos_sin_reabastecimiento_default: 4,
      precio_ticket: 15000,
      timezone_offset_hours: 3,
      minutos_antes_embarque: 15,
      admin_password: 'admin123', // Se hasheará automáticamente por el pre-save hook
    });
  }
  return settings;
};

export const Settings = mongoose.model<ISettings>('Settings', settingsSchema);
