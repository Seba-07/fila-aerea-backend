import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPasajero {
  nombre: string;
  apellido: string;
  rut: string;
  esMenor: boolean;
  esInfante?: boolean; // Menor de 2 años - no ocupa asiento
  autorizacion_url?: string; // URL del PDF de autorización para menores
}

export interface ITicket extends Document {
  userId: Types.ObjectId;
  codigo_ticket: string;
  pasajeros: IPasajero[];
  flightId?: Types.ObjectId;
  estado: 'disponible' | 'inscrito' | 'volado' | 'cancelado';
  bloqueado?: boolean; // Ticket comprado para bloquear asiento sin pasajero
  reprogramacion_pendiente?: {
    nuevo_flightId: Types.ObjectId;
    numero_circuito_anterior: number; // Previously: numero_tanda_anterior
    numero_circuito_nuevo: number; // Previously: numero_tanda_nueva
    fecha_reprogramacion: Date;
  };
  cambio_hora_pendiente?: {
    hora_anterior: Date;
    hora_nueva: Date;
    fecha_cambio: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const ticketSchema = new Schema<ITicket>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    codigo_ticket: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    pasajeros: [
      {
        nombre: {
          type: String,
          trim: true,
        },
        apellido: {
          type: String,
          trim: true,
        },
        rut: {
          type: String,
          trim: true,
        },
        esMenor: {
          type: Boolean,
          default: false,
        },
        esInfante: {
          type: Boolean,
          default: false,
        },
        autorizacion_url: {
          type: String,
          trim: true,
        },
      },
    ],
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
    },
    estado: {
      type: String,
      enum: ['disponible', 'inscrito', 'volado', 'cancelado'],
      default: 'disponible',
    },
    bloqueado: {
      type: Boolean,
      default: false,
    },
    reprogramacion_pendiente: {
      nuevo_flightId: {
        type: Schema.Types.ObjectId,
        ref: 'Flight',
      },
      numero_circuito_anterior: Number,
      numero_circuito_nuevo: Number,
      fecha_reprogramacion: Date,
    },
    cambio_hora_pendiente: {
      hora_anterior: Date,
      hora_nueva: Date,
      fecha_cambio: Date,
    },
  },
  {
    timestamps: true,
  }
);

ticketSchema.index({ userId: 1 });
ticketSchema.index({ codigo_ticket: 1 });
ticketSchema.index({ flightId: 1 });
ticketSchema.index({ estado: 1 });

export const Ticket = mongoose.model<ITicket>('Ticket', ticketSchema);
