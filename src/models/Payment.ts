import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPayment extends Document {
  userId: Types.ObjectId;
  monto: number;
  metodo_pago: 'transferencia' | 'tarjeta' | 'efectivo';
  cantidad_tickets: number;
  tipo: 'compra' | 'ajuste_positivo' | 'ajuste_negativo' | 'devolucion';
  descripcion?: string;
  fecha: Date;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    monto: {
      type: Number,
      required: true,
    },
    metodo_pago: {
      type: String,
      enum: ['transferencia', 'tarjeta', 'efectivo'],
      required: true,
    },
    cantidad_tickets: {
      type: Number,
      required: true,
    },
    tipo: {
      type: String,
      enum: ['compra', 'ajuste_positivo', 'ajuste_negativo', 'devolucion'],
      default: 'compra',
    },
    descripcion: {
      type: String,
    },
    fecha: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
