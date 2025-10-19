import mongoose, { Document, Schema, Types } from 'mongoose';

export interface IPayment extends Document {
  userId: Types.ObjectId;
  monto: number;
  metodo_pago: 'transferencia' | 'passline' | 'efectivo' | 'webpay' | 'socio' | 'combinado';
  cantidad_tickets: number;
  tipo: 'compra' | 'ajuste_positivo' | 'ajuste_negativo' | 'devolucion';
  descripcion?: string;
  fecha: Date;
  // Información adicional de Transbank/Webpay
  transactionId?: Types.ObjectId; // Referencia a Transaction
  tipo_tarjeta?: 'debito' | 'credito'; // VD = débito, VN = crédito
  cuotas?: number;
  codigo_autorizacion?: string;
  // Pagos combinados
  monto_transferencia?: number;
  monto_efectivo?: number;
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
      enum: ['transferencia', 'passline', 'efectivo', 'webpay', 'socio', 'combinado'],
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
    // Campos adicionales para Transbank/Webpay
    transactionId: {
      type: Schema.Types.ObjectId,
      ref: 'Transaction',
    },
    tipo_tarjeta: {
      type: String,
      enum: ['debito', 'credito'],
    },
    cuotas: {
      type: Number,
    },
    codigo_autorizacion: {
      type: String,
    },
    // Campos para pagos combinados
    monto_transferencia: {
      type: Number,
    },
    monto_efectivo: {
      type: Number,
    },
  },
  {
    timestamps: true,
  }
);

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
