import { CalendarDays } from 'lucide-react';
import { Card } from '../../components/ui';
import { PageHead } from './AdminLayout';

export default function Appointments() {
  return (
    <div className="mx-auto max-w-5xl">
      <PageHead title="Turnos" />
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-fog text-petrol-3"><CalendarDays className="size-8" /></div>
        <h2 className="text-xl font-bold text-petrol">Próximamente</h2>
        <p className="mt-2 max-w-md text-sm text-slate">La gestión de turnos estará disponible en una futura actualización.</p>
      </Card>
    </div>
  );
}
