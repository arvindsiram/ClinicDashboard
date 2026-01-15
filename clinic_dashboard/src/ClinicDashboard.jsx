import React, { useEffect, useState, useMemo } from 'react';
import { createClient } from '@supabase/supabase-js';
import { CheckCircle, Calendar, Phone, Activity, AlertCircle, ChevronRight, Clock, Mail } from 'lucide-react';

// --- INITIALIZATION ---
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

const N8N_CANCEL_WEBHOOK = import.meta.env.VITE_N8N_CANCEL_WEBHOOK;
const N8N_DONE_WEBHOOK = import.meta.env.VITE_N8N_DONE_WEBHOOK;

const ClinicDashboard = () => {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);

  const parseDate = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr.includes('-')) return new Date(dateStr);
    const clean = dateStr.replace(/(\d+)(st|nd|rd|th)/i, '$1');
    const d = new Date(`${clean} ${new Date().getFullYear()}`);
    return isNaN(d) ? null : d;
  };

  const fetchAppointments = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('appointments')
      .select('patient_name, email, phone_number, patient_symptoms, report_url, date, status, start_time')
      .eq('status', 'Scheduled');

    if (!error) {
      const sorted = (data || []).sort((a, b) => parseDate(a.date) - parseDate(b.date));
      setAppointments(sorted);
      if (sorted.length > 0 && !selectedDate) setSelectedDate(sorted[0].date);
    }
    setLoading(false);
  };

  useEffect(() => { fetchAppointments(); }, []);

  const grouped = useMemo(() => {
    return appointments.reduce((acc, appt) => {
      acc[appt.date] = [...(acc[appt.date] || []), appt];
      return acc;
    }, {});
  }, [appointments]);

  const handleAction = async (appt, actionType) => {
    if (!window.confirm(`Mark as ${actionType}?`)) return;

    const { error } = await supabase
      .from('appointments')
      .update({ status: actionType })
      .match({ patient_name: appt.patient_name, date: appt.date, start_time: appt.start_time });

    if (!error) {
      const url = actionType === 'Completed' ? N8N_DONE_WEBHOOK : N8N_CANCEL_WEBHOOK;
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...appt, 
          email: appt.email, // Pulling email from the fetched appointment row
          action_at: new Date().toISOString() 
        })
      });
      setAppointments(prev => prev.filter(a => a !== appt));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
          <Activity className="text-indigo-600" /> Clinic Dashboard
        </h1>
        <p className="text-slate-500">Active Schedule Management</p>
      </header>

      {loading ? (
        <div className="text-center py-20 animate-pulse">Loading schedule...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="space-y-2">
            {Object.keys(grouped).map(date => (
              <button 
                key={date} 
                onClick={() => setSelectedDate(date)}
                className={`w-full p-4 rounded-xl text-left border transition-all ${selectedDate === date ? 'bg-indigo-600 text-white' : 'bg-white'}`}
              >
                {date} ({grouped[date].length})
              </button>
            ))}
          </div>

          <div className="md:col-span-3 space-y-4">
            {grouped[selectedDate]?.map((appt, i) => (
              <div key={i} className="bg-white p-6 rounded-xl border shadow-sm flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold">{appt.patient_name}</h3>
                  <div className="flex gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1"><Phone size={14}/> {appt.phone_number}</span>
                    <span className="flex items-center gap-1"><Mail size={14}/> {appt.email}</span>
                  </div>
                  <p className="text-sm mt-2 bg-orange-50 p-2 rounded text-orange-700">{appt.patient_symptoms}</p>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="text-lg font-bold text-indigo-600">{appt.start_time}</div>
                  <div className="flex gap-2">
                    <button onClick={() => handleAction(appt, 'Cancelled')} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm">Cancel</button>
                    <button onClick={() => handleAction(appt, 'Completed')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">Done</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ClinicDashboard;
