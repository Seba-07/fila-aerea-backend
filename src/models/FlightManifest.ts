import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IManifestPasajero {
  nombre: string;
  rut: string;
  ticketId: Types.ObjectId;
}

export interface IFlightManifest extends Document {
  flightId: Types.ObjectId;
  pasajeros: IManifestPasajero[];
  fecha_vuelo: Date;
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
    pasajeros: [
      {
        nombre: {
          type: String,
          required: true,
          trim: true,
        },
        rut: {
          type: String,
          required: true,
          trim: true,
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
