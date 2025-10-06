import mongoose from 'mongoose';
import { Flight, Aircraft } from '../models';
import dotenv from 'dotenv';

dotenv.config();

const checkTandas = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI as string);
    console.log('Conectado a MongoDB');

    // Obtener todos los aviones
    const aircrafts = await Aircraft.find();
    console.log('\n=== AVIONES ===');
    aircrafts.forEach(a => {
      console.log(`${a.matricula} (ID: ${a._id})`);
    });

    // Obtener todos los vuelos agrupados por tanda
    const flights = await Flight.find().populate('aircraftId').sort({ numero_tanda: 1, 'aircraftId.matricula': 1 });

    const tandasMap: any = {};
    flights.forEach(f => {
      if (!tandasMap[f.numero_tanda]) {
        tandasMap[f.numero_tanda] = [];
      }
      tandasMap[f.numero_tanda].push({
        matricula: (f.aircraftId as any)?.matricula,
        aircraftId: f.aircraftId,
        estado: f.estado,
      });
    });

    console.log('\n=== TANDAS ===');
    Object.keys(tandasMap).sort((a, b) => Number(a) - Number(b)).forEach(tanda => {
      console.log(`\nTanda ${tanda}:`);
      tandasMap[tanda].forEach((v: any) => {
        console.log(`  - ${v.matricula} (${v.aircraftId}) [${v.estado}]`);
      });
    });

    // Verificar específicamente tanda 2
    console.log('\n=== VERIFICACIÓN TANDA 2 ===');
    const tanda2Flights = await Flight.find({ numero_tanda: 2 }).populate('aircraftId');
    console.log(`Vuelos en tanda 2: ${tanda2Flights.length}`);
    tanda2Flights.forEach(f => {
      console.log(`  - ${(f.aircraftId as any)?.matricula} (ID: ${f.aircraftId})`);
    });

    // Buscar si CC-SKE está en alguna tanda
    const skePlane = aircrafts.find(a => a.matricula === 'CC-SKE');
    if (skePlane) {
      console.log(`\n=== CC-SKE (${skePlane._id}) ===`);
      const skeFlights = await Flight.find({ aircraftId: skePlane._id }).sort({ numero_tanda: 1 });
      console.log(`Vuelos de CC-SKE: ${skeFlights.length}`);
      skeFlights.forEach(f => {
        console.log(`  - Tanda ${f.numero_tanda} [${f.estado}]`);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

checkTandas();
