import mongoose, { Schema, Document } from 'mongoose';

export interface IPilot extends Document {
  nombre: string;
  numero_licencia: string;
  activo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const pilotSchema = new Schema<IPilot>(
  {
    nombre: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    numero_licencia: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      maxlength: 50,
    },
    activo: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

pilotSchema.index({ nombre: 1 });
pilotSchema.index({ numero_licencia: 1 });

export const Pilot = mongoose.model<IPilot>('Pilot', pilotSchema);
