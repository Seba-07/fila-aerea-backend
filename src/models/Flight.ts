import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IFlight extends Document {
  aircraftId: Types.ObjectId;
  numero_circuito: number; // Previously: numero_tanda (renamed for database migration)
  fecha_hora: Date;
  hora_prevista_salida?: Date;
  hora_inicio_vuelo?: Date;
  hora_arribo?: Date;
  capacidad_total: number;
  asientos_ocupados: number;
  estado: 'abierto' | 'en_vuelo' | 'finalizado' | 'reprogramado' | 'cancelado';
  razon_reprogramacion?: 'combustible' | 'meteorologia' | 'mantenimiento' | 'cancelacion_dia';
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
    numero_circuito: {
      type: Number,
      required: true,
      min: 1,
    },
    fecha_hora: {
      type: Date,
      required: true,
    },
    hora_prevista_salida: {
      type: Date,
    },
    hora_inicio_vuelo: {
      type: Date,
    },
    hora_arribo: {
      type: Date,
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
      enum: ['abierto', 'en_vuelo', 'finalizado', 'reprogramado', 'cancelado'],
      default: 'abierto',
    },
    razon_reprogramacion: {
      type: String,
      enum: ['combustible', 'meteorologia', 'mantenimiento', 'cancelacion_dia'],
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
flightSchema.index({ numero_circuito: 1 });

export const Flight = mongoose.model<IFlight>('Flight', flightSchema);
