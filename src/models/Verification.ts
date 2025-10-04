import mongoose, { Schema, Document } from 'mongoose';

export interface IVerification extends Document {
  email: string;
  code: string;
  expiresAt: Date;
  createdAt: Date;
}

const verificationSchema = new Schema<IVerification>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      length: 6,
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
    },
  },
  {
    timestamps: true,
  }
);

// TTL index para auto-eliminación
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
verificationSchema.index({ email: 1, code: 1 });

export const Verification = mongoose.model<IVerification>(
  'Verification',
  verificationSchema
);
