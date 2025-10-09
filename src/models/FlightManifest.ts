import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IManifestPasajero {
  nombre: string;
  rut: string;
  esMenor?: boolean;
  ticketId: Types.ObjectId;
}

export interface IFlightManifest extends Document {
  flightId: Types.ObjectId;
  numero_circuito: number; // Previously: numero_tanda
  pasajeros: IManifestPasajero[];
  fecha_vuelo: Date;
  hora_despegue: Date;
  hora_aterrizaje?: Date;
  pdf_path?: string;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const flightManifestSchema = new Schema<IFlightManifest>(
  {
    flightId: {
      type: Schema.Types.ObjectId,
      ref: 'Flight',
      required: true,
      unique: true,
    },
    numero_circuito: {
      type: Number,
      required: true,
    },
    pasajeros: [
      {
        nombre: {
          type: String,
          required: true,
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
        ticketId: {
          type: Schema.Types.ObjectId,
          ref: 'Ticket',
          required: true,
        },
      },
    ],
    fecha_vuelo: {
      type: Date,
      required: true,
    },
    hora_despegue: {
      type: Date,
      required: true,
    },
    hora_aterrizaje: {
      type: Date,
    },
    pdf_path: {
      type: String,
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

flightManifestSchema.index({ flightId: 1 });
flightManifestSchema.index({ fecha_vuelo: 1 });

export const FlightManifest = mongoose.model<IFlightManifest>(
  'FlightManifest',
  flightManifestSchema
);
