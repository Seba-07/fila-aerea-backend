import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import {
  getMe,
  updateTicket,
  removePassengerFromFlight,
  acceptRescheduling,
  rejectRescheduling,
  rescheduleToChosenCircuito,
  inscribeTicket,
  acceptTimeChange,
  rejectTimeChange,
  uploadAutorizacion,
} from '../controllers/userController';
import { authenticate } from '../middlewares/auth';

const router = Router();

// Configuración de multer para subir archivos
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/autorizaciones/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'autorizacion-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten archivos PDF'));
    }
  }
});

router.get('/me', authenticate, getMe);
router.patch('/tickets/:ticketId', authenticate, updateTicket);
router.delete('/tickets/:ticketId/flight', authenticate, removePassengerFromFlight);

// Inscripción de tickets
router.post('/tickets/:ticketId/inscribir', authenticate, inscribeTicket);

// Reprogramaciones
router.post('/tickets/:ticketId/accept-reschedule', authenticate, acceptRescheduling);
router.post('/tickets/:ticketId/reject-reschedule', authenticate, rejectRescheduling);
router.post('/tickets/:ticketId/reschedule', authenticate, rescheduleToChosenCircuito);

// Cambios de hora
router.post('/tickets/:ticketId/accept-time-change', authenticate, acceptTimeChange);
router.post('/tickets/:ticketId/reject-time-change', authenticate, rejectTimeChange);

// Subir autorización de menor
router.post('/tickets/:ticketId/autorizacion', authenticate, upload.single('autorizacion'), uploadAutorizacion);

export default router;
