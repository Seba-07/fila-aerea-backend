import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPasajero {
  nombre: string;
  apellido: string;
  rut: string;
  esMenor: boolean;
}

export interface ITicket extends Document {
  userId: Types.ObjectId;
  codigo_ticket: string;
  pasajeros: IPasajero[];
  flightId?: Types.ObjectId;
  estado: 'disponible' | 'asignado' | 'inscrito' | 'volado' | 'cancelado';
  reprogramacion_pendiente?: {
    nuevo_flightId: Types.ObjectId;
    numero_tanda_anterior: number;
    numero_tanda_nueva: number;
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
      },
    ],
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
    },
    estado: {
      type: String,
      enum: ['disponible', 'asignado', 'inscrito', 'volado', 'cancelado'],
      default: 'disponible',
    },
    reprogramacion_pendiente: {
      nuevo_flightId: {
        type: Schema.Types.ObjectId,
        ref: 'Flight',
      },
      numero_tanda_anterior: Number,
      numero_tanda_nueva: Number,
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
