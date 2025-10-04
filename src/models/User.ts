import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  nombre: string;
  email: string;
  phone?: string;
  verificado: boolean;
  rol: 'passenger' | 'staff' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    nombre: {
      type: String,
      required: [true, 'El nombre es obligatorio'],
      trim: true,
      minlength: 2,
      maxlength: 100,
    },
    email: {
      type: String,
      required: [true, 'El email es obligatorio'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Email inválido'],
    },
    phone: {
      type: String,
      trim: true,
      match: [/^\+?[\d\s-()]+$/, 'Teléfono inválido'],
    },
    verificado: {
      type: Boolean,
      default: false,
    },
    rol: {
      type: String,
      enum: ['passenger', 'staff', 'admin'],
      default: 'passenger',
    },
  },
  {
    timestamps: true,
  }
);

userSchema.index({ email: 1 });

export const User = mongoose.model<IUser>('User', userSchema);
