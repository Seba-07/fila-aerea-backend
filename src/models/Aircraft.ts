import mongoose, { Schema, Document } from 'mongoose';

export interface IAircraft extends Document {
  alias: string;
  seats: number;
  layout?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const aircraftSchema = new Schema<IAircraft>(
  {
    alias: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    seats: {
      type: Number,
      required: true,
      min: 1,
      max: 50,
    },
    layout: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  }
);

aircraftSchema.index({ alias: 1 });

export const Aircraft = mongoose.model<IAircraft>('Aircraft', aircraftSchema);
